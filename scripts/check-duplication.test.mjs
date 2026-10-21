// node --test scripts/check-duplication.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseChangedLines,
  clonesTouchingChanges,
  repeatedUrls,
} from "./check-duplication.mjs";

const diff = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -3,0 +4,2 @@ x
+one
+two
@@ -10 +12 @@ y
-old
+new
diff --git a/src/gone.ts b/src/gone.ts
--- a/src/gone.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-a
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -5,2 +4,0 @@
-removed only`;

test("reads the changed lines on the new side of each file", () => {
  const changed = parseChangedLines(diff);
  assert.deepEqual([...changed.get("src/a.ts")], [4, 5, 12]);
  assert.equal(changed.has("src/gone.ts"), false);
  assert.deepEqual([...changed.get("src/b.ts")], []);
});

test("keeps only copies where either side covers a changed line", () => {
  const changed = new Map([["src/a.ts", new Set([12])]]);
  const clone = (name, start, end) => ({
    firstFile: { name, start, end },
    secondFile: { name: "src/old.ts", start: 1, end: 30 },
  });
  const kept = clonesTouchingChanges(
    [clone("src/a.ts", 10, 20), clone("src/a.ts", 13, 40), clone("src/x.ts", 1, 50)],
    changed,
  );
  assert.equal(kept.length, 1);
  assert.equal(kept[0].firstFile.start, 10);
  // the changed file on the second side counts too
  const swapped = { firstFile: { name: "src/old.ts", start: 1, end: 9 }, secondFile: { name: "src/a.ts", start: 12, end: 12 } };
  assert.equal(clonesTouchingChanges([swapped], changed).length, 1);
});

test("flags a typed web address another file already has", () => {
  const files = {
    "src/a.ts": 'const x = 1;\nconst u = "https://chat.whatsapp.com/abc";\n',
    "src/constants/links.ts": 'export const W = "https://chat.whatsapp.com/abc";\n',
    "src/a.test.ts": 'const u = "https://chat.whatsapp.com/abc";\n',
  };
  const holding = (url) => Object.keys(files).filter((f) => files[f].includes(url));
  const changed = new Map([
    ["src/a.ts", new Set([1, 2])],
    ["src/constants/links.ts", new Set([1])],
    ["src/a.test.ts", new Set([1])],
  ]);
  const found = repeatedUrls(changed, (f) => files[f], holding);
  assert.deepEqual(found, [
    {
      file: "src/a.ts",
      line: 2,
      url: "https://chat.whatsapp.com/abc",
      others: ["src/constants/links.ts", "src/a.test.ts"],
    },
  ]);
});

test("an address used in one file only is fine", () => {
  const files = { "src/a.ts": 'x("https://www.youtube.com/embed/1")' };
  const found = repeatedUrls(
    new Map([["src/a.ts", new Set([1])]]),
    (f) => files[f],
    () => ["src/a.ts"],
  );
  assert.deepEqual(found, []);
});
