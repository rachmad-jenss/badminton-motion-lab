import { expect, test, type Page } from "@playwright/test";

const AGENT_URL = "http://127.0.0.1:8787";
const HEALTH_URL = /http:\/\/127\.0\.0\.1:8787\/health\/?$/;
const AGENT_TOKEN_KEY = "bml.agentToken:http://127.0.0.1:8787";

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
    localStorage.removeItem("bml.agentToken:http://127.0.0.1:8787");
  });
}

async function seedPairedBrowser(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("bml.agentToken:http://127.0.0.1:8787", "paired-token");
  });
}

async function gotoWithAgentReady(page: Page, path: string, expectedBadge = "Ready to analyze") {
  const healthOk = page.waitForResponse(
    (response) => response.url().startsWith(`${AGENT_URL}/health`) && response.ok(),
  );
  await page.goto(path);
  await healthOk;
  await expect(page.locator(".status-badge", { hasText: expectedBadge }).first()).toBeVisible({
    timeout: 15_000,
  });
}

test("home explains what remains available while agent is offline", async ({ page }) => {
  await page.route(`${AGENT_URL}/health`, async (route) => {
    await route.fulfill({ status: 503, body: "offline" });
  });

  await page.goto("/");

  await expect(page.getByRole("status")).toContainText("local helper is not installed or running");
  await expect(page.getByRole("link", { name: "Install the helper" }).first()).toHaveAttribute("href", "/agent#install");
  await expect(page.getByRole("link", { name: "Try experimental analysis" }).first()).toHaveAttribute("href", "/analyze");
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toContainText("Progress");
});

test("shared shell exposes a skip link before the brand and a focus target", async ({ page }) => {
  await mockHealth(page);
  await page.goto("/");

  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await expect(skipLink).toHaveAttribute("href", "#main-content");
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("home keeps readiness neutral while the Local Agent health check is pending", async ({ page }) => {
  await page.route(HEALTH_URL, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ ok: true, pairingCode: "test-pairing-code", poseModelPresent: true }),
    });
  });

  await page.goto("/");

  await expect(page.getByText("Checking…").first()).toBeVisible();
  await expect(page.getByText("Start setup", { exact: true })).toHaveCount(0);
});

test("offline setup gives beginners a starter bundle and concrete Windows steps", async ({ page }) => {
  await page.route(`${AGENT_URL}/health`, async (route) => {
    await route.fulfill({ status: 503, body: "offline" });
  });

  await page.goto("/agent");

  await expect(page.getByRole("heading", { name: "Install the helper on Windows" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download Windows starter bundle" })).toHaveAttribute(
    "href",
    "https://github.com/rachmad-jenss/badminton-motion-lab/archive/refs/heads/main.zip",
  );
  await expect(page.getByText("Extract All", { exact: true })).toBeVisible();
  await expect(page.getByText("install-agent.cmd", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Pair browser ↔ agent" })).toBeDisabled();
  await expect(page.getByLabel("Agent URL")).toBeHidden();

  await page.getByText("Advanced: use a different Local Agent address", { exact: true }).click();
  await expect(page.getByLabel("Agent URL")).toBeVisible();
});

test("ready but unpaired home sends the user to pairing before experimental analysis", async ({ page }) => {
  await clearAgentStorage(page);
  await mockHealth(page);

  const healthOk = page.waitForResponse(
    (response) => response.url().startsWith(`${AGENT_URL}/health`) && response.ok(),
  );
  await page.goto("/");
  await healthOk;

  await expect(page.getByRole("link", { name: "Pair this browser" }).first()).toHaveAttribute("href", "/agent#pair");
  await expect(page.getByRole("link", { name: "Try experimental analysis" }).first()).toHaveAttribute("href", "/analyze");
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

  await gotoWithAgentReady(page, "/agent", "Setup needs attention");
  await expect(page.getByLabel("Pairing code")).toHaveValue("test-pairing-code");
  const pairButton = page.getByRole("button", { name: "Pair browser ↔ agent" });
  await expect(pairButton).toBeEnabled();
  await pairButton.click();

  await expect(page.locator("p[role='alert']")).toContainText("Invalid pairing code");
  await expect(pairButton).toBeEnabled();
});

test("pairing code is read-only, copyable, and shows remaining validity", async ({ page }) => {
  await clearAgentStorage(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as Window & { copiedPairingCode?: string }).copiedPairingCode = value;
        },
      },
    });
  });
  await mockHealth(page, { pairingExpiresAt: Math.floor(Date.now() / 1000) + 60 });

  await gotoWithAgentReady(page, "/agent", "Setup needs attention");

  const code = page.getByLabel("Pairing code");
  await expect(code).toHaveAttribute("readonly", "");
  await expect(page.getByText(/Pairing code expires in/)).toBeVisible();
  await page.getByRole("button", { name: "Copy pairing code" }).click();
  await expect(page.getByRole("status")).toContainText("Pairing code copied");
  await expect(page.evaluate(() => (window as Window & { copiedPairingCode?: string }).copiedPairingCode)).resolves.toBeTruthy();
});

