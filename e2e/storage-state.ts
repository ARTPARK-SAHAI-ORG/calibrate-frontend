// Path to the Playwright storage state written by auth.setup.ts and loaded by
// the `authenticated` project. Kept in its own module (no test registration)
// so both playwright.config.ts and auth.setup.ts can import it safely.
export const STORAGE_STATE = "e2e/.auth/user.json";
