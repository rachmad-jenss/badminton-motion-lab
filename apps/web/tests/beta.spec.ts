import { expect, test } from "@playwright/test";

test("home discloses beta and locked modules honestly", async ({ page }) => {
  await page.goto("/");

  const notice = page.locator(".beta-notice");
  await expect(notice).toContainText("Beta");
  await expect(notice.getByRole("link")).toHaveAttribute("href", "/contribute");
  await expect(page.getByText("In review", { exact: true }).first()).toBeVisible();
});

test("contribute page explains local-first opt-in and attribution", async ({ page }) => {
  await page.goto("/contribute");

  await expect(page.getByRole("heading", { name: /Help improve the measurements/ })).toBeVisible();
  await expect(page.getByText(/stays on your PC/)).toBeVisible();
  await expect(page.getByText(/report JSON/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Label a capture/ })).toHaveAttribute("href", "/label");
});

test("label page is reachable from contribute without a paired browser", async ({ page }) => {
  await page.goto("/contribute");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: /Label a capture/ }).click();
  await expect(page).toHaveURL(/\/label$/, { timeout: 15_000 });
});
