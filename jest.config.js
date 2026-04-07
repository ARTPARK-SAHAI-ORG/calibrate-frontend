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
  coverageReporters: ["text", "lcov", "json-summary"],
  testMatch: [
    "**/__tests__/**/*.{ts,tsx}",
    "**/*.{test,spec}.{ts,tsx}",
  ],
};

module.exports = createJestConfig(config);
