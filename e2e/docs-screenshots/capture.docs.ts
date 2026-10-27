// Builds the AI tutor example from the backend's demo_replies.json in the
// fresh workspace auth.setup.ts made, runs everything, then saves one PNG per
// docs picture listed in shots.ts.
//
// Run with DOCS_SCREENSHOTS_OUT=<folder> npm run docs:screenshots.
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "../fixtures";
import { api, loadDemo, seed } from "./seed";
import { shots } from "./shots";

const OUT = process.env.DOCS_SCREENSHOTS_OUT;

test("docs screenshots", async ({ page, browser, request }) => {
  if (!OUT) throw new Error("Set DOCS_SCREENSHOTS_OUT to the folder the PNGs go in.");
  test.setTimeout(20 * 60_000);
  fs.mkdirSync(OUT, { recursive: true });

  const demo = loadDemo();
  const seeded = await seed(request, demo);

  // Pages open under the example's workspace by id: the account has a second
  // workspace, so letting the app pick one could land on the wrong one.
  const workspace = seeded.workspaceId;

  // New pages take the project's options, sign-in included, so clear it.
  const signedOut = await browser.newPage({ storageState: { cookies: [], origins: [] } });

  // Every shot is tried, so one run names all the broken ones.
  const failed: string[] = [];
  const call = <T>(urlPath: string, body?: unknown, method?: string) =>
    api<T>(request, urlPath, body, method);
  for (const shot of shots(demo, seeded, call)) {
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
      // Where the element the docs step points at sits, for the video.
      if (shot.highlight) {
        const box = await shot.highlight(p).boundingBox();
        if (!box) throw new Error("highlight element has no box");
        const json = { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) };
        fs.writeFileSync(path.join(OUT, `${shot.file}.box.json`), JSON.stringify(json));
      }
      await p.screenshot({ path: path.join(OUT, `${shot.file}.png`), animations: "disabled" });
    } catch (err) {
      failed.push(`${shot.file}: ${String(err).split("\n")[0]}`);
      await p.screenshot({ path: test.info().outputPath(`${shot.file}.png`) }).catch(() => {});
    }
    // Close any dialog the shot opened so the next page opens cleanly.
    await p.keyboard.press("Escape");
    // Faked answers belong to the one shot that set them up.
    await p.unrouteAll({ behavior: "ignoreErrors" });
  }
  expect(failed, "these shots did not show what they wait for").toEqual([]);
});
