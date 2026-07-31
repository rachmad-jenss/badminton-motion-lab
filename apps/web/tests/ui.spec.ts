import { expect, test, type Page } from "@playwright/test";

const AGENT_URL = "http://127.0.0.1:8787";
const HEALTH_URL = /http:\/\/127\.0\.0\.1:8787\/health\/?$/;

async function mockHealth(page: Page, overrides: Record<string, unknown> = {}) {
  await page.route(HEALTH_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        ok: true,
        agentVersion: "test",
        pipelineVersion: "test",
        pairingCode: "test-pairing-code",
        pairingExpiresAt: 4_000_000_000,
        poseModelPresent: true,
        ...overrides,
      }),
    });
  });
}

async function clearAgentStorage(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem("bml.agentUrl");
    localStorage.removeItem("bml.agentToken");
  });
}

async function seedPairedBrowser(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("bml.agentToken", "paired-token");
  });
}

async function gotoWithAgentReady(page: Page, path: string) {
  const healthOk = page.waitForResponse(
    (response) => response.url().startsWith(`${AGENT_URL}/health`) && response.ok(),
  );
  await page.goto(path);
  await healthOk;
  await expect(page.locator(".status-badge", { hasText: "Ready to analyze" }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test("home explains what remains available while agent is offline", async ({ page }) => {
  await page.route(`${AGENT_URL}/health`, async (route) => {
    await route.fulfill({ status: 503, body: "offline" });
  });

  await page.goto("/");

  await expect(page.getByRole("status")).toContainText("Setup is not running yet");
  await expect(page.getByRole("link", { name: "Open setup" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toContainText("Progress");
});

test("paired home points to choosing a video", async ({ page }) => {
  await seedPairedBrowser(page);
  await mockHealth(page);

  const healthOk = page.waitForResponse(
    (response) => response.url().startsWith(`${AGENT_URL}/health`) && response.ok(),
  );
  await page.goto("/");
  await healthOk;

  await expect(page.getByRole("link", { name: "Choose a video" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your next step" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Choose a video →/ })).toBeVisible();
});

test("pairing failure is announced inline and remains retryable", async ({ page }) => {
  await clearAgentStorage(page);
  await mockHealth(page);
  await page.route(`${AGENT_URL}/pair`, async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Invalid pairing code" }),
    });
  });

  await gotoWithAgentReady(page, "/agent");
  await expect(page.getByLabel("Pairing code")).toHaveValue("test-pairing-code");
  const pairButton = page.getByRole("button", { name: "Pair browser ↔ agent" });
  await expect(pairButton).toBeEnabled();
  await pairButton.click();

  await expect(page.locator("p[role='alert']")).toContainText("Invalid pairing code");
  await expect(pairButton).toBeEnabled();
});

test("Analyze requires pairing and exposes dominant-hand input", async ({ page }) => {
  await clearAgentStorage(page);
  await mockHealth(page);

  await gotoWithAgentReady(page, "/analyze");

  await expect(page.getByRole("combobox", { name: /Dominant hand/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Analyze this video" })).toBeDisabled();
  await expect(page.locator("div.notice[role='alert']")).toContainText("Pair this browser");
});

test("Compare does not call protected series endpoints before pairing", async ({ page }) => {
  await clearAgentStorage(page);
  await mockHealth(page);
  const protectedRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/metrics/series")) protectedRequests.push(request.url());
  });

  await gotoWithAgentReady(page, "/compare");

  await expect(page.getByRole("status")).toContainText("Pair this browser");
  expect(protectedRequests).toHaveLength(0);
});

test("all primary routes share navigation and fit a narrow viewport", async ({ page }) => {
  await mockHealth(page);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of ["/", "/agent", "/analyze", "/compare", "/capture-guide"]) {
    await page.goto(route);
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    await expect(nav).toContainText("Video guide");
    await expect(nav.locator("a[aria-current='page']")).toHaveCount(1);
    expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth + 1)).toBe(true);
    if (route === "/") {
      await page.keyboard.press("Tab");
      const brandHome = page.getByRole("link", { name: "Badminton Motion Lab home" });
      await expect(brandHome).toBeFocused();
      expect(await brandHome.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
    }
  }

  expect(consoleErrors).toEqual([]);
  await page.setViewportSize({ width: 1280, height: 720 });
});

test("background theme changes the visual shell and persists", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");

  const theme = page.locator('summary[aria-label="Background theme"]');
  const shell = page.locator(".visual-shell");
  const pairInMotion = page.locator(".background-menu").getByRole("menuitemradio", {
    name: "Pair in motion",
  });

  await expect(shell).toHaveAttribute("data-content-side", "left");

  await theme.click();
  await expect(pairInMotion).toBeVisible();
  await pairInMotion.click();

  // Menu closes on select; assert shell + storage instead of hidden aria-checked.
  await expect(shell).toHaveAttribute("data-content-side", "right");
  await expect(page.evaluate(() => localStorage.getItem("bml.backgroundPreset"))).resolves.toBe(
    "pair-in-motion",
  );

  await page.reload();

  await expect(shell).toHaveAttribute("data-content-side", "right");
  await page.locator('summary[aria-label="Background theme"]').click();
  await expect(
    page.locator(".background-menu").getByRole("menuitemradio", { name: "Pair in motion" }),
  ).toHaveAttribute("aria-checked", "true");
});

test("color theme follows system and supports explicit light/dark overrides", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  const theme = page.locator('summary[aria-label="Color theme"]');
  const themeOptions = page.locator(".icon-menu-panel button");
  await theme.click();
  await expect(themeOptions.nth(0)).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "bml-dark");

  await themeOptions.nth(1).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "bml-light");
  await expect(page.evaluate(() => localStorage.getItem("bml.themeMode"))).resolves.toBe("light");

  await page.reload();

  await page.locator('summary[aria-label="Color theme"]').click();
  await expect(themeOptions.nth(1)).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "bml-light");
});

