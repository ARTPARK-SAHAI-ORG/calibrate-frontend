/**
 * Place model-name labels beside Pareto bubbles so they stay proximal to their
 * points without stacking on each other.
 *
 * Strategy:
 *  1. Prefer the right of the bubble (left when near the right edge).
 *  2. Vertically pack labels on each side so they keep LABEL_GAP apart.
 *  3. Estimate each label's pixel box from character count; when two boxes
 *     collide (same side OR across sides for overlapping x-spans), flip the
 *     lower-priority label's side and re-pack. Repeat a few times.
 *
 * Positions are estimated from known chart width/height and axis domains —
 * recharts 3 does not hand reliable scales to Customized.
 */

export type ParetoLabelInput = {
  model: string;
  label: string;
  cost: number;
  passRate: number;
  /** Bubble radius in px (un-hovered). */
  radius: number;
};

export type ParetoLabelPlacement = {
  side: "left" | "right";
  /** Vertical offset from the bubble's cy (ly - py). */
  dy: number;
};

export type ParetoLabelLayoutOptions = {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  xDomainMax: number;
  yDomain: [number, number];
  labelGap?: number;
  /** Approximate average glyph width at the label font size (11px). */
  charWidth?: number;
  labelHalfHeight?: number;
  /** Vertical band (px) inside which x-overlapping labels still count as a clash. */
  interferenceBand?: number;
};

// Font is 11px medium — model ids are mostly monospace-ish (slashes, digits).
const DEFAULT_CHAR_WIDTH = 6.6;
const DEFAULT_LABEL_HALF_H = 7;
/** Soft vertical window for "these two long names still fight each other". */
const DEFAULT_INTERFERENCE_BAND = 36;
const MAX_RESOLVE_PASSES = 4;

type Entry = {
  model: string;
  label: string;
  px: number;
  py: number;
  r: number;
  side: "left" | "right";
  ly: number;
  textW: number;
};

function estimateTextWidth(label: string, charWidth: number): number {
  return Math.max(charWidth * 2, label.length * charWidth);
}

function packVertically(
  entries: Entry[],
  side: "left" | "right",
  plotTop: number,
  plotBottom: number,
  labelGap: number,
): void {
  const grp = entries.filter((e) => e.side === side).sort((a, b) => a.py - b.py);
  for (let i = 1; i < grp.length; i++) {
    grp[i].ly = Math.max(grp[i].py, grp[i - 1].ly + labelGap);
  }
  if (!grp.length) return;
  const last = grp[grp.length - 1];
  if (last.ly > plotBottom - 6) {
    last.ly = plotBottom - 6;
    for (let i = grp.length - 2; i >= 0; i--) {
      grp[i].ly = Math.min(grp[i].ly, grp[i + 1].ly - labelGap);
    }
  }
  for (const e of grp) e.ly = Math.max(e.ly, plotTop + 6);
}

/** Axis-aligned label box in chart pixels. */
function labelBox(
  e: Entry,
  halfH: number,
): { left: number; right: number; top: number; bottom: number } {
  const pad = 2;
  if (e.side === "right") {
    const left = e.px + e.r + 5;
    return {
      left: left - pad,
      right: left + e.textW + pad,
      top: e.ly - halfH,
      bottom: e.ly + halfH,
    };
  }
  const right = e.px - e.r - 5;
  return {
    left: right - e.textW - pad,
    right: right + pad,
    top: e.ly - halfH,
    bottom: e.ly + halfH,
  };
}

