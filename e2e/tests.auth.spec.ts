// Backend-backed coverage for the /tests page's two large create surfaces:
// the AddTestDialog (two-phase: type picker → full editor) and the
// BulkUploadTestsModal. Both are heavy components that are ~unexercised by
// other specs. The first two tests MOUNT the dialogs; the latter two drive
// them further: Test 3 runs a real CSV through the bulk modal's client-side
// parse/validation/preview pipeline (both the happy path and the missing-
// column error), and Test 4 fills the AddTestDialog editor (name + a
// conversation message). We stop short of completing a backend create (a real
// create needs a filled default evaluator + a valid history) — a green test
// that exercises the client-side surfaces is the high-value, low-flake win.
// Import from ./fixtures for E2E coverage.
//
// Run with `npm run test:e2e:integration` (needs a backend, see e2e/README.md).
import { test, expect } from "./fixtures";

test.describe("Tests page (authenticated, real backend)", () => {
  test("opens the Create test dialog through to the editor, then closes", async ({
    page,
  }) => {
    const name = `E2E Test ${Date.now()}`;

    await page.goto("/tests");
    // Page header from src/app/tests/page.tsx (<h1>LLM Tests</h1>).
    await expect(
      page.getByRole("heading", { name: "LLM Tests" }),
    ).toBeVisible({ timeout: 20000 });

    // "Create test" appears either top-right (when tests exist) or inside the
    // empty-state placeholder card — both carry the same label, so .first().
    await page
      .getByRole("button", { name: "Create test" })
      .first()
      .click();

    // Phase 1: the two-phase create flow opens on a centred type picker.
    // Heading "Create a test" + label "Select the type of test" are from the
    // intro block in AddTestDialog.tsx (~line 2935).
    await expect(
      page.getByRole("heading", { name: "Create a test" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Select the type of test")).toBeVisible();

    // Pick the "Next reply test" card (TEST_TYPE_OPTIONS[0].title) to animate
    // into the full editor. This mounts the bulk of AddTestDialog.
    await page.getByRole("button", { name: "Next reply test" }).click();

    // Phase 2: the editor. The next-reply/evaluator tab renders a "Test name"
    // label + input with placeholder "Your test name" (AddTestDialog.tsx
    // ~line 3096-3103). Assert it mounted, then fill the trivially-fillable
    // name field.
    const nameInput = page.getByPlaceholder("Your test name");
    await expect(nameInput).toBeVisible({ timeout: 20000 });
    await nameInput.fill(name);
    await expect(nameInput).toHaveValue(name);

    // Close via the editor footer's "Back" button — it calls onClose directly
    // (no discard-changes guard), which unmounts the dialog.
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(nameInput).toHaveCount(0, { timeout: 15000 });
  });

  test("opens the Bulk upload modal, then closes", async ({ page }) => {
    await page.goto("/tests");
    await expect(
      page.getByRole("heading", { name: "LLM Tests" }),
    ).toBeVisible({ timeout: 20000 });

    // "Bulk upload" appears top-right or in the empty-state card — .first().
    await page
      .getByRole("button", { name: "Bulk upload" })
      .first()
      .click();

    // Heading "Bulk upload tests" + the "Select the type of test" label are
    // from BulkUploadTestsModal.tsx (~line 1298, ~1332).
    await expect(
      page.getByRole("heading", { name: "Bulk upload tests" }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Select the type of test")).toBeVisible();

    // Close via the modal's "Cancel" button (backdrop is intentionally
    // non-dismissing here).
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Bulk upload tests" }),
    ).toHaveCount(0, { timeout: 15000 });
  });

  // Test 3 — actually EXERCISE the bulk upload's client-side parse/validation/
  // preview pipeline (BulkUploadTestsModal.handleFileChange → Papa.parse →
  // column/JSON/tool validation → preview render), which is where the bulk of
  // that component's missed lines live. We use the TOOL-CALL type because it is
  // the most deterministic path: its CSV columns are fixed
  // (`name,conversation_history,tool_calls` — see baseColumns at
  // BulkUploadTestsModal.tsx ~line 734) and we can reference the inbuilt
  // `end_call` tool (INBUILT_TOOLS id, always in `knownToolNames`) so parsing
  // needs no pre-existing custom tools or evaluator selection. We stop at the
  // client-side preview (no backend POST) — that already covers the parse path.
  test("bulk upload: parses a valid tool-call CSV to preview, then rejects an invalid one", async ({
    page,
  }) => {
    await page.goto("/tests");
    await expect(
      page.getByRole("heading", { name: "LLM Tests" }),
    ).toBeVisible({ timeout: 20000 });

    await page
      .getByRole("button", { name: "Bulk upload" })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Bulk upload tests" }),
    ).toBeVisible({ timeout: 20000 });

    // Pick the "Tool Call" type card. Scope to the modal — the /tests page
    // behind it also has "Tool Call" filter pills, which would make a bare
    // name match ambiguous. Inside the modal the card's accessible name is
    // "Tool Call" + its description line, so match on a substring.
    const bulkModal = page.locator(".fixed.inset-0.z-50");
    await bulkModal.getByRole("button", { name: /Tool Call/ }).click();

    // A valid tool-call CSV: header exactly matches the modal's required
    // columns, one row whose conversation_history is a JSON array ending on a
    // user turn and whose tool_calls references the inbuilt `end_call` tool.
    // CSV double-quotes are escaped by doubling them ("").
    const bulkName = `Bulk E2E ${Date.now()}`;
    const validCsv =
      `name,conversation_history,tool_calls\n` +
      `"${bulkName}","[{""role"":""assistant"",""content"":""Anything else?""},` +
      `{""role"":""user"",""content"":""No thats all, thanks""}]",` +
      `"[{""tool"":""end_call"",""arguments"":{},""accept_any_arguments"":true}]"\n`;

    // The hidden <input type="file"> inside the drop zone. setInputFiles works
    // on hidden inputs. Selecting the "Tool Call" type kicks off a background
    // GET /tools fetch; if it hasn't landed yet, handleFileChange stashes the
    // file and the deferred-parse effect re-runs once tools are fetched — so
    // the preview assertion below just polls until it appears.
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "tool_call_tests.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(validCsv),
    });

    // Tool-call preview header renders "Found 1 test" only after a clean parse
    // (BulkUploadTestsModal.tsx ~line 1849). This is the key coverage signal.
    await expect(page.getByText(/Found 1 test/)).toBeVisible({
      timeout: 20000,
    });
    // The submit button reflects the parsed count too.
    await expect(
      page.getByRole("button", { name: /Upload 1 test/ }),
    ).toBeVisible({ timeout: 15000 });

    // Now exercise the validation-error branch: a CSV missing the required
    // `tool_calls` column trips the "Missing required columns" parseError
    // (BulkUploadTestsModal.tsx ~line 758).
    const invalidCsv =
      `name,conversation_history\n` +
      `"Bad row","[{""role"":""user"",""content"":""hi""}]"\n`;
    await fileInput.setInputFiles({
      name: "invalid_tests.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(invalidCsv),
    });
    await expect(page.getByText(/Missing required columns/)).toBeVisible({
      timeout: 15000,
    });

    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Bulk upload tests" }),
    ).toHaveCount(0, { timeout: 15000 });
  });

  // Test 4 — a full next-reply create through AddTestDialog. The "Next reply
  // test" editor opens PRE-SEEDED with an empty user/agent/user conversation
  // and the default Correctness evaluator already attached, so a real create
  // just needs: every seeded message given non-empty content (handleSubmit
  // rejects empty messages, AddTestDialog.tsx ~line 2832), the evaluator's
  // criteria variable filled, and the trailing turn is already a user message.
  // This exercises the submit/buildPayload/POST path — the bulk of the dialog.
  test("creates a next-reply test through the editor, then deletes it", async ({
    page,
  }) => {
    const name = `E2E Editor ${Date.now()}`;

    await page.goto("/tests");
    await expect(
      page.getByRole("heading", { name: "LLM Tests" }),
    ).toBeVisible({ timeout: 20000 });

    await page
      .getByRole("button", { name: "Create test" })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Create a test" }),
    ).toBeVisible({ timeout: 20000 });

    // Into the full editor via the "Next reply test" card (TEST_TYPE_OPTIONS[0]).
    await page.getByRole("button", { name: "Next reply test" }).click();

    const nameInput = page.getByPlaceholder("Your test name");
    await expect(nameInput).toBeVisible({ timeout: 20000 });
    await nameInput.fill(name);
    await expect(nameInput).toHaveValue(name);

    // Fill every seeded message (user / agent / user) with content — empty
    // messages fail the submit guard. Placeholders are role-specific
    // ("Enter user message" / "Enter agent message", AddTestDialog.tsx ~4107).
    const messageBoxes = page.getByPlaceholder(/Enter (user|agent) message/);
    await expect(messageBoxes.first()).toBeVisible({ timeout: 15000 });
    const boxCount = await messageBoxes.count();
    for (let i = 0; i < boxCount; i++) {
      await messageBoxes.nth(i).fill(`Sample conversation turn ${i + 1}.`);
    }

    // Fill the attached Correctness evaluator's criteria variable (its only
    // required input) so the evaluator-variable guard passes.
    await page
      .getByPlaceholder("Criteria that the agent's response should satisfy")
      .fill("The agent answers the user's question clearly and politely.");

    // Submit. The dialog closes and the test lands in the list on success.
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(nameInput).toHaveCount(0, { timeout: 20000 });

    // The name renders in both the desktop table row and the (DOM-present)
    // mobile card, so scope to the first (desktop) match.
    const nameCell = page.getByText(name, { exact: true }).first();
    await expect(nameCell).toBeVisible({ timeout: 20000 });

    // Clean up: delete via the row's "Delete test" icon button + confirm dialog.
    await nameCell
      .locator('xpath=ancestor::div[.//button[@title="Delete test"]][1]')
      .getByRole("button", { name: "Delete test" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Delete test" }),
    ).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText(name, { exact: true })).toHaveCount(0, {
      timeout: 15000,
    });
  });
});
