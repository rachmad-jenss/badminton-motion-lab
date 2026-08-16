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
    // Static export server in CI (next start does not work with output: "export");
    // dev server locally keeps Fast Refresh for test iteration.
    command: process.env.CI ? "node ../../scripts/serve-export.mjs" : "npm.cmd run dev:test -w @bml/web",
    url: "http://127.0.0.1:3101",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
