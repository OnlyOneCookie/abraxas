import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:4321/github-explorer/",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm preview --host 127.0.0.1 --port 4321",
    url: "http://127.0.0.1:4321/github-explorer/",
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
