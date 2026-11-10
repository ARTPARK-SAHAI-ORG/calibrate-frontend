import { render, screen, waitFor, setupUser } from "@/test-utils";
jest.mock("sonner", () => ({ toast: { error: jest.fn() } }));
import { toast } from "sonner";
import { useConfigureTraceValues } from "../useConfigureTraceValues";
import type { EvaluatorData } from "@/lib/evaluatorApi";

const fetchAgentEvaluators = jest.fn();
const saveEvaluatorTraceVariables = jest.fn();
jest.mock("../../../lib/evaluatorApi", () => ({
  fetchAgentEvaluators: (...args: unknown[]) => fetchAgentEvaluators(...args),
  saveEvaluatorTraceVariables: (...args: unknown[]) =>
    saveEvaluatorTraceVariables(...args),
}));
const reportError = jest.fn();
jest.mock("../../../lib/reportError", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

const evaluator = (
  uuid: string,
  traceVariables: Record<string, string> | null,
): EvaluatorData =>
  ({
    uuid,
    name: uuid,
    description: "",
    live_version: { variables: [{ name: "reply" }] },
    trace_variables: traceVariables,
  }) as EvaluatorData;

const onRefresh = jest.fn();

function Harness({ accessToken = "token" }: { accessToken?: string | null }) {
  const { button, dialog } = useConfigureTraceValues({
    agentUuid: "agent-1",
    agentNature: "general",
    accessToken,
    onRefresh,
  });
  return (
    <>
      {button}
      {dialog}
    </>
  );
}

const configureNow = () =>
  screen.getByRole("button", { name: "Configure now" });
const dialogTitle = () =>
  screen.queryByRole("heading", { name: "Choose trace values" });

beforeEach(() => jest.clearAllMocks());

it("opens the dialog with only the evaluators still missing values", async () => {
  const user = setupUser();
  fetchAgentEvaluators.mockResolvedValue([
    evaluator("needs-one", null),
    evaluator("finished", { reply: "input" }),
    evaluator("needs-two", null),
  ]);
  render(<Harness />);

  await user.click(configureNow());

  await screen.findByRole("button", { name: /^needs-one/ });
  expect(fetchAgentEvaluators).toHaveBeenCalledWith("agent-1", "token");
  expect(screen.getByRole("button", { name: /^needs-two/ })).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /^finished/ }),
  ).not.toBeInTheDocument();
});

it("hands the agent type to the dialog", async () => {
  const user = setupUser();
  fetchAgentEvaluators.mockResolvedValue([evaluator("one", null)]);
  render(<Harness />);

  await user.click(configureNow());

  const select = await screen.findByLabelText("{{reply}}");
  expect(
    Array.from((select as HTMLSelectElement).options).map((o) => o.text),
  ).toContain("Output");
});

it("keeps the button on screen and busy while loading", async () => {
  const user = setupUser();
  let finish: (list: EvaluatorData[]) => void = () => {};
  fetchAgentEvaluators.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<Harness />);

  await user.click(configureNow());

  expect(configureNow()).toBeDisabled();
  finish([]);
  await waitFor(() => expect(configureNow()).toBeEnabled());
});

it("shows a message and opens nothing when the fetch fails", async () => {
  const user = setupUser();
  const failure = new Error("offline");
  fetchAgentEvaluators.mockRejectedValue(failure);
  render(<Harness />);

  await user.click(configureNow());

  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith("Could not load your evaluators"),
  );
  expect(reportError).toHaveBeenCalledWith(
    "Error fetching agent evaluators:",
    failure,
  );
  expect(dialogTitle()).not.toBeInTheDocument();
  expect(configureNow()).toBeEnabled();
});

it("opens nothing and checks again when no evaluator is missing values", async () => {
  const user = setupUser();
  fetchAgentEvaluators.mockResolvedValue([
    evaluator("finished", { reply: "input" }),
  ]);
  render(<Harness />);

  await user.click(configureNow());

  await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  expect(dialogTitle()).not.toBeInTheDocument();
});

it("does nothing without an access token", async () => {
  const user = setupUser();
  render(<Harness accessToken={null} />);

  await user.click(configureNow());

  expect(fetchAgentEvaluators).not.toHaveBeenCalled();
});

it("saves, checks eligibility again after each save, and closes after the last", async () => {
  const user = setupUser();
  fetchAgentEvaluators.mockResolvedValue([
    evaluator("one", null),
    evaluator("two", null),
  ]);
  saveEvaluatorTraceVariables.mockResolvedValue(undefined);
  render(<Harness />);

  await user.click(configureNow());
  await user.selectOptions(await screen.findByLabelText("{{reply}}"), "input");
  await user.click(screen.getByRole("button", { name: "Save and next" }));

  await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  expect(saveEvaluatorTraceVariables).toHaveBeenCalledWith(
    "agent-1",
    "one",
    { reply: "input" },
    "token",
  );

  await user.selectOptions(screen.getByLabelText("{{reply}}"), "labels");
  await user.click(screen.getByRole("button", { name: "Save" }));

  await waitFor(() => expect(dialogTitle()).not.toBeInTheDocument());
  expect(onRefresh).toHaveBeenCalledTimes(2);
});

it("does not check eligibility again when a save fails, and stays open", async () => {
  const user = setupUser();
  fetchAgentEvaluators.mockResolvedValue([evaluator("one", null)]);
  saveEvaluatorTraceVariables.mockRejectedValue(new Error("Bad value"));
  render(<Harness />);

  await user.click(configureNow());
  await user.click(await screen.findByRole("button", { name: "Save" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Bad value");
  expect(onRefresh).not.toHaveBeenCalled();
  expect(dialogTitle()).toBeInTheDocument();
});

it("closes from the dialog's Close button", async () => {
  const user = setupUser();
  fetchAgentEvaluators.mockResolvedValue([evaluator("one", null)]);
  render(<Harness />);

  await user.click(configureNow());
  await screen.findByRole("heading", { name: "Choose trace values" });
  await user.click(screen.getAllByRole("button", { name: "Close" })[1]);

  expect(dialogTitle()).not.toBeInTheDocument();
});