test("changing the Agent URL clears stale pairing readiness", async ({ page }) => {
  await clearAgentStorage(page);
  await mockHealth(page);

  await gotoWithAgentReady(page, "/agent");
  await expect(page.getByLabel("Pairing code")).toHaveValue("test-pairing-code");

  await page.getByLabel("Agent URL").fill("http://127.0.0.1:9999");

  await expect(page.getByLabel("Pairing code")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Pair browser ↔ agent" })).toBeDisabled();
});

test("analysis success exposes findings, evidence, and withheld metrics", async ({ page }) => {
  await seedPairedBrowser(page);
  await mockHealth(page);
  await page.route(`${AGENT_URL}/captures/register`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ captureId: "capture-1" }),
    });
  });
  await page.route(`${AGENT_URL}/captures/import`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ captureId: "capture-1" }),
    });
  });
  await page.route(`${AGENT_URL}/analyze`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        analysisRunId: "run-1",
        agentMediaUrl: "/media/run-1",
        summary: {
          metrics: [
            {
              metricId: "elbow_angle_contact",
              value: 92,
              unit: "deg",
              withheld: false,
              confidence: 0.91,
              evidenceFrameIndex: 12,
            },
            {
              metricId: "footwork_quality",
              value: null,
              unit: "score",
              withheld: true,
              confidence: 0.4,
              limitation: "Court validation failed",
            },
          ],
          findings: [
            {
              id: "finding-1",
              title: "Contact point is stable",
              observation: "The contact window stayed consistent.",
              confidence: 0.88,
              evidenceFrameIndices: [12],
            },
          ],
          events: { mode: "detected", events: [] },
          court: { valid: false, method: "fixture" },
          quality: { passed: true },
          pose: { adapter: "mediapipe", detectedFrames: 20, totalFrames: 20 },
        },
      }),
    });
  });

  await gotoWithAgentReady(page, "/analyze");
  await page.getByLabel("Choose a video from this PC").setInputFiles({
    name: "clear-drill.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("local-video"),
  });
  const runButton = page.getByRole("button", { name: "Analyze this video" });
  await expect(runButton).toBeEnabled();
  await runButton.click();

  await expect(page.getByText("Analysis ready for review", { exact: true })).toBeVisible();
  await expect(page.getByText("Contact point is stable", { exact: true })).toBeVisible();
  await expect(page.getByText("Withheld - Court validation failed", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /See your progress →/ })).toBeVisible();
  await page.getByRole("button", { name: "Review evidence frame f12" }).click();
  await expect(page.locator("p[role='status']").filter({ hasText: "Selected evidence frame f12" })).toBeVisible();
});

test("analysis quality failure remains actionable", async ({ page }) => {
  await seedPairedBrowser(page);
  await mockHealth(page);
  await page.route(`${AGENT_URL}/captures/register`, async (route) => {
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ detail: "invalid capture" }),
    });
  });
  await page.route(`${AGENT_URL}/captures/import`, async (route) => {
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        detail: {
          code: "quality_rejected",
          message: "This video did not pass the automatic video check.",
          action: "Record from the side with the full body visible, good light, and a steady camera.",
          quality: {
            passed: false,
            checks: [
              { id: "body_visibility", passed: false, message: "Pose must see full-body landmarks on enough frames" },
            ],
          },
        },
      }),
    });
  });

  await gotoWithAgentReady(page, "/analyze");
  await page.getByLabel("Choose a video from this PC").setInputFiles({
    name: "blurry.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("local-video"),
  });
  const runButton = page.getByRole("button", { name: "Analyze this video" });
  await expect(runButton).toBeEnabled();
  await runButton.click();

  const captureError = page.locator("div.status.error[role='alert']");
  await expect(captureError).toContainText("video did not pass the automatic video check");
  await expect(captureError).toContainText("Record from the side");
  await expect(captureError).toContainText("full-body landmarks");
  await expect(page.getByText("Analysis needs attention", { exact: true })).toBeVisible();
});

test("Compare explains an empty history", async ({ page }) => {
  await seedPairedBrowser(page);
  await mockHealth(page);
  await page.route(`${AGENT_URL}/metrics/series**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ points: [] }),
    });
  });

  await gotoWithAgentReady(page, "/compare");

  await expect(page.getByText("No runs yet - analyze a local video first.", { exact: true })).toBeVisible();
});

test("Compare keeps partial results and hides raw metric errors", async ({ page }) => {
  await seedPairedBrowser(page);
  await mockHealth(page);
  await page.route(`${AGENT_URL}/metrics/series**`, async (route) => {
    const metricId = new URL(route.request().url()).searchParams.get("metric_id");
    if (metricId === "elbow_angle_contact") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          points: [
            {
              sessionId: "session-1",
              sessionTitle: "Baseline session",
              createdAt: "2026-07-01T10:00:00Z",
              metricId,
              value: 92,
              unit: "deg",
            },
          ],
        }),
      });
      return;
    }
    if (metricId === "shoulder_abduction_contact") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ detail: "internal secret" }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ points: [] }),
    });
  });

  await gotoWithAgentReady(page, "/compare");

  await expect(page.locator("td").filter({ hasText: "Baseline session" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Progress over time" })).toBeVisible();
  await expect(page.getByText("Could not load this metric.", { exact: true })).toBeVisible();
  await expect(page.getByText("internal secret", { exact: true })).not.toBeVisible();
});