test("expired pairing code is blocked until a fresh code is requested", async ({ page }) => {
  await clearAgentStorage(page);
  let healthCalls = 0;
  await page.route(HEALTH_URL, async (route) => {
    healthCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        ok: true,
        agentVersion: "test",
        pipelineVersion: "test",
        pairingCode: healthCalls === 1 ? null : "fresh-pairing-code",
        pairingExpiresAt: healthCalls === 1 ? Math.floor(Date.now() / 1000) - 1 : Math.floor(Date.now() / 1000) + 60,
        poseModelPresent: true,
      }),
    });
  });

  const healthOk = page.waitForResponse(
    (response) => response.url().startsWith(`${AGENT_URL}/health`) && response.ok(),
  );
  await page.goto("/agent");
  await healthOk;

  await expect(page.getByText(/Pairing code expired or unavailable/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Pair browser ↔ agent" })).toBeDisabled();

  const refreshedHealth = page.waitForResponse(
    (response) => response.url().startsWith(`${AGENT_URL}/health`) && response.ok(),
  );
  await page.getByRole("button", { name: "Get a new pairing code" }).click();
  await refreshedHealth;
  await expect(page.getByRole("button", { name: "Pair browser ↔ agent" })).toBeEnabled();
  await expect(page.getByText(/Pairing code expires in/)).toBeVisible();
});

test("paired setup sends the user to video selection from the hero", async ({ page }) => {
  await seedPairedBrowser(page);
  await mockHealth(page);

  await gotoWithAgentReady(page, "/agent", "Ready to analyze");

  await expect(page.getByRole("link", { name: "Choose a video" }).first()).toHaveAttribute("href", "/analyze");
});

test("Experimental analysis can be opened before pairing", async ({ page }) => {
  await clearAgentStorage(page);
  await mockHealth(page);

  await gotoWithAgentReady(page, "/analyze", "Pair this browser first");

  await expect(page.getByRole("combobox", { name: /Dominant hand/ })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "experimental.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("fixture"),
  });
  await expect(page.getByRole("button", { name: "Analyze this video" })).toBeEnabled();
  await expect(page.getByRole("link", { name: "Open setup" }).first()).toHaveAttribute("href", "/agent");
  await expect(page.getByRole("link", { name: "Continue with experimental analysis" })).toHaveAttribute("href", "#video");
  await expect(page.locator("div.notice[role='alert']")).toHaveCount(0);
});

test("Compare does not call protected series endpoints before pairing", async ({ page }) => {
  await clearAgentStorage(page);
  await mockHealth(page);
  const protectedRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/metrics/series")) protectedRequests.push(request.url());
  });

  await gotoWithAgentReady(page, "/compare", "Pair this browser first");

  await expect(page.getByRole("alert")).toContainText("Pair this browser");
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
      await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
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
  await expect(page.getByRole("menu", { name: "Background theme" })).toBeVisible();
  await expect(page.locator(".background-swatch img").first()).toHaveAttribute("loading", "lazy");
  const firstBackgroundOption = page.getByRole("menu", { name: "Background theme" }).getByRole("menuitemradio").first();
  await firstBackgroundOption.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menu", { name: "Background theme" }).getByRole("menuitemradio").nth(1)).toBeFocused();
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

  await gotoWithAgentReady(page, "/agent", "Setup needs attention");
  await expect(page.getByLabel("Pairing code")).toHaveValue("test-pairing-code");

  await page.getByText("Advanced: use a different Local Agent address", { exact: true }).click();
  await page.getByLabel("Agent URL").fill("http://127.0.0.1:9999");

  await expect(page.getByLabel("Pairing code")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Pair browser ↔ agent" })).toBeDisabled();
});

