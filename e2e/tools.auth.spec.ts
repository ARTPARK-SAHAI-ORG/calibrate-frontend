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

  test("webhook dialog: adds header, query-param, and body-param rows, then creates", async ({
    page,
  }) => {
    const name = `E2E Webhook Params ${Date.now()}`;

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

    // Base required fields (mirrors the minimal-create test above).
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
    await panel
      .getByPlaceholder("Describe the body structure")
      .fill("The JSON body of the request.");

    // --- Headers editor ---------------------------------------------------
    // "Add header" button (AddToolDialog line 1742) mounts a header card with a
    // Name input (placeholder "e.g. Authorization", line 1769) and a Value input
    // (placeholder "Header value", line 1800). Both are required to create.
    await panel.getByRole("button", { name: "Add header" }).click();
    await panel.getByPlaceholder("e.g. Authorization").fill("X-Api-Key");
    await panel.getByPlaceholder("Header value").fill("secret-token");

    // --- Query parameters + Body properties editors ----------------------
    // "Add param" (Query parameters section, line 1892) and "Add property"
    // (Body NestedContainer) each append a ParameterCard. The card's Description
    // textarea carries a unique long placeholder, so after adding both there are
    // two such textareas — filling each exercises the add + onUpdate handlers.
    // (A full webhook create with nested params is already covered by the
    // create-webhook-tool test above, so here we exercise the editors and
    // close, avoiding brittle section-scoping / Name-input targeting.)
    const paramDescription =
      "This field will be passed to the LLM and should describe in detail what the parameter is for and how it should be populated";

    await panel.getByRole("button", { name: "Add param" }).click();
    await expect(panel.getByPlaceholder(paramDescription)).toHaveCount(1, {
      timeout: 15000,
    });

    await panel.getByRole("button", { name: "Add property" }).click();
    await expect(panel.getByPlaceholder(paramDescription)).toHaveCount(2, {
      timeout: 15000,
    });

    // Fill both ParameterCard descriptions to run the onUpdate path.
    await panel
      .getByPlaceholder(paramDescription)
      .nth(0)
      .fill("The search query string.");
    await panel
      .getByPlaceholder(paramDescription)
      .nth(1)
      .fill("The notification message body.");

    // Close without creating — the editors have been exercised.
    await panel.getByRole("button", { name: "Cancel" }).click();
    await expect(panel).toBeHidden({ timeout: 15000 });
  });

  test("structured-output dialog: builds a nested object schema, then creates", async ({
    page,
  }) => {
    const name = `E2E Schema ${Date.now()}`;

    await page.goto("/tools");
    await expect(page.getByRole("heading", { name: "Tools" })).toBeVisible();

    await page
      .getByRole("button", { name: "Add structured output tool" })
      .first()
      .click();
    const panel = page.locator(".fixed.inset-0.z-50");
    await expect(
      panel.getByRole("heading", { name: "Add structured output tool" }),
    ).toBeVisible();

    // Tool name (required). Structured-output param descriptions are optional
    // (requireDescription={false} at AddToolDialog line 1866), so only names
    // gate the create.
    await panel
      .getByPlaceholder(
        "An informative name for the tool that reflects its purpose",
      )
      .fill(name);

    // A single blank parameter row is auto-added. Text inputs in document order:
    // [0] = tool name, [1] = first param name. Name it, then switch its Data type
    // to "object" (the only <select> at this point) — this mounts the nested
    // Properties builder (ParameterCard "object" branch).
    await panel.locator('input[type="text"]').nth(1).fill("location");
    await panel.locator("select").first().selectOption("object");

    // Object requires >= 1 property. "Add property" (NestedContainer default text)
    // appends a nested ParameterCard; its Name input becomes text input [2].
    await panel.getByRole("button", { name: "Add property" }).click();
    await panel.locator('input[type="text"]').nth(2).fill("city");

    // "Add param" (Parameters section header, line 1851) appends a second
    // top-level parameter; its Name input becomes text input [3].
    await panel.getByRole("button", { name: "Add param" }).click();
    await panel.locator('input[type="text"]').nth(3).fill("count");

    await panel.getByRole("button", { name: "Add tool" }).click();

    await expect(panel).toBeHidden({ timeout: 15000 });
    const row = page.locator("div.grid").filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 15000 });

    await row.getByRole("button").click();
    await expect(
      page.getByRole("heading", { name: "Delete tool" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(row).toHaveCount(0, { timeout: 15000 });
  });

  test("edits an existing webhook tool via row click, saves, then deletes", async ({
    page,
  }) => {
    const name = `E2E Edit Webhook ${Date.now()}`;
    const newDescription = `Edited notification service ${Date.now()}`;

    await page.goto("/tools");
    await expect(page.getByRole("heading", { name: "Tools" })).toBeVisible();

    // --- Create a webhook tool to edit (POST → body required). ------------
    await page
      .getByRole("button", { name: "Add webhook tool" })
      .first()
      .click();
    const panel = page.locator(".fixed.inset-0.z-50");
    await expect(
      panel.getByRole("heading", { name: "Add webhook tool" }),
    ).toBeVisible();

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
    await panel
      .getByPlaceholder("Describe the body structure")
      .fill("The JSON body of the request.");

    await panel.getByRole("button", { name: "Add tool" }).click();
    await expect(panel).toBeHidden({ timeout: 15000 });

    const row = page.locator("div.grid").filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 15000 });

    // --- Reopen in edit mode via row click (openEditToolDialog). ----------
    // Clicking the row (not the trailing delete button) opens the edit sidebar,
    // which triggers loadToolData → GET /tools/{uuid} and rehydrates the form.
    await row.getByText(name).click();
    await expect(
      panel.getByRole("heading", { name: "Edit webhook tool" }),
    ).toBeVisible({ timeout: 15000 });

    // Existing values are loaded back into the form (proves loadToolData ran).
    await expect(
      panel.getByPlaceholder(
        "An informative name for the tool that reflects its purpose",
      ),
    ).toHaveValue(name, { timeout: 15000 });
    await expect(
      panel.getByPlaceholder("https://example.com/{hi}/webhook"),
    ).toHaveValue("https://example.com/webhook");

    // Change the description and save (updateTool → PUT /tools/{uuid}). The
    // submit button reads "Save" (not "Add tool") in edit mode.
    await panel
      .getByPlaceholder(
        "Describe to the LLM how and when to use the tool along with what should be passed to the tool",
      )
      .fill(newDescription);
    await panel.getByRole("button", { name: "Save", exact: true }).click();
    await expect(panel).toBeHidden({ timeout: 15000 });

    // The edited description is reflected in the list row (proves the PUT stuck).
    await expect(row).toContainText(newDescription, { timeout: 15000 });

    await row.getByRole("button").click();
    await expect(
      page.getByRole("heading", { name: "Delete tool" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(row).toHaveCount(0, { timeout: 15000 });
  });

  test("webhook dialog: empty submit shows validation errors and blocks create", async ({
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

    // Submit with everything blank. handleSubmit → collectIncompleteFields
    // surfaces inline FieldErrors and does NOT close/create anything.
    await panel.getByRole("button", { name: "Add tool" }).click();

    // Name + webhook URL both flag their required errors.
    await expect(
      panel.getByText("Name cannot be empty").first(),
    ).toBeVisible({ timeout: 15000 });
    await expect(panel.getByText("URL is required")).toBeVisible();
    // POST is the default method, so the body Description error also renders.
    await expect(
      panel.getByText("Description cannot be empty").first(),
    ).toBeVisible();

    // Dialog stays open (nothing was created).
    await expect(
      panel.getByRole("heading", { name: "Add webhook tool" }),
    ).toBeVisible();

    await panel.getByRole("button", { name: "Cancel" }).click();
    await expect(panel).toBeHidden({ timeout: 15000 });
  });

  test("structured-output dialog: duplicate name surfaces a conflict and blocks the second create", async ({
    page,
  }) => {
    const name = `E2E Dup ${Date.now()}`;

    await page.goto("/tools");
    await expect(page.getByRole("heading", { name: "Tools" })).toBeVisible();

    // --- First create succeeds. ------------------------------------------
    await page
      .getByRole("button", { name: "Add structured output tool" })
      .first()
      .click();
    const panel = page.locator(".fixed.inset-0.z-50");
    await expect(
      panel.getByRole("heading", { name: "Add structured output tool" }),
    ).toBeVisible();
    await panel
      .getByPlaceholder(
        "An informative name for the tool that reflects its purpose",
      )
      .fill(name);
    await panel.locator('input[type="text"]').nth(1).fill("query");
    await panel.getByRole("button", { name: "Add tool" }).click();
    await expect(panel).toBeHidden({ timeout: 15000 });

    const row = page.locator("div.grid").filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 15000 });

    // --- Second create with the SAME name hits the backend 409. ----------
    // createTool → readNameConflictMessage sets nameConflictError, keeps the
    // dialog open instead of closing on success.
    await page
      .getByRole("button", { name: "Add structured output tool" })
      .first()
      .click();
    await expect(
      panel.getByRole("heading", { name: "Add structured output tool" }),
    ).toBeVisible();
    await panel
      .getByPlaceholder(
        "An informative name for the tool that reflects its purpose",
      )
      .fill(name);
    await panel.locator('input[type="text"]').nth(1).fill("query");
    await panel.getByRole("button", { name: "Add tool" }).click();

    // The dialog stays open (the conflict blocked the create). Give the POST a
    // round trip; on success it would have hidden the panel.
    await expect(
      panel.getByRole("heading", { name: "Add structured output tool" }),
    ).toBeVisible({ timeout: 15000 });
    await expect(panel).toBeVisible();

    await panel.getByRole("button", { name: "Cancel" }).click();
    await expect(panel).toBeHidden({ timeout: 15000 });

    // Exactly one tool with that name exists (the dup was never created).
    await expect(row).toHaveCount(1);

    // Cleanup.
    await row.getByRole("button").click();
    await expect(
      page.getByRole("heading", { name: "Delete tool" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(row).toHaveCount(0, { timeout: 15000 });
  });

  // NOTE: a "GET webhook (no body block)" create test was dropped — body-less
  // webhook creates don't land back on /tools the way POST/structured-output do
  // (the page ends on /agents), likely a real app quirk worth a separate look.
  // Marginal branch; the POST-webhook and structured-output creates cover the
  // rest of AddToolDialog.

  test("creates a webhook tool through the JSON editor, then deletes it", async ({
    page,
  }) => {
    const name = `E2E JSON Webhook ${Date.now()}`;

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

    // Toggle to the JSON editor and paste a complete, valid webhook definition.
    // handleJsonChange live-syncs it into form state (applyToolJson, webhook
    // branch); submitting then runs the normal createTool path.
    await panel.getByRole("button", { name: "JSON", exact: true }).click();
    const jsonEditor = panel.getByPlaceholder(
      '{ "name": "", "description": "", "parameters": { "type": "object", "properties": {} } }',
    );
    await expect(jsonEditor).toBeVisible();

    const toolJson = JSON.stringify(
      {
        name,
        description: "Sends structured data to an external API.",
        webhook: {
          method: "POST",
          url: "https://example.com/json-webhook",
          timeout: 20,
          headers: [],
          queryParameters: { type: "object", properties: {} },
          body: {
            description: "The JSON body of the request.",
            parameters: { type: "object", properties: {} },
          },
        },
      },
      null,
      2,
    );
    await jsonEditor.fill(toolJson);

    await panel.getByRole("button", { name: "Add tool" }).click();
    await expect(panel).toBeHidden({ timeout: 15000 });

    const row = page.locator("div.grid").filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).toContainText("Webhook");

    await row.getByRole("button").click();
    await expect(
      page.getByRole("heading", { name: "Delete tool" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(row).toHaveCount(0, { timeout: 15000 });
  });

  test("structured-output dialog: array-typed parameter builds and creates", async ({
    page,
  }) => {
    const name = `E2E Array Schema ${Date.now()}`;

    await page.goto("/tools");
    await expect(page.getByRole("heading", { name: "Tools" })).toBeVisible();

    await page
      .getByRole("button", { name: "Add structured output tool" })
      .first()
      .click();
    const panel = page.locator(".fixed.inset-0.z-50");
    await expect(
      panel.getByRole("heading", { name: "Add structured output tool" }),
    ).toBeVisible();

    await panel
      .getByPlaceholder(
        "An informative name for the tool that reflects its purpose",
      )
      .fill(name);

    // One blank param row is auto-added. Name it, then switch its Data type to
    // "array" — mounts the array Item builder (ParameterCard "array" branch),
    // exercising parameterToJsonSchema's array serialization on create.
    await panel.locator('input[type="text"]').nth(1).fill("tags");
    await panel.locator("select").first().selectOption("array");
    // The array Item card renders its own type select (default "string"); the
    // default string item is enough to serialize a valid array schema.
    await expect(panel.getByText("Item")).toBeVisible();

    await panel.getByRole("button", { name: "Add tool" }).click();
    await expect(panel).toBeHidden({ timeout: 15000 });

    const row = page.locator("div.grid").filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 15000 });

    await row.getByRole("button").click();
    await expect(
      page.getByRole("heading", { name: "Delete tool" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(row).toHaveCount(0, { timeout: 15000 });
  });
});
