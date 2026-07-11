// Backend-backed Simulations flow: create (name-only dialog that redirects to
// the new simulation's detail page) then delete from the list. Exercises
// NewSimulationDialog, the simulations list + detail route, and the delete
// path. Run with `npm run test:e2e:integration`.
import { test, expect } from "./fixtures";

test.describe("Simulations page (authenticated, real backend)", () => {
  test("loads, creates a simulation (redirects to detail), then deletes it", async ({
    page,
  }) => {
    const name = `E2E Sim ${Date.now()}`;

    await page.goto("/simulations");
    await expect(
      page.getByRole("heading", { name: "Simulations" }),
    ).toBeVisible();

    // Create: "Add simulation" opens NewSimulationDialog.
    await page.getByRole("button", { name: "Add simulation" }).first().click();
    await expect(
      page.getByRole("heading", { name: "Create your simulation" }),
    ).toBeVisible();
    await page.getByPlaceholder("Enter simulation name").fill(name);
    await page.getByRole("button", { name: "Create Simulation" }).click();

    // On success the backend creates the simulation and the app navigates to
    // /simulations/<uuid>.
    await expect(page).toHaveURL(/\/simulations\/[0-9a-f-]{36}/, {
      timeout: 15000,
    });

    // Back to the list; the new simulation shows up as a row.
    await page.goto("/simulations");
    const row = page.locator("div.grid").filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 15000 });

    // Delete via the row's icon button + confirmation dialog.
    await row.getByRole("button").click();
    await expect(
      page.getByRole("heading", { name: "Delete simulation" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(row).toHaveCount(0, { timeout: 15000 });
  });
});
