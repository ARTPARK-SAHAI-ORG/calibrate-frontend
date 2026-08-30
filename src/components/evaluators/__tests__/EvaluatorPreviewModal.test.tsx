import { render, screen, setupUser } from "@/test-utils";
import { EvaluatorPreviewModal } from "../EvaluatorPreviewModal";
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

const DETAIL = {
  uuid: "e1",
  name: "Conciseness",
  description: "Rates how concise the output is",
  output_type: "rating" as const,
  evaluator_type: "llm",
  live_version_index: 0,
  versions: [
    {
      uuid: "v1",
      version_number: 1,
      judge_model: "google/gemini-2.5-flash",
      system_prompt: "Judge whether the reply is concise.",
      output_config: null,
      variables: null,
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue(DETAIL);
});

describe("EvaluatorPreviewModal", () => {
  it("renders nothing when no evaluator is chosen", () => {
    const { container } = render(
      <EvaluatorPreviewModal evaluatorUuid={null} onClose={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows the evaluator's name and how it judges", async () => {
    render(
      <EvaluatorPreviewModal
        evaluatorUuid="e1"
        evaluatorName="Conciseness"
        onClose={jest.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Conciseness" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Judge whether the reply is concise."),
    ).toBeInTheDocument();
  });

  it("offers the evaluator's page and its edit form, each in a new tab", async () => {
    render(
      <EvaluatorPreviewModal
        evaluatorUuid="e1"
        evaluatorName="Conciseness"
        onClose={jest.fn()}
      />,
    );
    const view = screen.getByRole("link", { name: "View" });
    expect(view).toHaveAttribute("href", "/evaluators/e1");
    expect(view).toHaveAttribute("target", "_blank");
    expect(view).toHaveAttribute("rel", "noopener noreferrer");

    const edit = screen.getByRole("link", { name: "Edit" });
    expect(edit).toHaveAttribute("href", "/evaluators/e1?edit=1");
    expect(edit).toHaveAttribute("target", "_blank");
    expect(edit).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("closes via the close button and via the backdrop, not via the panel", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(
      <EvaluatorPreviewModal
        evaluatorUuid="e1"
        evaluatorName="Conciseness"
        onClose={onClose}
      />,
    );
    await screen.findByText("Judge whether the reply is concise.");

    await user.click(screen.getByRole("heading", { name: "Conciseness" }));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Close preview" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
