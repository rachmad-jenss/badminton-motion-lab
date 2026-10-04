import { expect, test, type Page } from "@playwright/test";

const AGENT_URL = "http://127.0.0.1:8787";
const HEALTH_URL = /http:\/\/127\.0\.0\.1:8787\/health\/?$/;
const BROWSER_COMPATIBLE_MP4 = Buffer.from("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", "base64");

async function mockHealth(page: Page) {
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
      }),
    });
  });
}

test("labeling requires pairing before exposing the tool", async ({ page }) => {
  await mockHealth(page);
  await page.goto("/label");

  await expect(page.locator("main.page-tool.page-label > header.hero")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Pair this browser first");
  await expect(page.getByRole("link", { name: "Open setup" })).toBeVisible();
});

test("labeling exports badminton_stroke ground truth JSON", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("bml.agentToken:http://127.0.0.1:8787", "paired-token");
  });
  await mockHealth(page);
  await page.route(`${AGENT_URL}/media-tickets`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        captureId: "cap-1",
        expiresAt: 4_000_000_000,
        url: `${AGENT_URL}/media/cap-1?ticket=t1`,
      }),
    });
  });
  await page.route(`${AGENT_URL}/media/cap-1*`, async (route) => {
    await route.fulfill({ status: 200, contentType: "video/mp4", body: BROWSER_COMPATIBLE_MP4 });
  });

  await page.goto("/label");

  await page.getByLabel("Capture ID").fill("cap-1");
  await page.getByLabel("Frames per second (fps)").fill("30");
  await page.getByRole("button", { name: "Load preview" }).click();
  await expect(page.locator("video")).toHaveAttribute("src", /media\/cap-1/);

  await page.getByLabel("Preview time (seconds)").fill("2");
  await expect(page.getByText("Frame 60", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mark contact frame" }).click();
  await expect(page.getByText("Contact frame: 60", { exact: true })).toBeVisible();

  await page.getByLabel("Stroke").selectOption("clear");
  await page.getByLabel("Hand").selectOption("forehand");
  await page.getByLabel("Corner 1 X").fill("100");
  await page.getByLabel("Corner 1 Y").fill("200");
  await page.getByLabel("Corner 2 X").fill("1180");
  await page.getByLabel("Corner 2 Y").fill("200");
  await page.getByLabel("Corner 3 X").fill("1200");
  await page.getByLabel("Corner 3 Y").fill("700");
  await page.getByLabel("Corner 4 X").fill("80");
  await page.getByLabel("Corner 4 Y").fill("700");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download truth JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("cap-1.truth.json");

  const stream = await download.createReadStream();
  let payload = "";
  for await (const chunk of stream) payload += chunk.toString();
  const truth = JSON.parse(payload);
  expect(truth.fixtureKind).toBe("badminton_stroke");
  expect(truth.strokeId).toBe("clear");
  expect(truth.hand).toBe("forehand");
  expect(truth.contactFrameTruth).toBe(60);
  expect(truth.courtCorners).toHaveLength(4);
  expect(truth.courtCorners[1]).toEqual({ x: 1180, y: 200 });
});

test("labeling rejects degenerate court corners before export", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("bml.agentToken:http://127.0.0.1:8787", "paired-token");
  });
  await mockHealth(page);

  await page.route(`${AGENT_URL}/media-tickets`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        captureId: "cap-1",
        expiresAt: 4_000_000_000,
        url: `${AGENT_URL}/media/cap-1?ticket=t1`,
      }),
    });
  });

  await page.goto("/label");

  await page.getByLabel("Capture ID").fill("cap-1");
  await page.getByRole("button", { name: "Load preview" }).click();
  await expect(page.locator("video")).toHaveAttribute("src", /media\/cap-1/);
  await page.getByRole("button", { name: "Download truth JSON" }).click();

  await expect(page.getByRole("alert").first()).toContainText("Court corners must be unique");
});

test("labeling refuses to export a preview under a different capture ID", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("bml.agentToken:http://127.0.0.1:8787", "paired-token");
  });
  await mockHealth(page);
  await page.route(`${AGENT_URL}/media-tickets`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        captureId: "cap-a",
        expiresAt: 4_000_000_000,
        url: `${AGENT_URL}/media/cap-a?ticket=t1`,
      }),
    });
  });
  await page.route(`${AGENT_URL}/media/cap-a*`, async (route) => {
    await route.fulfill({ status: 200, contentType: "video/mp4", body: BROWSER_COMPATIBLE_MP4 });
  });

  await page.goto("/label");
  await page.getByLabel("Capture ID").fill("cap-a");
  await page.getByRole("button", { name: "Load preview" }).click();
  await expect(page.locator("video")).toHaveAttribute("src", /media\/cap-a/);

  for (const [label, value] of [
    ["Corner 1 X", "100"], ["Corner 1 Y", "200"],
    ["Corner 2 X", "1180"], ["Corner 2 Y", "200"],
    ["Corner 3 X", "1200"], ["Corner 3 Y", "700"],
    ["Corner 4 X", "80"], ["Corner 4 Y", "700"],
  ] as const) {
    await page.getByLabel(label).fill(value);
  }

  await page.getByLabel("Capture ID").fill("cap-b");
  await page.getByRole("button", { name: "Download truth JSON" }).click();
  await expect(page.getByRole("status").last()).toContainText("Load a preview for the current capture");
});

