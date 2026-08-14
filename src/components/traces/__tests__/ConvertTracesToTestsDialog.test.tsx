import { render, screen, setupUser, waitFor } from "@/test-utils";
import { ConvertTracesToTestsDialog } from "../ConvertTracesToTestsDialog";
import { fetchAllEvaluators } from "@/lib/evaluatorApi";
import { convertTracesToTests } from "@/lib/tracesApi";

jest.mock("../../../lib/evaluatorApi", () => ({
  __esModule: true,
  fetchAllEvaluators: jest.fn(),
}));
jest.mock("../../../lib/tracesApi", () => ({
  __esModule: true,
  convertTracesToTests: jest.fn(),
}));
jest.mock("../../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const mockFetchEvals = fetchAllEvaluators as jest.Mock;
const mockConvert = convertTracesToTests as jest.Mock;

const EVALUATORS = [
  {
    uuid: "ev-default",
    name: "Correctness",
    evaluator_type: "llm",
    is_default: true,
    source_default_slug: "default-llm-next-reply",
  },
  { uuid: "ev-custom", name: "My Judge", evaluator_type: "llm", is_default: false },
  { uuid: "ev-conv", name: "Conversation", evaluator_type: "conversation" },
];

function setup(overrides: Partial<React.ComponentProps<typeof ConvertTracesToTestsDialog>> = {}) {
  const onConverted = jest.fn();
  const onClose = jest.fn();
  render(
    <ConvertTracesToTestsDialog
      isOpen
      onClose={onClose}
      accessToken="tok"
      traceUuids={["tr-1", "tr-2"]}
      allHaveToolCalls
      agentUuid="ag-1"
      onConverted={onConverted}
      {...overrides}
    />,
  );
  return { onConverted, onClose };
}

beforeEach(() => {
  mockFetchEvals.mockResolvedValue(EVALUATORS);
  mockConvert.mockReset();
});

it("renders nothing when closed and never fetches", () => {
  const { container } = render(
    <ConvertTracesToTestsDialog
      isOpen={false}
      onClose={jest.fn()}
      accessToken="tok"
      traceUuids={["tr-1"]}
      allHaveToolCalls={false}
      agentUuid="ag-1"
      onConverted={jest.fn()}
    />,
  );
  expect(container).toBeEmptyDOMElement();
  expect(mockFetchEvals).not.toHaveBeenCalled();
});

it("lists only llm evaluators and preselects the default LLM-reply one", async () => {
  setup();
  await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
  expect(screen.getByText("My Judge")).toBeInTheDocument();
  // Conversation evaluator filtered out.
  expect(screen.queryByText("Conversation")).not.toBeInTheDocument();
  // Default is preselected → Convert is enabled without further clicks.
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Convert" })).toBeEnabled(),
  );
});

it("does not offer an agent picker", async () => {
  setup();
  await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
  expect(screen.queryByText(/Link to agents/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/^Link to agent /)).not.toBeInTheDocument();
  // Footer keeps exactly the two actions.
  expect(
    screen
      .getAllByRole("button")
      .filter((b) => !b.getAttribute("aria-label")?.startsWith("Select ")),
  ).toHaveLength(2);
});

it("converts a response test with the selected evaluator and links the agent it is on", async () => {
  mockConvert.mockResolvedValue({ created: 2, test_uuids: ["t1", "t2"] });
  const user = setupUser();
  const { onConverted } = setup();
  await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: "Convert" }));

  await waitFor(() => expect(mockConvert).toHaveBeenCalled());
  expect(mockConvert).toHaveBeenCalledWith("tok", {
    traceIds: ["tr-1", "tr-2"],
    type: "response",
    evaluatorUuids: ["ev-default"],
    agentUuids: ["ag-1"],
    acceptAnyArguments: false,
  });
  expect(onConverted).toHaveBeenCalledWith({
    created: 2,
    test_uuids: ["t1", "t2"],
  });
});

it("disables Convert for a response test when no evaluator is selected", async () => {
  const user = setupUser();
  setup();
  await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
  // Deselect the preselected default.
  await user.click(screen.getByLabelText("Select evaluator Correctness"));
  expect(screen.getByRole("button", { name: "Convert" })).toBeDisabled();
});

it("switches to tool_call and sends accept_any_arguments", async () => {
  mockConvert.mockResolvedValue({ created: 2, test_uuids: ["t1", "t2"] });
  const user = setupUser();
  setup();
  await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());

  await user.click(screen.getByRole("radio", { name: /Tool call/ }));
  await user.click(screen.getByLabelText("Match tool name only"));
  await user.click(screen.getByRole("button", { name: "Convert" }));

  await waitFor(() => expect(mockConvert).toHaveBeenCalled());
  expect(mockConvert).toHaveBeenCalledWith("tok", {
    traceIds: ["tr-1", "tr-2"],
    type: "tool_call",
    evaluatorUuids: undefined,
    agentUuids: ["ag-1"],
    acceptAnyArguments: true,
  });
});

it("disables the tool_call option when a selected trace has no tool calls", async () => {
  setup({ allHaveToolCalls: false });
  await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
  expect(screen.getByRole("radio", { name: /Tool call/ })).toBeDisabled();
  expect(
    screen.getByText(/only when every selected trace has tool calls/i),
  ).toBeInTheDocument();
});

it("surfaces an error when the conversion fails", async () => {
  mockConvert.mockRejectedValue(new Error("boom"));
  const user = setupUser();
  const { onConverted } = setup();
  await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Convert" }));
  await waitFor(() =>
    expect(screen.getByText(/Something went wrong/)).toBeInTheDocument(),
  );
  expect(onConverted).not.toHaveBeenCalled();
});
