/**
 * Colours an evaluator's rubric rows can carry (`output_config.scale[].color`).
 * A picked answer takes its row's colour, so a reader sees at a glance whether
 * they chose the good, the middle or the bad end of a scale.
 */

const HEX = /^#?([0-9a-f]{6})$/i;

/** `#RRGGBB` from a six-digit hex colour with or without the `#`, else null. */
export function normaliseHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = HEX.exec(value.trim());
  return m ? `#${m[1].toUpperCase()}` : null;
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = "#FFFFFF";
/** Noora's soft black, the brand's own text colour on light backgrounds. */
const SOFT_BLACK = "#383838";

/** White or soft black, whichever reads better on this colour. */
export function readableInk(hex: string): string {
  return contrast(hex, WHITE) >= contrast(hex, SOFT_BLACK) ? WHITE : SOFT_BLACK;
}

/**
 * The two CSS variables a picked answer reads, `--pick` for its fill and
 * `--pick-ink` for the writing on it, or undefined when the row has no usable
 * colour (the answer then wears the page's own selection colour). Variables
 * only: a page that does not read them looks exactly as it did.
 */
export function pickColourVars(
  color: unknown,
): Record<"--pick" | "--pick-ink", string> | undefined {
  const hex = normaliseHex(color);
  return hex ? { "--pick": hex, "--pick-ink": readableInk(hex) } : undefined;
}
