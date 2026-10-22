import React from "react";
import { render, screen, setupUser, waitFor } from "@/test-utils";
import {
  AgreementStatCard,
  OverallAgreementCards,
  ScoreReliabilityCards,
  agreementColor,
} from "../AgreementStatCard";
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
    render(<AgreementStatCard staticPillText="Overall" agreement={0.82} />);
    expect(screen.getByText("Overall")).toBeInTheDocument();
    expect(screen.getByText("Overall")).not.toHaveAttribute("title");
    expect(screen.getByText("82%")).toBeInTheDocument();
  });

  it("does not repeat the pill's text when the card shows it in full", async () => {
    const user = setupUser();
    render(<AgreementStatCard staticPillText="Overall" agreement={0.82} />);

    await user.hover(screen.getByText("Overall"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Still only the pill itself, no popup saying the same thing again.
    expect(screen.getAllByText("Overall")).toHaveLength(1);
  });

  it("shows the whole of the pill's text when the card has cut it off", async () => {
    const user = setupUser();
    const restore = mockWidths(300, 80);
    const name = "A very long evaluator name indeed";
    render(<AgreementStatCard staticPillText={name} agreement={0.82} />);

    await user.hover(screen.getByText(name));
    await waitFor(() =>
      expect(screen.getAllByText(name).length).toBeGreaterThan(1),
    );
    restore();
  });

  it("shows the percentage worked out from the agreement in a neutral colour", () => {
    render(<AgreementStatCard staticPillText="Overall" agreement={0.816} />);
    const number = screen.getByText("82%");
    expect(number.className).toContain("text-foreground");
    expect(number.className).not.toMatch(/text-(green|red|yellow)/);
  });

  it("shows a muted dash when there is no agreement number", () => {
    render(<AgreementStatCard staticPillText="Overall" agreement={null} />);
    expect(screen.getByText("—").className).toContain("text-muted-foreground");
  });

  it("renders the evaluator pill variant with a version label", () => {
    render(
      <AgreementStatCard
        evaluatorPill={{
          uuid: "ev-1",
          name: "Correctness",
          versionLabel: "v2",
        }}
        agreement={0.9}
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
        agreement={0.9}
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
        agreement={0.9}
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
        agreement={0.9}
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
        agreement={0.9}
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
        agreement={0.9}
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
        agreement={null}
        result={{ label: "Average score", value: "3.5 / 5", ratio: null }}
      />
    );
    expect(screen.getByText("Average score")).toBeInTheDocument();
    // No ratio, so the number keeps the default text colour.
    expect(screen.getByText("3.5 / 5").className).not.toMatch(
      /text-(green|red|yellow)/,
    );
  });

  it("names the kind of kappa on the info icon, for hover and screen readers", async () => {
    const user = setupUser();
    render(
      <AgreementStatCard
        staticPillText="Annotator agreement"
        agreement={0.82}
        kappa={{ kappa: -0.125, kappa_type: "linear_weighted_fleiss" }}
      />,
    );
    expect(screen.getByText("-0.13")).toBeInTheDocument();
    const icon = screen.getByRole("button", {
      name: "Linear weighted Fleiss' kappa",
    });
    expect(
      screen.queryByText("Linear weighted Fleiss' kappa"),
    ).not.toBeInTheDocument();
    await user.hover(icon);
    expect(
      await screen.findByText("Linear weighted Fleiss' kappa"),
    ).toBeInTheDocument();
  });

  it("names the reason kappa is blank on its info icon", () => {
    render(
      <AgreementStatCard
        staticPillText="Annotator agreement"
        agreement={1}
        kappa={{
          kappa: null,
          kappa_type: "fleiss",
          kappa_blank_reason: "everyone_agreed",
          chance_agreement: 1,
        }}
      />,
    );
    expect(screen.getByText("Everyone agreed").className).toContain(
      "rounded-md",
    );
    expect(
      screen.getByRole("button", {
        name: "Every answer was the same, so chance alone would also agree every time and kappa cannot be worked out",
      }),
    ).toBeInTheDocument();
  });

  it("leaves kappa out when there is no agreement number beside it", () => {
    render(
      <AgreementStatCard
        evaluatorPill={{ uuid: "ev-1", name: "Correctness" }}
        result={{ label: "Score", value: "75%", ratio: 0.75 }}
        kappa={{ kappa: 0.5, kappa_type: "cohen" }}
      />,
    );
    expect(screen.queryByText("Kappa")).not.toBeInTheDocument();
    expect(screen.queryByTestId("agreement-fill")).not.toBeInTheDocument();
  });

  it("renders the evaluator pill variant without a version label", () => {
    render(
      <AgreementStatCard
        evaluatorPill={{ uuid: "ev-2", name: "Tone" }}
        agreement={0.7}
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
        agreement={0.55}
      />
    );
    expect(screen.getByText("Safety")).toBeInTheDocument();
  });
});

