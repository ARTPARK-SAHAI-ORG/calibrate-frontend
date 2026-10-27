// Builds the AI tutor example from the backend's demo_replies.json in the
// fresh workspace auth.setup.ts made, runs everything, then saves one PNG per
// docs picture listed in shots.ts.
//
// Run with `npm run docs:screenshots` (it sets the fake backend's env), plus
// DOCS_SCREENSHOTS_OUT=<folder> and CALIBRATE_BACKEND_DIR=<backend checkout
// that has src/testing/demo_replies.json>.
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "../fixtures";
import { waitForOrgReady } from "../helpers";
import { loadDemo, seed } from "./seed";
import { shots } from "./shots";

const OUT = process.env.DOCS_SCREENSHOTS_OUT;

test("docs screenshots", async ({ page, browser, request }) => {
  if (!OUT) throw new Error("Set DOCS_SCREENSHOTS_OUT to the folder the PNGs go in.");
  test.setTimeout(20 * 60_000);
  fs.mkdirSync(OUT, { recursive: true });

  const demo = loadDemo();
  const seeded = await seed(request, demo);

  // Only the first goto needs the workspace resolved; later paths are opened
  // under it directly.
  await page.goto("/agents");
  await waitForOrgReady(page);
  const workspace = new URL(page.url()).pathname.split("/")[1];

  // New pages take the project's options, sign-in included, so clear it.
  const signedOut = await browser.newPage({ storageState: { cookies: [], origins: [] } });

  // Every shot is tried, so one run names all the broken ones.
  const failed: string[] = [];
  for (const shot of shots(demo, seeded)) {
    const p = shot.signedOut ? signedOut : page;
    try {
      await p.goto(shot.signedOut ? shot.path : `/${workspace}${shot.path}`);
      if (shot.action) await shot.action(p);
      await expect(shot.waitFor(p)).toBeVisible({ timeout: 30_000 });
      // Let fetched data and fonts settle after the awaited element appears.
      await p.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      // Move the pointer off any button so no hover tooltip shows.
      await p.mouse.move(720, 899);
      // The dev server's own badge is not part of the app.
      await p.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
      await p.screenshot({ path: path.join(OUT, `${shot.file}.png`), animations: "disabled" });
    } catch (err) {
      failed.push(`${shot.file}: ${String(err).split("\n")[0]}`);
      await p.screenshot({ path: test.info().outputPath(`${shot.file}.png`) }).catch(() => {});
    }
    // Close any dialog the shot opened so the next page opens cleanly.
    await p.keyboard.press("Escape");
  }
  expect(failed, "these shots did not show what they wait for").toEqual([]);
});
