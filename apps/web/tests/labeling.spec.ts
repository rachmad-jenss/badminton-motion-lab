import { expect, test, type Page } from "@playwright/test";

const AGENT_URL = "http://127.0.0.1:8787";
const HEALTH_URL = /http:\/\/127\.0\.0\.1:8787\/health\/?$/;

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

  await expect(page.getByRole("status")).toContainText("Pair this browser first");
  await expect(page.getByRole("link", { name: "Open setup" })).toBeVisible();
});

test("labeling exports badminton_stroke ground truth JSON", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("bml.agentToken", "paired-token");
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
    await route.fulfill({ status: 200, contentType: "video/mp4", body: Buffer.from("fake-video") });
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

