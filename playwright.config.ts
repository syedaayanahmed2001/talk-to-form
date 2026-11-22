import { defineConfig, devices } from "@playwright/test";

const PORT = 3107;
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * Smoke test of the demo flow against a production build. Run `npm run build` first
 * (`npm run test:e2e` does both). Locally, PW_CHANNEL=msedge or chrome uses an installed
 * browser instead of Playwright's download.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["json", { outputFile: "reports/playwright.json" }]],
  use: {
    baseURL,
    channel: process.env.PW_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next start --port ${PORT} --hostname 127.0.0.1`,
    url: `${baseURL}/api/status`,
    reuseExistingServer: false,
    timeout: 60_000,
    // Demo mode regardless of any local key: the smoke test must not spend free-tier quota.
    env: { GROQ_API_KEY: "" },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "phone-360",
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true },
    },
  ],
});
