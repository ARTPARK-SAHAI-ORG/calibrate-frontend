import { readFileSync } from "fs";
import { join } from "path";

// Reads the line colours straight from the stylesheet the app ships.
const css = readFileSync(join(__dirname, "../../app/globals.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf("}", start));
}

function vars(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block(selector).matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi))
    out[m[1]] = m[2];
  return out;
}

const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const distance = (a: string, b: string) =>
  Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));

describe.each([":root", ".dark"])("chart colours in %s", (selector) => {
  const theme = vars(selector);
  const lines = Object.entries(theme).filter(([k]) => k.startsWith("chart-"));

  it("has eight line colours", () => {
    expect(lines).toHaveLength(8);
  });

  it("reads every line colour at 4.5:1 or more on the page background", () => {
    for (const [, hex] of lines)
      expect(contrast(hex, theme.background)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps every two line colours far enough apart to tell apart", () => {
    for (const [i, [, a]] of lines.entries())
      for (const [, b] of lines.slice(i + 1))
        expect(distance(a, b)).toBeGreaterThan(40);
  });
});
