import React from "react";
import { render, screen } from "@/test-utils";
import { AboutMarketingSection } from "../AboutMarketingSection";

describe("AboutMarketingSection", () => {
  it("renders the team heading and subheading", () => {
    render(<AboutMarketingSection />);
    expect(screen.getByRole("heading", { name: "Team" })).toBeInTheDocument();
    expect(
      screen.getByText("Combined experience of 25+ years building AI systems")
    ).toBeInTheDocument();
  });

  it("renders links for each team member with correct href and label", () => {
    render(<AboutMarketingSection />);

    const amanLink = screen.getByRole("link", {
      name: "Aman Dalmia on LinkedIn",
    });
    expect(amanLink).toHaveAttribute(
      "href",
      "https://linkedin.com/in/aman-dalmia"
    );
    expect(amanLink).toHaveAttribute("target", "_blank");
    expect(amanLink).toHaveAttribute("rel", "noopener noreferrer");

    const jigarLink = screen.getByRole("link", {
      name: "Jigar Doshi on LinkedIn",
    });
    expect(jigarLink).toHaveAttribute(
      "href",
      "https://linkedin.com/in/jigarkdoshi"
    );

    expect(screen.getByText("Aman Dalmia")).toBeInTheDocument();
    expect(screen.getByText("Principal ML Engineer, Artpark")).toBeInTheDocument();
    expect(screen.getByText("Jigar Doshi")).toBeInTheDocument();
    expect(screen.getByText("Director of ML, Artpark")).toBeInTheDocument();

    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("src", "/team/aman.jpeg");
    expect(images[1]).toHaveAttribute("src", "/team/jigar.jpeg");
  });
});
