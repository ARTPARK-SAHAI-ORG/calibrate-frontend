import { test as setup, expect } from "@playwright/test";
import { STORAGE_STATE } from "./storage-state";

/**
 * Auth setup for backend-backed E2E tests.
 *
 * Instead of driving the login UI, we mint a real account against the running
 * backend (`POST /auth/signup` returns a JWT) and persist it as Playwright
 * storage state. Specs in the `authenticated` project load that state, so they
 * start already logged in and can hit protected pages directly.
 *
 * The app authenticates via an `access_token` cookie *and* localStorage (see
 * src/app/login/page.tsx / src/middleware.ts), so we seed both.
 *
 * Requires a backend at NEXT_PUBLIC_BACKEND_URL (default http://localhost:8000).
 */
const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

setup("create account and save auth state", async ({ page, request, baseURL }) => {
  // Unique email per run so re-runs don't collide with an existing account.
  const email = `e2e+${Date.now()}@test.local`;

  const res = await request.post(`${BACKEND_URL}/auth/signup`, {
    data: {
      email,
      password: "test123456",
      first_name: "E2E",
      last_name: "Bot",
    },
  });
  expect(
    res.ok(),
    `signup failed (${res.status()}) — is the backend running at ${BACKEND_URL}?`,
  ).toBeTruthy();

  const { access_token, user } = await res.json();

  // Seed the token the way a real login would, on the app origin.
  await page.goto("/login");
  await page.evaluate(
    ([token, serializedUser]) => {
      localStorage.setItem("access_token", token);
      localStorage.setItem("user", serializedUser);
    },
    [access_token, JSON.stringify(user)] as const,
  );
  await page
    .context()
    .addCookies([{ name: "access_token", value: access_token, url: baseURL! }]);

  await page.context().storageState({ path: STORAGE_STATE });
});
