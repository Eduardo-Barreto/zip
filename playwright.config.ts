import { defineConfig, devices } from '@playwright/test'

const PORT = Number.parseInt(process.env.PORT ?? '5180', 10)

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    // Plain vite (not the portless `dev` script) for the test harness: avoids
    // the portless host-registration collision. `bun run dev` (portless) stays
    // the dev workflow; e2e just needs a server on a fixed port.
    command: `VITE_TRANSPORT=broadcast bunx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
