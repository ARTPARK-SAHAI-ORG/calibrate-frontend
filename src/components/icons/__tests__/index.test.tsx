import React from "react";
import { render } from "@/test-utils";
import * as Icons from "../index";

const iconNames = Object.keys(Icons).filter(
  (key) => typeof (Icons as Record<string, unknown>)[key] === "function"
);

describe("icons/index", () => {
  it("exports at least one icon component", () => {
    expect(iconNames.length).toBeGreaterThan(0);
  });

  it.each(iconNames)("%s renders an svg element", (name) => {
    const IconComponent = (Icons as Record<string, React.FC<{ className?: string }>>)[
      name
    ];
    const { container } = render(<IconComponent className="test-class" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass("test-class");
  });

  it.each(iconNames)("%s renders without a className prop", (name) => {
    const IconComponent = (Icons as Record<string, React.FC<{ className?: string }>>)[
      name
    ];
    const { container } = render(<IconComponent />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
