import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const APP = join(process.cwd(), "src/app");
const layout = readFileSync(join(APP, "layout.tsx"), "utf8");

describe("the fonts the app loads", () => {
  // The build asks Google for a next/font/google font, and an unusual answer
  // fails the deployment. See "Fonts live in the repo" in CLAUDE.md.
  it("never asks Google for one during the build", () => {
    expect(layout).not.toContain('from "next/font/google"');
  });

  it("finds every file layout.tsx names", () => {
    const named = [...layout.matchAll(/src: "(\.\/fonts\/[^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(named).toHaveLength(4);
    for (const path of named) {
      expect(existsSync(join(APP, path))).toBe(true);
    }
  });

  it("keeps each file small enough to load on every page", () => {
    const dir = join(APP, "fonts");
    for (const file of readdirSync(dir)) {
      expect(statSync(join(dir, file)).size).toBeLessThan(100 * 1024);
    }
  });

  it("keeps a licence beside every font file", () => {
    const files = readdirSync(join(APP, "fonts"));
    const fonts = files.filter((file) => file.endsWith(".woff2"));
    expect(fonts).toHaveLength(4);
    for (const font of fonts) {
      expect(files).toContain(font.replace(".woff2", "-OFL.txt"));
    }
  });
});
