// Import from ./fixtures so E2E coverage is collected when E2E_COVERAGE=1.
// This spec runs in the `authenticated` Playwright project, which loads the
// storage state saved by auth.setup.ts — so it starts already logged in.
//
// Backend required: the page fetches real data from NEXT_PUBLIC_BACKEND_URL.
// Run with `npm run test:e2e:integration` (see e2e/README.md).
import { test, expect } from "./fixtures";
import { waitForOrgReady } from "./helpers";

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

  // Exercise the client-side search/sort handlers in Agents.tsx over the fetched
  // list. These interactions are data-independent: the search-for-nonexistent
  // path drives the filter regardless of how many agents the shared workspace
  // has, and the sort toggle is only clicked when the (data-dependent) table is
  // actually present, so this stays green on an empty or populated list.
  test("filters and sorts the agents list client-side", async ({ page }) => {
    await page.goto("/agents");
    await waitForOrgReady(page);

    // Wait for the initial fetch to settle: either the empty state or the
    // desktop table header ("Last updated at") is showing.
    const emptyState = page.getByRole("heading", { name: "No agents found" });
    const sortButton = page.getByRole("button", { name: "Last updated at" });
    await expect(async () => {
      const empty = await emptyState.isVisible().catch(() => false);
      const sorted = await sortButton.isVisible().catch(() => false);
      expect(empty || sorted).toBe(true);
    }).toPass({ timeout: 15000 });

    // If the shared workspace already has agents, the sortable table renders —
    // toggle the "Last updated at" sort to run the sort handler. Skipped when
    // the list is empty (the button doesn't render then).
    if (await sortButton.isVisible().catch(() => false)) {
      await sortButton.click();
      await expect(sortButton).toBeVisible({ timeout: 15000 });
    }

    // Type an unlikely string into the search box. This runs the case-insensitive
    // name filter, which matches nothing → the "No agents found" empty state.
    const search = page.getByPlaceholder("Search agents");
    await expect(search).toBeVisible({ timeout: 15000 });
    await search.fill(`zzz-no-such-agent-${Date.now()}`);
    await expect(emptyState).toBeVisible({ timeout: 15000 });

    // Clearing the query re-runs the filter over the full list; the impossible
    // empty state driven purely by the search term goes away.
    await search.fill("");
    await expect(search).toHaveValue("");
  });
});
