// Authenticated navigation smoke tests. Visiting each sidebar route mounts
// that page's full component tree (list views, AppLayout, WorkspaceSwitcher,
// data hooks), so this spec alone drives a large share of the app's code — the
// data-backed CRUD specs then cover the create/edit/delete branches on top.
//
// Every page gates its data fetch on the seeded auth token and renders a stable
// <h1> immediately (list rows sit behind a spinner), so we assert on the
// heading rather than on data. Run with `npm run test:e2e:integration`.
import { test, expect } from "./fixtures";
import { waitForOrgReady } from "./helpers";

// path → the exact heading text that confirms the page rendered. Headings are
// copied from each page component and differ from the sidebar nav labels
// (e.g. nav "Tests" → heading "LLM Tests").
const PAGES: ReadonlyArray<{ path: string; heading: string }> = [
  { path: "/personas", heading: "Personas" },
  { path: "/scenarios", heading: "Scenarios" },
  { path: "/tools", heading: "Tools" },
  { path: "/evaluators", heading: "Evaluators" },
  { path: "/stt", heading: "Speech-to-Text Evaluation" },
  { path: "/tts", heading: "Text-to-Speech Evaluation" },
  { path: "/tests", heading: "LLM Tests" },
  { path: "/simulations", heading: "Simulations" },
  { path: "/workspace-settings", heading: "Workspace settings" },
];

test.describe("Authenticated navigation (real backend)", () => {
  for (const { path, heading } of PAGES) {
    test(`${path} renders for a logged-in user`, async ({ page }) => {
      await page.goto(path);
      // Middleware let us through (seeded token) — we stayed on the route.
      await expect(page).toHaveURL(new RegExp(`${path}(\\?.*)?$`));
      await expect(
        page.getByRole("heading", { name: heading }).first(),
      ).toBeVisible();
    });
  }

  test("the sidebar navigates between sections", async ({ page }) => {
    await page.goto("/agents");
    await expect(
      page.getByRole("button", { name: "New agent" }).first(),
    ).toBeVisible();

    // Click a nav item and confirm client-side routing lands on its page. The
    // sidebar nav items are Next.js <Link>s (role=link) labelled with the
    // section name.
    await page.getByRole("link", { name: "Tools", exact: true }).click();
    await expect(page).toHaveURL(/\/tools$/);
    // exact: the empty-state heading "No tools found" also contains "Tools".
    await expect(
      page.getByRole("heading", { name: "Tools", exact: true }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Evaluators", exact: true }).click();
    await expect(page).toHaveURL(/\/evaluators/);
    await expect(
      page.getByRole("heading", { name: "Evaluators", exact: true }),
    ).toBeVisible();
  });

  test("the workspace switcher opens and can reach settings", async ({
    page,
  }) => {
    await page.goto("/agents");
    await waitForOrgReady(page);
    // Sidebar switcher trigger (expanded sidebar) is a menu button.
    const trigger = page.locator('button[aria-haspopup="menu"]').first();
    await expect(trigger).toBeVisible();
    await trigger.click();

    // The dropdown lists the workspaces and the create/settings affordances.
    // (Navigating into /workspace-settings itself is covered by the settings
    // specs and the direct visits above.)
    await expect(page.getByText("Workspaces")).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByRole("button", { name: "Create workspace" }),
    ).toBeVisible();
  });
});
