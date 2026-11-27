// node --test scripts/check-duplication.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseChangedLines,
  newClones,
  repeatedUrls,
} from "./check-duplication.mjs";

const diff = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -3,0 +4,2 @@ x
+one
+++ not a header, an added line starting with ++
@@ -10 +12 @@ y
-old
+new
diff --git a/src/gone.ts b/src/gone.ts
--- a/src/gone.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-a
diff --git a/src/a b.ts b/src/a b.ts
--- a/src/a b.ts\t
+++ b/src/a b.ts\t
@@ -5,2 +4,0 @@
-removed only`;

test("reads the changed lines on the new side of each file", () => {
  const changed = parseChangedLines(diff);
  assert.deepEqual([...changed.get("src/a.ts")], [4, 5, 12]);
  assert.equal(changed.has("src/gone.ts"), false);
  assert.deepEqual([...changed.get("src/a b.ts")], []);
});

const side = (name, start, end) => ({ name, start, end });
const clone = (first) => ({ firstFile: first, secondFile: side("src/old.ts", 1, 30) });

test("a copy counts as new when at least half of one side was changed", () => {
  const changed = new Map([["src/a.ts", new Set([10, 11, 12, 13, 14])]]);
  assert.equal(newClones([clone(side("src/a.ts", 10, 19))], changed).length, 1);
  // one line edited inside an older copy is allowed
  assert.equal(newClones([clone(side("src/a.ts", 14, 40))], changed).length, 0);
  assert.equal(newClones([clone(side("src/x.ts", 10, 14))], changed).length, 0);
  // the changed file on the second side counts too
  const swapped = { firstFile: side("src/old.ts", 1, 9), secondFile: side("src/a.ts", 12, 12) };
  assert.equal(newClones([swapped], changed).length, 1);
});

const W = "https://chat.whatsapp.com/abc";
const run = (files, changed, before = {}) =>
  repeatedUrls(
    new Map(Object.entries(changed).map(([f, l]) => [f, new Set(l)])),
    (f) => files[f],
    (url) => Object.keys(files).filter((f) => files[f].includes(url)),
    (f) => before[f] ?? "",
  );

test("flags a typed web address another file already has", () => {
  const files = {
    "src/a.ts": `const x = 1;\nconst u = "${W}";\n`,
    "src/constants/links.ts": `export const W = "${W}";\n`,
    "src/a.test.ts": `const u = "${W}";\n`,
  };
  assert.deepEqual(
    run(files, { "src/a.ts": [1, 2], "src/constants/links.ts": [1], "src/a.test.ts": [1] }),
    [{ file: "src/a.ts", line: 2, url: W, others: ["src/constants/links.ts"] }],
  );
});

test("does not flag what is not a repeat", () => {
  const files = {
    // only used here
    "src/a.ts": 'x("https://www.youtube.com/embed/1")\n<svg xmlns="http://www.w3.org/2000/svg" />\nconst g = "https://github.com";\n// see https://nextjs.org/docs.\n',
    "src/b.tsx": '<svg xmlns="http://www.w3.org/2000/svg" />\nconst r = "https://github.com/org/repo";\n',
    "src/c.ts": `const old = "${W}";\n`,
    "src/d.ts": `const old = "${W}"; // edited\n`,
  };
  assert.deepEqual(run(files, { "src/a.ts": [1, 2, 3] }), []);
  // a full stop after an address is not part of it
  files["src/b.tsx"] += "const d = 'https://nextjs.org/docs';\n";
  assert.equal(run(files, { "src/a.ts": [4] })[0].url, "https://nextjs.org/docs");
  // editing a line that already held the address before this change
  assert.deepEqual(run(files, { "src/d.ts": [1] }, { "src/d.ts": `const old = "${W}";\n` }), []);
  assert.equal(run(files, { "src/d.ts": [1] }).length, 1);
});