function boxesOverlap(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** True when labels' horizontal spans cross and they sit in the same vertical band
 *  (even if a strict AABB cleared via a tiny LABEL_GAP — long names still look
 *  stacked / painted-over when they trail across the same x-lane). */
function labelsInterfere(
  a: Entry,
  b: Entry,
  halfH: number,
  band: number,
): boolean {
  const ba = labelBox(a, halfH);
  const bb = labelBox(b, halfH);
  if (boxesOverlap(ba, bb)) return true;
  const xOverlap = ba.left < bb.right && ba.right > bb.left;
  return xOverlap && Math.abs(a.ly - b.ly) < band;
}

/**
 * Lay out labels for the given points. Returns a map of model id → side + dy.
 * Callers apply `dy` as `labelY = cy + dy` using recharts' real bubble cy.
 */
export function layoutParetoLabels(
  points: ParetoLabelInput[],
  opts: ParetoLabelLayoutOptions,
): Map<string, ParetoLabelPlacement> {
  const labelGap = opts.labelGap ?? 15;
  const charWidth = opts.charWidth ?? DEFAULT_CHAR_WIDTH;
  const halfH = opts.labelHalfHeight ?? DEFAULT_LABEL_HALF_H;
  const band = opts.interferenceBand ?? DEFAULT_INTERFERENCE_BAND;
  const { margin, height, width, xDomainMax, yDomain } = opts;

  const plotTop = margin.top;
  const plotBottom = height - margin.bottom;
  const plotH = Math.max(1, plotBottom - plotTop);
  const plotW = Math.max(1, width - margin.left - margin.right);
  const ySpan = Math.max(1e-9, yDomain[1] - yDomain[0]);
  const xMax = Math.max(1e-9, xDomainMax);

  const entries: Entry[] = points.map((p) => {
    const t = (p.passRate - yDomain[0]) / ySpan;
    const py = plotTop + (1 - t) * plotH;
    const px = margin.left + (p.cost / xMax) * plotW;
    const side: "left" | "right" = p.cost / xMax > 0.68 ? "left" : "right";
    return {
      model: p.model,
      label: p.label,
      px,
      py,
      r: p.radius,
      side,
      ly: py,
      textW: estimateTextWidth(p.label, charWidth),
    };
  });

  const packBoth = () => {
    packVertically(entries, "left", plotTop, plotBottom, labelGap);
    packVertically(entries, "right", plotTop, plotBottom, labelGap);
  };

  packBoth();

  // Resolve AABB collisions by flipping crowded / longer labels to the other
  // side, then re-packing. One pass may flip several non-conflicting victims;
  // repeats until stable or we hit the cap.
  for (let pass = 0; pass < MAX_RESOLVE_PASSES; pass++) {
    const victims = new Set<Entry>();
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i];
        const b = entries[j];
        if (!labelsInterfere(a, b, halfH, band)) continue;

        // Prefer flipping the label closer to mid-plot on its current side
        // (more room on the opposite side); break ties by text length.
        const midX = margin.left + plotW / 2;
        const aTowardCenter =
          a.side === "right" ? a.px > midX : a.px < midX;
        const bTowardCenter =
          b.side === "right" ? b.px > midX : b.px < midX;
        let victim = b;
        if (aTowardCenter && !bTowardCenter) victim = a;
        else if (aTowardCenter === bTowardCenter && a.textW > b.textW) victim = a;
        victims.add(victim);
      }
    }
    if (victims.size === 0) break;
    for (const v of victims) {
      v.side = v.side === "right" ? "left" : "right";
    }
    packBoth();
  }

  // Final vertical safety: if two same-side labels still share a y-band after
  // flips (AABB could still overlap for very long names), push them further apart.
  for (const side of ["left", "right"] as const) {
    const grp = entries.filter((e) => e.side === side).sort((a, b) => a.ly - b.ly);
    for (let i = 1; i < grp.length; i++) {
      const prev = grp[i - 1];
      const cur = grp[i];
      // Need enough vertical gap that their horizontal spans can coexist visually
      // even when one label is much longer — base gap grows slightly with width.
      const needed = Math.max(labelGap, halfH * 2 + 2);
      if (cur.ly < prev.ly + needed) {
        cur.ly = prev.ly + needed;
      }
    }
    if (grp.length) {
      const last = grp[grp.length - 1];
      if (last.ly > plotBottom - 6) {
        last.ly = plotBottom - 6;
        for (let i = grp.length - 2; i >= 0; i--) {
          grp[i].ly = Math.min(grp[i].ly, grp[i + 1].ly - labelGap);
        }
      }
      for (const e of grp) e.ly = Math.max(e.ly, plotTop + 6);
    }
  }

  const out = new Map<string, ParetoLabelPlacement>();
  for (const e of entries) {
    out.set(e.model, { side: e.side, dy: e.ly - e.py });
  }
  return out;
}
