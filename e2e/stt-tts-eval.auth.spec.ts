// Render smoke for the STT / TTS *evaluation builder* pages (`/stt/new`,
// `/tts/new`). These are distinct from the STT/TTS *dataset* CRUD covered by
// datasets.auth.spec.ts: each mounts the large SpeechToText/TextToSpeech
// evaluation component (provider pickers, inline dataset editor) that no other
// spec exercises. We only assert the builder mounted — a full evaluate run
// needs uploaded audio and is out of scope here. Import from ./fixtures for
// E2E coverage. Run with `npm run test:e2e:integration` (needs a backend).
import { test, expect } from "./fixtures";
import { waitForOrgReady, workspacePath } from "./helpers";

const BUILDERS: ReadonlyArray<{ path: string }> = [
  { path: "/stt/new" },
  { path: "/tts/new" },
];

test.describe("STT/TTS evaluation builder (authenticated, real backend)", () => {
  for (const { path } of BUILDERS) {
    test(`${path} mounts the evaluation builder`, async ({ page }) => {
      await page.goto(path);
      await waitForOrgReady(page);

      // We stayed on the route (seeded token cleared middleware).
      await expect(page).toHaveURL(workspacePath(path));

      // The custom header renders the breadcrumb trail and the primary
      // "Evaluate" action once the builder component has mounted.
      await expect(
        page.getByRole("button", { name: "Evaluate" }).first(),
      ).toBeVisible({ timeout: 20000 });
    });
  }
});