describe("AgreementStatCard agreement bar", () => {
  const fill = () => screen.getByTestId("agreement-fill");

  it("fills green to the agreement, ticks at chance, and keeps the number neutral", () => {
    render(
      <AgreementStatCard
        staticPillText="Annotator agreement"
        agreement={0.62}
        kappa={{ kappa: 0.42, kappa_type: "cohen", chance_agreement: 0.35 }}
      />
    );
    const number = screen.getByText("62%");
    expect(number.className).toContain("text-foreground");
    expect(number.className).not.toMatch(/text-(green|red|yellow)/);
    expect(fill().style.width).toBe("62%");
    expect(fill().className).toContain("bg-green-500");
    expect(screen.getByTestId("chance-tick").style.left).toBe("35%");
    expect(screen.getByText("Chance 35%")).toBeInTheDocument();
    expect(screen.getByText("Kappa")).toBeInTheDocument();
    expect(screen.getByText("0.42")).toBeInTheDocument();
    expect(screen.queryByText("Agreement")).not.toBeInTheDocument();
  });

  it("fills red when agreement falls short of chance", () => {
    render(
      <AgreementStatCard
        staticPillText="Annotator agreement"
        agreement={0.94}
        kappa={{ kappa: -0.33, kappa_type: "cohen", chance_agreement: 0.96 }}
      />
    );
    expect(fill().style.width).toBe("94%");
    expect(fill().className).toContain("bg-red-500");
    expect(screen.getByTestId("chance-tick").style.left).toBe("96%");
    expect(screen.getByText("Chance 96%")).toBeInTheDocument();
    expect(screen.getByText("-0.33")).toBeInTheDocument();
  });

  it("fills muted when agreement equals chance", () => {
    render(
      <AgreementStatCard
        staticPillText="Annotator agreement"
        agreement={1}
        kappa={{
          kappa: null,
          kappa_blank_reason: "everyone_agreed",
          chance_agreement: 1,
        }}
      />
    );
    expect(fill().className).toContain("bg-muted-foreground");
    expect(screen.getByText("Chance 100%")).toBeInTheDocument();
    expect(screen.getByText("Everyone agreed")).toBeInTheDocument();
  });

  it("draws no tick and no chance when chance is unknown", () => {
    render(
      <AgreementStatCard
        staticPillText="Annotator agreement"
        agreement={0.8}
        kappa={{
          kappa: null,
          kappa_blank_reason: "too_few_items",
          chance_agreement: null,
        }}
      />
    );
    expect(fill().style.width).toBe("80%");
    expect(screen.queryByTestId("chance-tick")).not.toBeInTheDocument();
    expect(screen.queryByText(/Chance/)).not.toBeInTheDocument();
    expect(screen.getByText("Kappa")).toBeInTheDocument();
    expect(screen.getByText("Too few items")).toBeInTheDocument();
  });

  it("draws no bar when there is no agreement number", () => {
    render(
      <AgreementStatCard
        staticPillText="Annotator agreement"
        agreement={null}
        kappa={{ kappa: null, kappa_type: null, chance_agreement: null }}
      />
    );
    expect(screen.queryByTestId("agreement-fill")).not.toBeInTheDocument();
    expect(screen.getByText("—").className).toContain("text-muted-foreground");
    expect(screen.queryByText("Kappa")).not.toBeInTheDocument();
  });

  it("keeps the score first and names the agreement beside it", () => {
    render(
      <AgreementStatCard
        evaluatorPill={{ uuid: "ev-1", name: "Correctness" }}
        agreement={0.9}
        result={{ label: "Score", value: "75%", ratio: 0.75 }}
        kappa={{ kappa: 0.5, kappa_type: "cohen", chance_agreement: 0.8 }}
      />
    );
    const text = document.body.textContent!;
    expect(text.indexOf("Score")).toBeLessThan(text.indexOf("Human agreement"));
    expect(screen.getByText("90%").className).toContain("text-foreground");
    expect(fill().style.width).toBe("90%");
    expect(screen.getByText("Chance 80%")).toBeInTheDocument();
  });
});

