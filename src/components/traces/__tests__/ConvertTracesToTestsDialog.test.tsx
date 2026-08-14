import { render, screen, setupUser, waitFor } from "@/test-utils";
import { ConvertTracesToTestsDialog } from "../ConvertTracesToTestsDialog";
import { fetchAllEvaluators } from "@/lib/evaluatorApi";
import { reportError } from "@/lib/reportError";
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
const mockReportError = reportError as jest.Mock;

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

function setup(
  overrides: Partial<
    React.ComponentProps<typeof ConvertTracesToTestsDialog>
  > = {},
) {
  const onConverted = jest.fn();
  const onClose = jest.fn();
  render(
    <ConvertTracesToTestsDialog
      isOpen
      onClose={onClose}
      accessToken="tok"
      traceUuids={["tr-1", "tr-2"]}
      testType="response"
      agentUuid="ag-1"
      onConverted={onConverted}
      {...overrides}
    />,
  );
  return { onConverted, onClose };
}

beforeEach(() => {
  mockFetchEvals.mockReset();
  mockFetchEvals.mockResolvedValue(EVALUATORS);
  mockConvert.mockReset();
  mockReportError.mockReset();
});

it("renders nothing when closed and never fetches", () => {
  const { container } = render(
    <ConvertTracesToTestsDialog
      isOpen={false}
      onClose={jest.fn()}
      accessToken="tok"
      traceUuids={["tr-1"]}
      testType="response"
      agentUuid="ag-1"
      onConverted={jest.fn()}
    />,
  );
  expect(container).toBeEmptyDOMElement();
  expect(mockFetchEvals).not.toHaveBeenCalled();
});

it("uses Add to tests copy and pluralizes the trace count", async () => {
  setup({ traceUuids: ["tr-1"] });
  expect(
    screen.getByRole("heading", { name: "Add 1 trace to tests" }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Add to tests" })).toBeEnabled(),
  );
});

it("lists only llm evaluators and preselects the default LLM-reply one", async () => {
  setup();
  await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
  expect(
    screen.getByRole("heading", { name: "Add 2 traces to tests" }),
  ).toBeInTheDocument();
  expect(screen.getByText("My Judge")).toBeInTheDocument();
  // Conversation evaluator filtered out.
  expect(screen.queryByText("Conversation")).not.toBeInTheDocument();
  // The default is preselected, so adding is enabled without further clicks.
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Add to tests" })).toBeEnabled(),
  );
  expect(mockFetchEvals).toHaveBeenCalledWith("tok");
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

it("submits a response test with the selected evaluator and linked agent", async () => {
  mockConvert.mockResolvedValue({ test_uuids: ["t1", "t2"] });
  const user = setupUser();
  const { onConverted } = setup();
  await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());

  await user.click(screen.getByRole("button", { name: "Add to tests" }));

  await waitFor(() => expect(mockConvert).toHaveBeenCalled());
  expect(mockConvert).toHaveBeenCalledWith("tok", {
    traceIds: ["tr-1", "tr-2"],
    type: "response",
    evaluatorUuids: ["ev-default"],
    agentUuids: ["ag-1"],
    acceptAnyArguments: false,
  });
  expect(onConverted).toHaveBeenCalledWith({ test_uuids: ["t1", "t2"] });
});

it("requires an evaluator for a response test", async () => {
  const user = setupUser();
  setup();
  await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
  // Deselect the preselected default.
  await user.click(screen.getByLabelText("Select evaluator Correctness"));
  expect(screen.getByRole("button", { name: "Add to tests" })).toBeDisabled();
});

it("shows only tool-call options and submits the given tool_call type", async () => {
  mockConvert.mockResolvedValue({ test_uuids: ["t1", "t2"] });
  const user = setupUser();
  setup({ testType: "tool_call" });

  expect(mockFetchEvals).not.toHaveBeenCalled();
  expect(screen.queryByText("Evaluators")).not.toBeInTheDocument();
  expect(screen.queryAllByRole("radio")).toHaveLength(0);
  expect(screen.queryByText("Test type")).not.toBeInTheDocument();
  expect(
    screen.queryByText(/only when every selected trace has tool calls/i),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText("Match tool name only (ignore arguments)"),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add to tests" })).toBeEnabled();
  await user.click(screen.getByLabelText("Match tool name only"));
  await user.click(screen.getByRole("button", { name: "Add to tests" }));

  await waitFor(() => expect(mockConvert).toHaveBeenCalled());
  expect(mockConvert).toHaveBeenCalledWith("tok", {
    traceIds: ["tr-1", "tr-2"],
    type: "tool_call",
    evaluatorUuids: undefined,
    agentUuids: ["ag-1"],
    acceptAnyArguments: true,
  });
});

it("does not show a test type picker for response tests", async () => {
  setup();
  await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
  expect(screen.queryAllByRole("radio")).toHaveLength(0);
  expect(screen.queryByText("Test type")).not.toBeInTheDocument();
  expect(
    screen.queryByText("Match tool name only (ignore arguments)"),
  ).not.toBeInTheDocument();
});

it("shows Adding while adding tests", async () => {
  mockConvert.mockReturnValue(new Promise(() => {}));
  const user = setupUser();
  setup({ testType: "tool_call" });

  await user.click(screen.getByRole("button", { name: "Add to tests" }));

  expect(
    screen.getByRole("button", { name: "Adding..." }),
  ).toBeInTheDocument();
});

it("surfaces an adding error while preserving the technical report", async () => {
  mockConvert.mockRejectedValue(new Error("boom"));
  const user = setupUser();
  const { onConverted } = setup();
  await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Add to tests" }));
  await waitFor(() =>
    expect(
      screen.getByText(
        "Something went wrong while adding to tests. Please try again.",
      ),
    ).toBeInTheDocument(),
  );
  expect(mockReportError).toHaveBeenCalledWith(
    "Error converting traces to tests:",
    expect.any(Error),
  );
  expect(onConverted).not.toHaveBeenCalled();
});
