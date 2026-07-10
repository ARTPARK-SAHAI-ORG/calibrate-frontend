const nextJest = require("next/jest");

const createJestConfig = nextJest({
  // Path to your Next.js app, used to load next.config.ts and .env files
  dir: "./",
});

/** @type {import('jest').Config} */
const config = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  coverageProvider: "v8",
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/app/**",
    "!src/instrumentation*.ts",
    "!src/middleware.ts",
    "!src/**/__tests__/**",
  ],
  // Component-level coverage lands in coverage/component/ (kept separate from
  // the Playwright E2E coverage in coverage/e2e/). `lcov` also writes an HTML
  // report at coverage/component/lcov-report/index.html.
  coverageDirectory: "<rootDir>/coverage/component",
  coverageReporters: ["text", "lcov", "json-summary"],
  testMatch: [
    "**/__tests__/**/*.{ts,tsx}",
    "**/*.{test,spec}.{ts,tsx}",
  ],
  // Playwright specs live in e2e/ and are run by `npm run test:e2e`, not Jest.
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/e2e/"],
};

module.exports = createJestConfig(config);
