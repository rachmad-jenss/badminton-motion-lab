import { expect, test, type Page } from "@playwright/test";

const AGENT_URL = "http://127.0.0.1:8787";

async function mockHealth(page: Page, overrides: Record<string, unknown> = {}) {
  await page.route(`${AGENT_URL}/health`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
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

test("home explains what remains available while agent is offline", async ({ page }) => {
  await page.route(`${AGENT_URL}/health`, async (route) => {
    await route.fulfill({ status: 503, body: "offline" });
  });

  await page.goto("/");

  await expect(page.getByRole("status")).toContainText("module catalogue remains available");
  await expect(page.getByRole("link", { name: "Pair & start agent" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toContainText("Compare");
});

test("pairing failure is announced inline and remains retryable", async ({ page }) => {
  await mockHealth(page);
  await page.route(`${AGENT_URL}/pair`, async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Invalid pairing code" }),
    });
  });

  await page.goto("/agent");
  await expect(page.getByRole("button", { name: "Pair browser" })).toBeEnabled();
  await page.getByRole("button", { name: "Pair browser" }).click();

  await expect(page.locator("p[role='alert']")).toContainText("Pair the browser first");
  await expect(page.getByRole("button", { name: "Refresh health" })).toBeEnabled();
});

test("Analyze requires pairing and exposes dominant-hand input", async ({ page }) => {
  await mockHealth(page);

  await page.goto("/analyze");

  await expect(page.getByRole("combobox", { name: /Dominant hand/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run analysis" })).toBeDisabled();
  await expect(page.locator("div.notice[role='alert']")).toContainText("Pair this browser");
});

test("Compare does not call protected series endpoints before pairing", async ({ page }) => {
  await mockHealth(page);
  const protectedRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/metrics/series")) protectedRequests.push(request.url());
  });

  await page.goto("/compare");

  await expect(page.getByRole("status")).toContainText("Pair this browser");
  expect(protectedRequests).toHaveLength(0);
});

test("all primary routes share navigation and fit a narrow viewport", async ({ page }) => {
  await mockHealth(page);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of ["/", "/agent", "/analyze", "/compare", "/capture-guide"]) {
    await page.goto(route);
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    await expect(nav).toContainText("Capture guide");
    await expect(nav.locator("a[aria-current='page']")).toHaveCount(1);
    expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
});
