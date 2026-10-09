import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  fullyParallel: false,
  timeout: 180000,
  use: {
    actionTimeout: 15000,
    baseURL: "http://localhost:3101",
    browserName: "chromium",
    channel: process.env.CI ? undefined : "msedge",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/test-server.js",
    url: "http://localhost:3101",
    reuseExistingServer: false,
    timeout: 60000,
  },
  reporter: [["list"]],
  outputDir: "test-results",
});
