// Import from ./fixtures so E2E coverage is collected when E2E_COVERAGE=1.
// This spec runs in the `authenticated` Playwright project, which loads the
// storage state saved by auth.setup.ts — so it starts already logged in.
//
// Backend required: the page fetches real data from NEXT_PUBLIC_BACKEND_URL.
// Run with `npm run test:e2e:integration` (see e2e/README.md).
import { test, expect } from "./fixtures";

test.describe("Agents page (authenticated, real backend)", () => {
  test("loads for a logged-in user without bouncing to login", async ({
    page,
  }) => {
    await page.goto("/agents");

    // Seeded token → middleware lets us through, so we stay on /agents.
    await expect(page).toHaveURL(/\/agents$/);

    // The Agents component rendered its data-backed UI (a fresh account has an
    // empty list, which still shows the "New agent" action).
    await expect(
      page.getByRole("button", { name: "New agent" }).first(),
    ).toBeVisible();
  });
});
