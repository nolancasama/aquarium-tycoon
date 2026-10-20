import { defineConfig, devices } from "@playwright/test";

// BASE_URL=http://127.0.0.1:5320 runs against a dev server instead of the built preview.
const external = process.env.BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 240_000,
  reporter: "line",
  use: {
    baseURL: external ?? "http://127.0.0.1:4177",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
    }
  },
  webServer: external
    ? undefined
    : {
        command: "npm run preview -- --host 127.0.0.1 --port 4177 --strictPort",
        url: "http://127.0.0.1:4177",
        reuseExistingServer: !process.env.CI,
        timeout: 60_000
      },
  projects: [
    {
      name: "chromebook",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 }
    }
  ]
});