test("changing the Agent URL removes the old URL-scoped token", async ({ page }) => {
  await seedPairedBrowser(page);
  await mockHealth(page);

  await gotoWithAgentReady(page, "/agent", "Ready to analyze");
  await page.getByText("Advanced: use a different Local Agent address", { exact: true }).click();
  await page.getByLabel("Agent URL").fill("http://127.0.0.1:9999");

  await expect(page.getByRole("button", { name: "Pair browser ↔ agent" })).toBeDisabled();
  await expect(page.evaluate((key) => localStorage.getItem(key), AGENT_TOKEN_KEY)).resolves.toBe(null);
  await expect(page.evaluate(() => localStorage.getItem("bml.agentToken:http://127.0.0.1:9999"))).resolves.toBe(null);
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
            fps: 30,
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
  await expect(page.getByRole("heading", { name: /Optional written explanation/ })).toBeVisible();
  await expect(page.getByText("Experimental", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /See your progress →/ })).toBeVisible();
  await page.getByRole("button", { name: "Review evidence frame f12" }).click();
  await expect(page.locator("p[role='status']").filter({ hasText: "Selected evidence frame f12" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download report (JSON)" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^bml-report-.*\.json$/);
  const reportStream = await download.createReadStream();
  let reportText = "";
  for await (const chunk of reportStream) reportText += chunk.toString();
  const report = JSON.parse(reportText);
  expect(report.analysisRunId).toBe("run-1");
  expect(report.summary.metrics[0].metricId).toBe("elbow_angle_contact");
  expect(report.agentMediaUrl).toBeUndefined();
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
              {
                id: "body_visibility",
                passed: false,
                measured: 0.42,
                threshold: 0.8,
                message: "Pose must see full-body landmarks on enough frames",
              },
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
  await expect(captureError).toContainText("measured 0.42, needs 0.8");
  await expect(page.getByRole("link", { name: "Open capture guide" })).toHaveAttribute("href", "/capture-guide");
  await expect(page.getByText("Analysis needs attention", { exact: true })).toBeVisible();
});

test("generic analysis 422 stays generic and offers retry", async ({ page }) => {
  await seedPairedBrowser(page);
  await mockHealth(page);
  await page.route(`${AGENT_URL}/captures/import`, async (route) => {
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Capture request could not be completed" }),
    });
  });

  await gotoWithAgentReady(page, "/analyze");
  await page.getByLabel("Choose a video from this PC").setInputFiles({
    name: "generic-error.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("local-video"),
  });
  await page.getByRole("button", { name: "Analyze this video" }).click();

  const captureError = page.locator("div.status.error[role='alert']");
  await expect(captureError).toContainText("Capture request could not be completed");
  await expect(captureError).not.toContainText("quality gate");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("pairing analysis failure links to setup", async ({ page }) => {
  await seedPairedBrowser(page);
  await mockHealth(page);
  await page.route(`${AGENT_URL}/captures/import`, async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Authorization required" }),
    });
  });

  await gotoWithAgentReady(page, "/analyze");
  await page.getByLabel("Choose a video from this PC").setInputFiles({
    name: "pairing-error.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("local-video"),
  });
  await page.getByRole("button", { name: "Analyze this video" }).click();

  await expect(page.getByRole("link", { name: "Open setup" }).last()).toHaveAttribute("href", "/agent");
});

test("expired capture failure keeps the selected input retryable", async ({ page }) => {
  await seedPairedBrowser(page);
  await mockHealth(page);
  await page.route(`${AGENT_URL}/captures/import`, async (route) => {
    await route.fulfill({
      status: 410,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Local media missing" }),
    });
  });

  await gotoWithAgentReady(page, "/analyze");
  await page.getByLabel("Choose a video from this PC").setInputFiles({
    name: "expired-capture.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("local-video"),
  });
  await page.getByRole("button", { name: "Analyze this video" }).click();

  await expect(page.getByText(/local media is no longer available/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByText("Selected: expired-capture.mp4", { exact: true })).toBeVisible();
});

test("advanced path mode clears a previously selected file", async ({ page }) => {
  await seedPairedBrowser(page);
  await mockHealth(page);

  await gotoWithAgentReady(page, "/analyze");
  await page.getByLabel("Choose a video from this PC").setInputFiles({
    name: "first-choice.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from("local-video"),
  });
  await expect(page.getByText("Selected: first-choice.mp4", { exact: true })).toBeVisible();

  await page.getByText("Advanced: use a video path", { exact: true }).click();
  await page.getByLabel("Local video path").fill("C:\\Videos\\second-choice.mp4");

  await expect(page.getByText("Selected: first-choice.mp4", { exact: true })).not.toBeVisible();
  await expect(page.getByLabel("Choose a video from this PC")).toHaveValue("");
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
  await expect(page.getByRole("table").first().getByRole("columnheader", { name: "Metric" })).toHaveAttribute("scope", "col");
  await expect(page.getByRole("list", { name: /Elbow angle at contact over time/ })).toBeVisible();
  await expect(page.getByText("Could not load this metric.", { exact: true })).toBeVisible();
  await expect(page.getByText("internal secret", { exact: true })).not.toBeVisible();
  await expect(page.locator("td").filter({ hasText: "Shuttle approach angle" }).first()).toBeVisible();
});
