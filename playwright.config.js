import { defineConfig } from "@playwright/test";

// The app is a static site with no build step, so each spec serves the repo itself
// from an ephemeral port (see tests/helpers/server.js). There is no webServer here.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  // The timeout specs deliberately wait out a 25s hang.
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    browserName: "chromium",
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    trace: "retain-on-failure",
    launchOptions: { args: ["--no-sandbox"] },
  },
});
