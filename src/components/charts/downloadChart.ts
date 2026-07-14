/**
 * Serialize the first <svg> inside `container` to a 2× PNG and trigger a
 * download. Adds a white background and a title band above the chart so the
 * exported image matches the on-card heading. Shared by the leaderboard bar
 * charts and the Pareto-frontier scatter chart so both export identically.
 */
export async function downloadChartPng(
  container: HTMLElement | null,
  title: string,
  filename?: string,
): Promise<void> {
  if (!container) return;

  const svgElement = container.querySelector("svg");
  if (!svgElement) return;

  const svgNS = "http://www.w3.org/2000/svg";
  const svgRect = svgElement.getBoundingClientRect();
  const w = svgRect.width;
  const h = svgRect.height;
  // Band at top for the same heading as the card (not inside the ref today).
  const titleBand = 40;
  const totalH = titleBand + h;

  // Deep-clone chart SVG only; strip root width/height/viewBox from the fragment.
  const chartFragment = svgElement.cloneNode(true) as SVGSVGElement;
  chartFragment.removeAttribute("width");
  chartFragment.removeAttribute("height");
  chartFragment.removeAttribute("style");
  // Serialized SVG has no CSS — Recharts leaves fill as currentColor on many
  // ticks/labels, so pin a readable slate fill.
  chartFragment.querySelectorAll("text, tspan").forEach((el) => {
    const fill = el.getAttribute("fill");
    if (!fill || fill === "currentColor") {
      el.setAttribute("fill", "#334155");
    }
  });

  const outer = document.createElementNS(svgNS, "svg");
  outer.setAttribute("xmlns", svgNS);
  outer.setAttribute("width", String(w));
  outer.setAttribute("height", String(totalH));
  outer.setAttribute("viewBox", `0 0 ${w} ${totalH}`);

  const bgRect = document.createElementNS(svgNS, "rect");
  bgRect.setAttribute("width", "100%");
  bgRect.setAttribute("height", "100%");
  bgRect.setAttribute("fill", "white");
  outer.appendChild(bgRect);

  const titleText = document.createElementNS(svgNS, "text");
  titleText.setAttribute("x", "16");
  titleText.setAttribute("y", "26");
  titleText.setAttribute(
    "font-family",
    "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  );
  titleText.setAttribute("font-size", "15");
  titleText.setAttribute("font-weight", "600");
  titleText.setAttribute("fill", "#0f172a");
  titleText.textContent = title;
  outer.appendChild(titleText);

  const chartGroup = document.createElementNS(svgNS, "g");
  chartGroup.setAttribute("transform", `translate(0, ${titleBand})`);
  while (chartFragment.firstChild) {
    chartGroup.appendChild(chartFragment.firstChild);
  }
  outer.appendChild(chartGroup);

  const svgData = new XMLSerializer().serializeToString(outer);
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const img = new Image();

  img.onload = () => {
    canvas.width = w * 2;
    canvas.height = totalH * 2;
    ctx?.scale(2, 2);
    ctx?.drawImage(img, 0, 0);
    URL.revokeObjectURL(svgUrl);

    const pngUrl = canvas.toDataURL("image/png");
    const downloadLink = document.createElement("a");
    downloadLink.href = pngUrl;
    downloadLink.download = `${
      filename || title.toLowerCase().replace(/\s+/g, "-")
    }.png`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  img.src = svgUrl;
}
