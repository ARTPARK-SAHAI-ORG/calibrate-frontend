// Backend-backed Tools flow. AddToolDialog supports two tool types
// (`src/app/tools/page.tsx`: "structured_output" and "webhook"), each opened
// from its own "Add ..." button. These specs exercise both branches of the
// dialog plus the shared list/delete + Form⇆JSON view toggle. Run with
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

  test("creates a webhook tool, then deletes it", async ({ page }) => {
    const name = `E2E Webhook ${Date.now()}`;

    await page.goto("/tools");
    await expect(page.getByRole("heading", { name: "Tools" })).toBeVisible();

    // Open the webhook create panel (the "webhook" tool type). Two buttons with
    // this label exist (header + empty-state); the header one is always present.
    await page
      .getByRole("button", { name: "Add webhook tool" })
      .first()
      .click();
    const panel = page.locator(".fixed.inset-0.z-50");
    await expect(
      panel.getByRole("heading", { name: "Add webhook tool" }),
    ).toBeVisible();

    // Required webhook fields: Name, Description, a valid URL, and — because the
    // default method is POST — the body Description (POST/PUT/PATCH render a Body
    // parameters section with a required description). Header/query/body params
    // are optional (empty arrays pass validation), so this is the minimal create.
    await panel
      .getByPlaceholder(
        "An informative name for the tool that reflects its purpose",
      )
      .fill(name);
    await panel
      .getByPlaceholder(
        "Describe to the LLM how and when to use the tool along with what should be passed to the tool",
      )
      .fill("Sends a notification to an external service.");
    await panel
      .getByPlaceholder("https://example.com/{hi}/webhook")
      .fill("https://example.com/webhook");
    // Body description placeholder is unique to the POST/PUT/PATCH body section.
    await panel
      .getByPlaceholder("Describe the body structure")
      .fill("The JSON body of the request.");

    await panel.getByRole("button", { name: "Add tool" }).click();

    // Panel closes on success and the tool appears in the list, typed "Webhook".
    await expect(panel).toBeHidden({ timeout: 15000 });
    const row = page.locator("div.grid").filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).toContainText("Webhook");

    // Delete via the row's icon button + confirmation dialog.
    await row.getByRole("button").click();
    await expect(
      page.getByRole("heading", { name: "Delete tool" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(row).toHaveCount(0, { timeout: 15000 });
  });

  test("webhook dialog: JSON view toggle and method switch mount their branches", async ({
    page,
  }) => {
    await page.goto("/tools");
    await expect(page.getByRole("heading", { name: "Tools" })).toBeVisible();

    await page
      .getByRole("button", { name: "Add webhook tool" })
      .first()
      .click();
    const panel = page.locator(".fixed.inset-0.z-50");
    await expect(
      panel.getByRole("heading", { name: "Add webhook tool" }),
    ).toBeVisible();

    // Default method POST renders the Body parameters section.
    await expect(
      panel.getByRole("heading", { name: "Body parameters" }),
    ).toBeVisible();

    // Toggle to the JSON editor view — mounts the raw-JSON textarea branch.
    await panel.getByRole("button", { name: "JSON", exact: true }).click();
    await expect(
      panel.getByPlaceholder(
        '{ "name": "", "description": "", "parameters": { "type": "object", "properties": {} } }',
      ),
    ).toBeVisible();

    // Back to the form view.
    await panel.getByRole("button", { name: "Form", exact: true }).click();

    // Switch the method to GET — the Body parameters section unmounts (GET has
    // no request body), exercising the method-dependent rendering branch.
    await panel.locator("select").selectOption("GET");
    await expect(
      panel.getByRole("heading", { name: "Body parameters" }),
    ).toBeHidden();

    // Close without saving.
    await panel.getByRole("button", { name: "Cancel" }).click();
    await expect(panel).toBeHidden({ timeout: 15000 });
  });
});