describe("AgreementStatCard sections", () => {
  it("shows both titled sections, each with its own bar against chance", () => {
    render(
      <AgreementStatCard
        evaluatorPill={{ uuid: "ev-1", name: "Tone" }}
        showAlignmentLabel={false}
        sections={[
          {
            title: "Inter-annotator agreement",
            agreement: 0.7,
            kappa: { kappa: 0.4, kappa_type: "cohen", chance_agreement: 0.5 },
          },
          {
            title: "Evaluator agreement with humans",
            agreement: 0.4,
            kappa: { kappa: -0.1, kappa_type: "cohen", chance_agreement: 0.45 },
          },
        ]}
      />
    );
    expect(screen.getByText("Inter-annotator agreement")).toBeInTheDocument();
    expect(
      screen.getByText("Evaluator agreement with humans"),
    ).toBeInTheDocument();
    expect(screen.queryByText("alignment")).not.toBeInTheDocument();
    const fills = screen.getAllByTestId("agreement-fill");
    expect(fills.map((f) => f.style.width)).toEqual(["70%", "40%"]);
    expect(fills[0].className).toContain("bg-green-500");
    expect(fills[1].className).toContain("bg-red-500");
    expect(
      screen.getAllByTestId("chance-tick").map((t) => t.style.left),
    ).toEqual(["50%", "45%"]);
    expect(screen.getByText("70%").className).toContain("text-foreground");
    expect(screen.getByText("Chance 45%")).toBeInTheDocument();
    expect(screen.getByText("0.40")).toBeInTheDocument();
    expect(screen.getByText("-0.10")).toBeInTheDocument();
  });

  it("shows a muted dash and no bar for a section with no agreement", () => {
    render(
      <AgreementStatCard
        evaluatorPill={{ uuid: "ev-1", name: "Tone" }}
        sections={[
          { title: "Inter-annotator agreement", agreement: null, kappa: null },
          {
            title: "Evaluator agreement with humans",
            agreement: 0.9,
            kappa: { kappa: 0.5, kappa_type: "cohen", chance_agreement: 0.6 },
          },
        ]}
      />
    );
    expect(screen.getByText("—").className).toContain("text-muted-foreground");
    expect(screen.getAllByTestId("agreement-fill")).toHaveLength(1);
  });
});

describe("OverallAgreementCards", () => {
  it("shows each overall number as its label and a neutral percentage only", () => {
    render(
      <OverallAgreementCards
        interAnnotator={{ current: 0.62 }}
        withHumans={{ current: null }}
      />
    );
    expect(screen.getByText("Inter-annotator agreement")).toBeInTheDocument();
    expect(screen.getByText("62%").className).toContain("text-foreground");
    expect(
      screen.getByText("Evaluator agreement with humans"),
    ).toBeInTheDocument();
    expect(screen.getByText("—").className).toContain("text-muted-foreground");
    expect(screen.queryByText(/Kappa|Chance/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("agreement-fill")).not.toBeInTheDocument();
  });
});

describe("ScoreReliabilityCards", () => {
  it("gives every evaluator it is handed a card, even one no evaluator judges", () => {
    render(
      <ScoreReliabilityCards
        agreement={{
          human_human: { current: 0.7 },
          evaluators_with_humans: { current: 0.8 },
          evaluators: [
            {
              evaluator_id: "ev-1",
              name: "Tone",
              current: 0.8,
              kappa: 0.5,
              kappa_type: "cohen",
              inter_annotator: { current: 0.6, kappa: 0.3, kappa_type: "cohen" },
            },
            {
              evaluator_id: "ev-tool",
              name: "Tool call correctness",
              current: null,
              inter_annotator: { current: 0.9, kappa: 0.7, kappa_type: "cohen" },
            },
          ],
        }}
      />
    );
    expect(screen.getByRole("button", { name: /Tone/ })).toBeInTheDocument();
    const tool = screen
      .getByRole("button", { name: /Tool call correctness/ })
      .closest(".rounded-lg") as HTMLElement;
    expect(tool).toHaveTextContent("Inter-annotator agreement90%");
    expect(tool).toHaveTextContent("Evaluator agreement with humans—");
    // The two overall cards come first, then one card per evaluator.
    expect(screen.getAllByText("Inter-annotator agreement")).toHaveLength(3);
  });
});

describe("chance bar on the cards", () => {
  it("says the agreement and the chance on hover", async () => {
    const user = setupUser();
    render(
      <AgreementStatCard
        staticPillText="Annotator agreement"
        agreement={0.88}
        kappa={{ kappa: -0.2, kappa_type: "cohen", chance_agreement: 0.91 }}
      />
    );
    const bar = screen.getByRole("img", { name: "Agreement 88%, chance 91%" });
    await user.hover(bar);
    expect(
      await screen.findByText("Agreement 88%, chance 91%", { selector: "div" }),
    ).toBeInTheDocument();
  });

  it("says only the agreement when chance is unknown", () => {
    render(
      <AgreementStatCard
        staticPillText="Annotator agreement"
        agreement={0.5}
        kappa={{ kappa: null, kappa_type: "cohen", chance_agreement: null }}
      />
    );
    expect(
      screen.getByRole("img", { name: "Agreement 50%" }),
    ).toBeInTheDocument();
  });
});

describe("ScoreReliabilityCards legend", () => {
  const ev = (current: number | null) => ({
    evaluator_id: "ev-1",
    name: "Tone",
    current,
    inter_annotator: { current: null },
  });

  it("shows the legend above the cards when a card has a bar", () => {
    render(
      <ScoreReliabilityCards
        agreement={{ human_human: { current: 0.7 }, evaluators: [ev(0.8)] }}
      />
    );
    for (const text of [
      "Agreement expected by chance alone",
      "Better than chance",
      "Worse than chance",
      "Cannot be compared with chance",
    ])
      expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("has no legend when no card has a bar", () => {
    render(
      <ScoreReliabilityCards
        agreement={{ human_human: { current: 0.7 }, evaluators: [ev(null)] }}
      />
    );
    expect(screen.queryByText("Better than chance")).not.toBeInTheDocument();
  });
});

