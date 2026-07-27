import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://127.0.0.1:3101",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    // Prefer production server in CI: next dev Fast Refresh races cause flaky health/theme tests.
    command: process.env.CI ? "npx next start -p 3101" : "npm.cmd run dev:test",
    url: "http://127.0.0.1:3101",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
