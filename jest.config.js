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
    // Re-include the STT/TTS evaluation list pages: they have dedicated
    // component tests (src/app/{stt,tts}/__tests__/page.test.tsx) rendering the
    // job-list rows, so they belong in component coverage even though the rest
    // of src/app is E2E-only.
    "src/app/stt/page.tsx",
    "src/app/tts/page.tsx",
    "!src/instrumentation*.ts",
    "!src/middleware.ts",
    // NextAuth v5 config — providers, callbacks, and the backend token
    // exchange only run inside the Auth.js runtime, not jsdom. Like
    // middleware.ts above, it can't be executed under Jest so it only ever
    // shows as 0% and skews the denominator.
    "!src/auth.ts",
    "!src/**/__tests__/**",
    // Pure type module (no runtime exports) — can't be executed, so it only
    // ever shows as 0% and skews the denominator.
    "!src/components/eval-details/ttsEvalTypes.ts",
    // Data Extraction tab is temporarily disabled — its only render site in
    // AgentDetail.tsx is commented out (extraction UI removed, #230). Excluded
    // while dead so we don't chase coverage on a hidden feature; re-add here
    // when the tab is turned back on.
    "!src/components/agent-tabs/DataExtractionTabContent.tsx",
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
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/e2e/",
    "<rootDir>/.claude/",
  ],
};

module.exports = createJestConfig(config);
