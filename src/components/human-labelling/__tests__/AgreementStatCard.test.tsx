import React from "react";
import { render, screen, setupUser, waitFor } from "@/test-utils";
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

// jsdom has no layout, so a name cut off by its box is described directly by
// standing in for the two widths the card compares.
function mockWidths(scroll: number, client: number) {
  const scrollWidth = jest
    .spyOn(HTMLElement.prototype, "scrollWidth", "get")
    .mockReturnValue(scroll);
  const clientWidth = jest
    .spyOn(HTMLElement.prototype, "clientWidth", "get")
    .mockReturnValue(client);
  return () => {
    scrollWidth.mockRestore();
    clientWidth.mockRestore();
  };
}

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
    render(<AgreementStatCard staticPillText="Overall" value="82%" />);
    expect(screen.getByText("Overall")).toBeInTheDocument();
    expect(screen.getByText("Overall")).not.toHaveAttribute("title");
    expect(screen.getByText("82%")).toBeInTheDocument();
  });

  it("does not repeat the pill's text when the card shows it in full", async () => {
    const user = setupUser();
    render(<AgreementStatCard staticPillText="Overall" value="82%" />);

    await user.hover(screen.getByText("Overall"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Still only the pill itself, no popup saying the same thing again.
    expect(screen.getAllByText("Overall")).toHaveLength(1);
  });

  it("shows the whole of the pill's text when the card has cut it off", async () => {
    const user = setupUser();
    const restore = mockWidths(300, 80);
    const name = "A very long evaluator name indeed";
    render(<AgreementStatCard staticPillText={name} value="82%" />);

    await user.hover(screen.getByText(name));
    await waitFor(() =>
      expect(screen.getAllByText(name).length).toBeGreaterThan(1),
    );
    restore();
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
    expect(button).not.toHaveAttribute("title");
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("alignment")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
  });

  it("shows no hover text on the pill, which already names the evaluator", async () => {
    const user = setupUser();
    render(
      <AgreementStatCard
        evaluatorPill={{ uuid: "ev-1", name: "Correctness" }}
        value="90%"
      />,
    );

    await user.hover(screen.getByRole("button", { name: /Correctness/ }));
    expect(screen.queryByText("Open Correctness")).toBeNull();
  });

  it("says on hover how many items the score counts", async () => {
    const user = setupUser();
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
      />,
    );

    await user.hover(screen.getByText("Correct"));
    expect(await screen.findByText("3 of 4 items")).toBeInTheDocument();
  });

  it("says on hover how many items the score counts when it is the only number", async () => {
    const user = setupUser();
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

    await user.hover(screen.getByText("75%"));
    expect(await screen.findByText("3 of 4 items")).toBeInTheDocument();
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
    const stat = screen.getByText("Correct").parentElement!;
    expect(stat).toHaveTextContent("Correct");
    expect(stat).toHaveTextContent("75%");
    expect(stat).not.toHaveAttribute("title");
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
    expect(number).not.toHaveAttribute("title");
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
    expect(number).not.toHaveAttribute("title");
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
