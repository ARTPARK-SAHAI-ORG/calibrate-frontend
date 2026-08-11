import React from "react";
import { render, screen } from "@/test-utils";
import { AgreementStatCard, agreementColor } from "../AgreementStatCard";

describe("agreementColor", () => {
  it("returns muted color for null/undefined", () => {
    expect(agreementColor(null)).toBe("text-muted-foreground");
    expect(agreementColor(undefined)).toBe("text-muted-foreground");
  });

  it("returns green for >= 75%", () => {
    expect(agreementColor(0.75)).toBe("text-green-600 dark:text-green-400");
    expect(agreementColor(1)).toBe("text-green-600 dark:text-green-400");
  });

  it("returns red for <= 50%", () => {
    expect(agreementColor(0.5)).toBe("text-red-600 dark:text-red-400");
    expect(agreementColor(0)).toBe("text-red-600 dark:text-red-400");
  });

  it("returns yellow for values between 50% and 75%", () => {
    expect(agreementColor(0.6)).toBe("text-yellow-600 dark:text-yellow-400");
  });
});

describe("AgreementStatCard", () => {
  it("renders the static pill variant", () => {
    render(
      <AgreementStatCard staticPillText="Overall" value="82%" />
    );
    expect(screen.getByText("Overall")).toBeInTheDocument();
    expect(screen.getByTitle("Overall")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
  });

  it("applies a custom valueClassName in the static pill variant", () => {
    render(
      <AgreementStatCard
        staticPillText="Overall"
        value="82%"
        valueClassName="text-green-600"
      />
    );
    expect(screen.getByText("82%").className).toContain("text-green-600");
  });

  it("renders the evaluator pill variant with a version label", () => {
    render(
      <AgreementStatCard
        evaluatorPill={{
          href: "/evaluators/ev-1",
          name: "Correctness",
          versionLabel: "v2",
        }}
        value="90%"
      />
    );
    const link = screen.getByRole("link", { name: /Correctness/ });
    expect(link).toHaveAttribute("href", "/evaluators/ev-1");
    expect(link).toHaveAttribute("title", "Open Correctness");
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("alignment")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
  });

  it("shows the evaluator's own result next to the agreement number", () => {
    render(
      <AgreementStatCard
        evaluatorPill={{ href: "/evaluators/ev-1", name: "Correctness" }}
        value="90%"
        result={{ label: "Correct", value: "75%", title: "3 of 4 items" }}
      />
    );
    const stat = screen.getByTitle("3 of 4 items");
    expect(stat).toHaveTextContent("Correct");
    expect(stat).toHaveTextContent("75%");
    expect(screen.getByText("Human agreement")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    // The word "alignment" is dropped once each number carries its own label.
    expect(screen.queryByText("alignment")).not.toBeInTheDocument();
  });

  it("renders the static pill variant with a result", () => {
    render(
      <AgreementStatCard
        staticPillText="Correctness v2"
        value="—"
        result={{ label: "Average score", value: "3.5 / 5" }}
      />
    );
    expect(screen.getByText("Average score")).toBeInTheDocument();
    expect(screen.getByText("3.5 / 5")).toBeInTheDocument();
  });

  it("renders the evaluator pill variant without a version label", () => {
    render(
      <AgreementStatCard
        evaluatorPill={{ href: "/evaluators/ev-2", name: "Tone" }}
        value="70%"
      />
    );
    expect(screen.getByText("Tone")).toBeInTheDocument();
    expect(screen.queryByText("v2")).not.toBeInTheDocument();
  });

  it("renders the evaluator pill variant with versionLabel explicitly null", () => {
    render(
      <AgreementStatCard
        evaluatorPill={{
          href: "/evaluators/ev-3",
          name: "Safety",
          versionLabel: null,
        }}
        value="55%"
      />
    );
    expect(screen.getByText("Safety")).toBeInTheDocument();
  });
});
