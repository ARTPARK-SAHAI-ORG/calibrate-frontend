// Backend-backed Tools flow: create a structured-output tool (the simplest
// tool type — no URL/method) then delete it. Exercises AddToolDialog's form
// view, ParameterCard, the tools list, and deletion. Run with
// `npm run test:e2e:integration`.
import { test, expect } from "./fixtures";

test.describe("Tools page (authenticated, real backend)", () => {
  test("loads, creates a structured-output tool, then deletes it", async ({
    page,
  }) => {
    const name = `E2E Tool ${Date.now()}`;

    await page.goto("/tools");
    await expect(page.getByRole("heading", { name: "Tools" })).toBeVisible();

    // Open the structured-output create panel (simplest: no URL/method).
    await page
      .getByRole("button", { name: "Add structured output tool" })
      .first()
      .click();
    const panel = page.locator(".fixed.inset-0.z-50");
    await expect(
      panel.getByRole("heading", { name: "Add structured output tool" }),
    ).toBeVisible();

    // Tool name (required). Description is optional for structured-output tools.
    await panel
      .getByPlaceholder(
        "An informative name for the tool that reflects its purpose",
      )
      .fill(name);

    // One blank parameter row is auto-added; a parameter's name must be
    // non-empty or submit is blocked. The tool Name is the first text input and
    // the parameter Name is the second.
    await panel.locator('input[type="text"]').nth(1).fill("query");

    await panel.getByRole("button", { name: "Add tool" }).click();

    // Panel closes on success and the tool appears in the list.
    await expect(panel).toBeHidden({ timeout: 15000 });
    const row = page.locator("div.grid").filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 15000 });

    // Delete via the row's icon button + confirmation dialog.
    await row.getByRole("button").click();
    await expect(
      page.getByRole("heading", { name: "Delete tool" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(row).toHaveCount(0, { timeout: 15000 });
  });
});
