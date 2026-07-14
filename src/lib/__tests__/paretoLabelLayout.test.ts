import {
  layoutParetoLabels,
  type ParetoLabelInput,
} from "@/lib/paretoLabelLayout";

const MARGIN = { top: 30, right: 90, bottom: 44, left: 48 };

const baseOpts = {
  width: 640,
  height: 400,
  margin: MARGIN,
  xDomainMax: 0.01,
  yDomain: [70, 100] as [number, number],
  labelGap: 15,
  charWidth: 6.6,
  labelHalfHeight: 7,
};

function boxFor(
  p: ParetoLabelInput,
  placement: { side: "left" | "right"; dy: number },
  opts = baseOpts,
) {
  const plotTop = opts.margin.top;
  const plotBottom = opts.height - opts.margin.bottom;
  const plotH = plotBottom - plotTop;
  const plotW = opts.width - opts.margin.left - opts.margin.right;
  const ySpan = opts.yDomain[1] - opts.yDomain[0];
  const py = plotTop + (1 - (p.passRate - opts.yDomain[0]) / ySpan) * plotH;
  const px = opts.margin.left + (p.cost / opts.xDomainMax) * plotW;
  const ly = py + placement.dy;
  const textW = Math.max(opts.charWidth * 2, p.label.length * opts.charWidth);
  const halfH = opts.labelHalfHeight;
  if (placement.side === "right") {
    const left = px + p.radius + 5;
    return { left, right: left + textW, top: ly - halfH, bottom: ly + halfH };
  }
  const right = px - p.radius - 5;
  return { left: right - textW, right, top: ly - halfH, bottom: ly + halfH };
}

function overlaps(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number },
) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

describe("layoutParetoLabels", () => {
  it("keeps a lone label on the right by default", () => {
    const points: ParetoLabelInput[] = [
      { model: "a", label: "cheap", cost: 0.001, passRate: 90, radius: 9 },
    ];
    const layout = layoutParetoLabels(points, baseOpts);
    expect(layout.get("a")?.side).toBe("right");
    expect(layout.get("a")?.dy).toBe(0);
  });

  it("puts a near-right-edge bubble's label on the left", () => {
    const points: ParetoLabelInput[] = [
      { model: "edge", label: "premium", cost: 0.009, passRate: 95, radius: 9 },
    ];
    const layout = layoutParetoLabels(points, baseOpts);
    expect(layout.get("edge")?.side).toBe("left");
  });

  it("splits long names in a tight cost cluster so label boxes do not overlap", () => {
    // Tight cluster + short labelGap: vertical packing alone cannot clear the
    // AABB of long provider/model ids, so the layout must flip some to the left.
    const opts = { ...baseOpts, labelGap: 4, labelHalfHeight: 8 };
    const points: ParetoLabelInput[] = [
      {
        model: "a",
        label: "openai/gpt-4.1",
        cost: 0.005,
        passRate: 75,
        radius: 9,
      },
      {
        model: "b",
        label: "openai/gpt-4o",
        cost: 0.0051,
        passRate: 75.1,
        radius: 8,
      },
      {
        model: "c",
        label: "anthropic/claude-sonnet-4",
        cost: 0.0052,
        passRate: 75.2,
        radius: 10,
      },
    ];
    const layout = layoutParetoLabels(points, opts);

    const sides = new Set(
      points.map((p) => layout.get(p.model)?.side).filter(Boolean),
    );
    expect(sides.size).toBe(2);

    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const pa = layout.get(points[i].model)!;
        const pb = layout.get(points[j].model)!;
        expect(
          overlaps(boxFor(points[i], pa, opts), boxFor(points[j], pb, opts)),
        ).toBe(false);
      }
    }
  });

  it("flips a long left-bubble label that would cover a neighbor to its right", () => {
    // A sits left with a long right-side label; B sits mid-plot at the same
    // pass rate. Without a flip, A's text spans over B's label box.
    const points: ParetoLabelInput[] = [
      {
        model: "left",
        label: "openai/gpt-4.1-mini-long-name",
        cost: 0.002,
        passRate: 85,
        radius: 9,
      },
      {
        model: "mid",
        label: "openai/gpt-4o",
        cost: 0.0045,
        passRate: 85,
        radius: 9,
      },
    ];
    const layout = layoutParetoLabels(points, baseOpts);
    const left = layout.get("left")!;
    const mid = layout.get("mid")!;
    expect(
      overlaps(boxFor(points[0], left), boxFor(points[1], mid)),
    ).toBe(false);
    // At least one of them must leave the shared right side.
    expect(left.side === "right" && mid.side === "right").toBe(false);
  });

  it("vertically separates same-side labels that share a pass-rate band", () => {
    const points: ParetoLabelInput[] = [
      { model: "a", label: "A", cost: 0.001, passRate: 80, radius: 9 },
      { model: "b", label: "B", cost: 0.002, passRate: 80.2, radius: 9 },
    ];
    const layout = layoutParetoLabels(points, baseOpts);
    const da = layout.get("a")!;
    const db = layout.get("b")!;
    // Both prefer right; one must be nudged so they stay LABEL_GAP apart.
    expect(da.side).toBe("right");
    expect(db.side).toBe("right");
    // Reconstruct packed label ys — centers stay ≥ LABEL_GAP apart.
    const plotTop = baseOpts.margin.top;
    const plotH =
      baseOpts.height - baseOpts.margin.top - baseOpts.margin.bottom;
    const ySpan = baseOpts.yDomain[1] - baseOpts.yDomain[0];
    const py = (pr: number) =>
      plotTop + (1 - (pr - baseOpts.yDomain[0]) / ySpan) * plotH;
    const lyA = py(80) + da.dy;
    const lyB = py(80.2) + db.dy;
    expect(Math.abs(lyA - lyB)).toBeGreaterThanOrEqual(15);
  });
});
