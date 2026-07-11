import React from "react";
import { render, screen, fireEvent, act } from "@/test-utils";
import { IntegrationLogoMarquee } from "../IntegrationLogoMarquee";

function setMatchMedia(matches: boolean) {
  const listeners: Array<(e: { matches: boolean }) => void> = [];
  const mql = {
    matches,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: jest.fn((_event: string, cb: (e: { matches: boolean }) => void) => {
      listeners.push(cb);
    }),
    removeEventListener: jest.fn(),
  };
  window.matchMedia = jest.fn().mockImplementation(() => mql);
  return { mql, listeners };
}

describe("IntegrationLogoMarquee", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders the marquee track when reduced motion is not preferred", () => {
    setMatchMedia(false);
    const { container } = render(<IntegrationLogoMarquee />);

    expect(
      container.querySelector(".integration-marquee-track")
    ).toBeInTheDocument();
    // Brands are duplicated for the seamless scroll effect.
    expect(screen.getAllByText("Deepgram").length).toBe(2);
    expect(screen.getByText(/Supports integrations including/)).toBeInTheDocument();
  });

  it("renders a static wrapped grid when reduced motion is preferred", () => {
    setMatchMedia(true);
    const { container } = render(<IntegrationLogoMarquee />);

    expect(
      container.querySelector(".integration-marquee-track")
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Supported integrations")).toBeInTheDocument();
    // Not duplicated when statically rendered.
    expect(screen.getAllByText("Deepgram").length).toBe(1);
  });

  it("responds to prefers-reduced-motion change events", () => {
    const { mql, listeners } = setMatchMedia(false);
    render(<IntegrationLogoMarquee />);
    expect(screen.getAllByText("Deepgram").length).toBe(2);

    mql.matches = true;
    act(() => {
      listeners.forEach((cb) => cb({ matches: true }));
    });
  });

  it("shows a logoUrl-based image for brands with an explicit logoUrl", () => {
    setMatchMedia(true);
    const { container } = render(<IntegrationLogoMarquee />);
    const cartesiaImgs = Array.from(
      container.querySelectorAll("img")
    ).filter((img) => img.getAttribute("src") === "/integrations/cartesia.jpg");
    expect(cartesiaImgs.length).toBeGreaterThan(0);
  });

  it("falls back to initials when an image fails to load", () => {
    setMatchMedia(true);
    const { container } = render(<IntegrationLogoMarquee />);
    const deepgramImg = Array.from(container.querySelectorAll("img")).find(
      (img) =>
        img.getAttribute("src") ===
        "https://cdn.jsdelivr.net/npm/simple-icons/icons/deepgram.svg"
    );
    expect(deepgramImg).toBeDefined();
    fireEvent.error(deepgramImg as HTMLImageElement);
    // After the error, the fallback initials chip should be shown instead.
    expect(screen.getAllByText("DE").length).toBeGreaterThan(0);
  });

  it("derives initials from the first two words for multi-word brand names", () => {
    setMatchMedia(true);
    const { container } = render(<IntegrationLogoMarquee />);
    const smallestAiImg = Array.from(container.querySelectorAll("img")).find(
      (img) => img.getAttribute("src") === "/integrations/smallest-ai.jpg"
    );
    expect(smallestAiImg).toBeDefined();
    fireEvent.error(smallestAiImg as HTMLImageElement);
    // "Smallest AI" -> first letters of "Smallest" and "AI" -> "SA"
    expect(screen.getAllByText("SA").length).toBeGreaterThan(0);
  });
});
