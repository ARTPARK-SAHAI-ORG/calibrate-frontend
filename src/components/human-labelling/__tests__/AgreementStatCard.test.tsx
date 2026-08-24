import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import { AgreementStatCard, agreementColor } from "../AgreementStatCard";
import { fetchEvaluatorDetail } from "@/lib/evaluatorApi";

jest.mock("../../../hooks", () => ({
  ...jest.requireActual("../../../hooks"),
  useAccessToken: () => "tok",
}));

jest.mock("../../../lib/evaluatorApi", () => ({
  ...jest.requireActual("../../../lib/evaluatorApi"),
  fetchEvaluatorDetail: jest.fn(),
}));

jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));

// jsdom has no ResizeObserver; the prompt card measures its own overflow.
class MockResizeObserver {
  observe() {}
  disconnect() {}
}

beforeAll(() => {
  (
    global as unknown as { ResizeObserver: typeof MockResizeObserver }
  ).ResizeObserver = MockResizeObserver;
});

const mockFetch = fetchEvaluatorDetail as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue({
    uuid: "ev-1",
    name: "Correctness",
    description: "Rates correctness",
    output_type: "rating",
    evaluator_type: "llm",
    live_version_index: 0,
    versions: [
      {
        uuid: "v1",
        version_number: 1,
        judge_model: "google/gemini-2.5-flash",
        system_prompt: "Judge whether the reply is correct.",
        output_config: null,
        variables: null,
      },
    ],
  });
});

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
          uuid: "ev-1",
          name: "Correctness",
          versionLabel: "v2",
        }}
        value="90%"
      />
    );
    const button = screen.getByRole("button", { name: /Correctness/ });
    expect(button).toHaveAttribute("title", "Open Correctness");
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("alignment")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
  });

  it("opens the evaluator preview modal when the pill is clicked", async () => {
    const user = setupUser();
    render(
      <AgreementStatCard
        evaluatorPill={{ uuid: "ev-1", name: "Correctness" }}
        value="90%"
      />
    );
    expect(mockFetch).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Correctness/ }));

    expect(
      await screen.findByRole("heading", { name: "Correctness" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Judge whether the reply is correct."),
    ).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith("ev-1", "tok");
  });

  it("shows the evaluator's own result next to the agreement number", () => {
    render(
      <AgreementStatCard
        evaluatorPill={{ uuid: "ev-1", name: "Correctness" }}
        value="90%"
        result={{
          label: "Correct",
          value: "75%",
          title: "3 of 4 items",
          ratio: 0.75,
        }}
      />
    );
    const stat = screen.getByTitle("3 of 4 items");
    expect(stat).toHaveTextContent("Correct");
    expect(stat).toHaveTextContent("75%");
    // Coloured on the same thresholds as the agreement number.
    expect(screen.getByText("75%").className).toContain("text-green-600");
    expect(screen.getByText("Human agreement")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    // The word "alignment" is dropped once each number carries its own label.
    expect(screen.queryByText("alignment")).not.toBeInTheDocument();
  });

  it("shows the result on its own when agreement belongs to another section", () => {
    render(
      <AgreementStatCard
        evaluatorPill={{ uuid: "ev-1", name: "Correctness" }}
        value={null}
        result={{
          label: "Score",
          value: "75%",
          title: "3 of 4 items",
          ratio: 0.75,
        }}
      />
    );
    const number = screen.getByText("75%");
    expect(screen.getByTitle("3 of 4 items")).toContainElement(number);
    expect(number.className).toContain("text-green-600");
    // The score keeps its own label, exactly as it has when the agreement
    // number sits next to it. Only the agreement number is left out.
    expect(screen.getByText("Score")).toBeInTheDocument();
    expect(screen.queryByText("Human agreement")).not.toBeInTheDocument();
    expect(screen.queryByText("alignment")).not.toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("drops the score's label when the section heading already names it", () => {
    render(
      <AgreementStatCard
        evaluatorPill={{ uuid: "ev-1", name: "Correctness" }}
        value={null}
        result={{
          label: "Score",
          value: "75%",
          title: "3 of 4 items",
          ratio: 0.75,
        }}
        showResultLabel={false}
      />,
    );
    const number = screen.getByText("75%");
    expect(number.className).toContain("text-green-600");
    expect(number.className).not.toContain("text-center");
    expect(number).toHaveAttribute("title", "3 of 4 items");
    expect(screen.queryByText("Score")).not.toBeInTheDocument();
    expect(screen.queryByText("alignment")).not.toBeInTheDocument();
  });

  it("keeps both labels when the agreement number is on the card too", () => {
    render(
      <AgreementStatCard
        evaluatorPill={{ uuid: "ev-1", name: "Correctness" }}
        value="90%"
        result={{ label: "Score", value: "75%", ratio: 0.75 }}
        showResultLabel={false}
      />,
    );
    expect(screen.getByText("Score")).toBeInTheDocument();
    expect(screen.getByText("Human agreement")).toBeInTheDocument();
  });

  it("renders the static pill variant with a result", () => {
    render(
      <AgreementStatCard
        staticPillText="Correctness v2"
        value="—"
        result={{ label: "Average score", value: "3.5 / 5", ratio: null }}
      />
    );
    expect(screen.getByText("Average score")).toBeInTheDocument();
    // No ratio, so the number keeps the default text colour.
    expect(screen.getByText("3.5 / 5").className).not.toMatch(
      /text-(green|red|yellow)/,
    );
  });

  it("renders the evaluator pill variant without a version label", () => {
    render(
      <AgreementStatCard
        evaluatorPill={{ uuid: "ev-2", name: "Tone" }}
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
          uuid: "ev-3",
          name: "Safety",
          versionLabel: null,
        }}
        value="55%"
      />
    );
    expect(screen.getByText("Safety")).toBeInTheDocument();
  });
});
