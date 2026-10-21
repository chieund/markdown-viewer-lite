import { defineConfig, devices } from '@playwright/test'

const PORT = 4320

export default defineConfig({
    testDir: './test/e2e',
    testMatch: /.*\.spec\.ts/,
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: [['list']],
    use: {
        baseURL: `http://localhost:${PORT}`,
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'node test/e2e/static-server.mjs',
        url: `http://localhost:${PORT}/index.html`,
        reuseExistingServer: !process.env.CI,
        env: { E2E_STATIC_PORT: String(PORT) },
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
})
