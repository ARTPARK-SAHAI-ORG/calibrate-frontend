import { render, screen, setupUser, waitFor } from "@/test-utils";
import { TraceLabellingEvaluatorsDialog } from "../TraceLabellingEvaluatorsDialog";
import { fetchAgentEvaluators, fetchAllEvaluators } from "@/lib/evaluatorApi";

jest.mock("../../../lib/evaluatorApi", () => ({
  __esModule: true,
  fetchAllEvaluators: jest.fn(),
  fetchAgentEvaluators: jest.fn(),
  hasEvaluatorVariables: () => false,
  isDefaultEvaluator: (e: { is_default?: boolean | null }) => !!e.is_default,
  isOwnedEvaluator: (e: { is_default?: boolean | null }) => !e.is_default,
}));
jest.mock("../../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const mockFetchEvals = fetchAllEvaluators as jest.Mock;
const mockFetchAgentEvals = fetchAgentEvaluators as jest.Mock;

const EVALUATORS = [
  {
    uuid: "ev-default",
    name: "Correctness",
    evaluator_type: "llm",
    is_default: true,
    source_default_slug: "default-llm-next-reply",
  },
  {
    uuid: "ev-custom",
    name: "My Judge",
    evaluator_type: "llm",
    is_default: false,
  },
];

function setup(
  overrides: Partial<
    React.ComponentProps<typeof TraceLabellingEvaluatorsDialog>
  > = {},
) {
  const onChosen = jest.fn();
  const onClose = jest.fn();
  render(
    <TraceLabellingEvaluatorsDialog
      isOpen
      onClose={onClose}
      agentUuid="ag-1"
      accessToken="tok"
      onChosen={onChosen}
      {...overrides}
    />,
  );
  return { onChosen, onClose };
}

beforeEach(() => {
  mockFetchEvals.mockReset();
  mockFetchEvals.mockResolvedValue(EVALUATORS);
  mockFetchAgentEvals.mockReset();
  mockFetchAgentEvals.mockResolvedValue([]);
});

it("renders nothing when closed and never fetches", () => {
  const { container } = render(
    <TraceLabellingEvaluatorsDialog
      isOpen={false}
      onClose={jest.fn()}
      agentUuid="ag-1"
      accessToken="tok"
      onChosen={jest.fn()}
    />,
  );
  expect(container).toBeEmptyDOMElement();
  expect(mockFetchEvals).not.toHaveBeenCalled();
});

it("offers exactly two actions", async () => {
  setup();
  await waitFor(() =>
    expect(screen.getByText("Correctness")).toBeInTheDocument(),
  );
  // Footer keeps exactly the two actions. Each evaluator row also carries a
  // button, the one that opens its prompt on the right.
  expect(
    screen
      .getAllByRole("button")
      .filter((b) => !b.className.includes("flex-1 text-left")),
  ).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
});

it("hands back the picked evaluators", async () => {
  const user = setupUser();
  const { onChosen } = setup();
  await waitFor(() => expect(screen.getByText("My Judge")).toBeInTheDocument());

  await user.click(screen.getByRole("checkbox", { name: /My Judge/ }));
  await user.click(screen.getByRole("button", { name: "Continue" }));

  expect(onChosen).toHaveBeenCalledWith([
    { uuid: "ev-default", name: "Correctness" },
    { uuid: "ev-custom", name: "My Judge" },
  ]);
});

it("cannot continue until an evaluator is picked", async () => {
  const user = setupUser();
  setup();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled(),
  );

  await user.click(screen.getByRole("checkbox", { name: /Correctness/ }));

  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
});
