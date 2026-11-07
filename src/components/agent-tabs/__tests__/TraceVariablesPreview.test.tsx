import {
  act,
  fireEvent,
  render,
  screen,
  setupUser,
  waitFor,
} from "@/test-utils";
import { formatTraceDate } from "@/components/traces/TracesTable";
import { fetchTraces, previewTraceVariables } from "@/lib/tracesApi";
import { reportError } from "@/lib/reportError";
import { TraceVariablesPreview } from "../TraceVariablesPreview";

jest.mock("../../../hooks", () => ({
  ...jest.requireActual("../../../hooks"),
  useAccessToken: () => "tok",
}));
jest.mock("../../../lib/tracesApi", () => ({
  __esModule: true,
  ...jest.requireActual("../../../lib/tracesApi"),
  fetchTraces: jest.fn(),
  previewTraceVariables: jest.fn(),
}));
jest.mock("../../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const mockFetchTraces = fetchTraces as jest.Mock;
const mockPreview = previewTraceVariables as jest.Mock;

const NEWEST = "2026-08-29T12:00:00Z";
const OLDER = "2026-08-28T12:00:00Z";
const traces = [
  { uuid: "t1", created_at: NEWEST, input_preview: "When is the vaccination?" },
  {
    uuid: "t2",
    created_at: OLDER,
    input_preview:
      "A very long question that goes on far beyond what fits in the list",
  },
  { uuid: "t3", created_at: OLDER, input_preview: null },
];
const answer = (variable: string, source: string, value: string | null) => ({
  variable,
  source,
  value,
});

function deferred<T>() {
  let resolve = (_: T) => {};
  let reject = (_: unknown) => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const preview = (
  choices: Record<string, string>,
  {
    variables = ["a", "b"],
    agentNature = "conversation",
  }: { variables?: string[]; agentNature?: "conversation" | "general" } = {},
) => (
  <TraceVariablesPreview
    agentUuid="agent-1"
    agentNature={agentNature}
    variables={variables}
    choices={choices}
  />
);

const traceSelect = () => screen.findByLabelText("Test on a trace");
/** Lets the wait before asking run out, then lets the answer land. */
const passDelay = () =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(300);
  });

beforeEach(() => {
  mockFetchTraces.mockReset();
  mockPreview.mockReset();
  (reportError as jest.Mock).mockReset();
  mockFetchTraces.mockResolvedValue({ items: traces, total: 3 });
  mockPreview.mockResolvedValue({ values: [] });
});

it("shows the body the choices need, and follows them", async () => {
  const { rerender } = render(preview({ a: "input" }));
  const block = () =>
    JSON.parse(
      screen.getByText("What your traces need to contain").nextElementSibling
        ?.textContent ?? "",
    );

  expect(block().input).toEqual([{ role: "user", content: "<a>" }]);
  rerender(preview({ a: "labels" }));
  expect(block().input[0].content).toBe("The user's message");
  expect(block().labels).toEqual(["<a>"]);
  await traceSelect();
});

it("says it is loading until the traces answer", async () => {
  const list = deferred<{ items: unknown[] }>();
  mockFetchTraces.mockReturnValue(list.promise);
  render(preview({}));

  expect(screen.getByText("Loading")).toBeInTheDocument();

  await act(async () => list.resolve({ items: traces }));
  expect(screen.queryByText("Loading")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Test on a trace")).toBeInTheDocument();
});

it("lists the 20 newest traces by date and shortened input, newest chosen, fetched once", async () => {
  const { rerender } = render(preview({}));

  const select = (await traceSelect()) as HTMLSelectElement;
  expect(mockFetchTraces).toHaveBeenCalledWith("tok", {
    limit: 20,
    offset: 0,
    agentId: "agent-1",
  });
  expect(Array.from(select.options).map((o) => o.text)).toEqual([
    `${formatTraceDate(NEWEST)} · When is the vaccination?`,
    `${formatTraceDate(OLDER)} · A very long question that goes on far be...`,
    formatTraceDate(OLDER),
  ]);
  expect(select).toHaveValue("t1");

  rerender(preview({ a: "input" }));
  expect(mockFetchTraces).toHaveBeenCalledTimes(1);
});

describe("the rows", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const settle = async () => {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
  };

  it("shows the text for each choice and Not set for the rest, which are not asked for", async () => {
    mockPreview.mockResolvedValue({
      values: [answer("a", "input", "Line one")],
    });
    render(preview({ a: "input" }));
    await settle();

    expect(screen.getByText("{{a}}")).toBeInTheDocument();
    expect(screen.getByText("{{b}}")).toBeInTheDocument();
    expect(screen.getByText("Not set").className).toContain(
      "text-muted-foreground",
    );
    expect(screen.getByText("Loading")).toBeInTheDocument();

    await passDelay();

    expect(screen.getByText("Line one")).toBeInTheDocument();
    expect(screen.queryByText("Loading")).not.toBeInTheDocument();
    expect(mockPreview).toHaveBeenCalledWith("tok", "agent-1", "t1", {
      a: "input",
    });
  });

  it("says in red what the trace does not have", async () => {
    mockPreview.mockResolvedValue({
      values: [
        answer("a", "metadata.expert_answer", null),
        answer("b", "input", null),
        answer("c", "output.response", ""),
      ],
    });
    render(
      preview(
        { a: "metadata.expert_answer", b: "input", c: "output.response" },
        { variables: ["a", "b", "c"] },
      ),
    );
    await settle();
    await passDelay();

    const metadata = screen.getByText(
      "This trace has no metadata entry called expert_answer",
    );
    expect(metadata.className).toContain("text-red-600");
    expect(
      screen.getByText("This trace has no conversation").className,
    ).toContain("text-red-600");
    expect(screen.queryByText("This trace has no agent reply")).toBeNull();
  });

  it("uses the general agent's words", async () => {
    mockPreview.mockResolvedValue({
      values: [answer("a", "output.response", null)],
    });
    render(preview({ a: "output.response" }, { agentNature: "general" }));
    await settle();
    await passDelay();

    expect(screen.getByText("This trace has no output")).toBeInTheDocument();
  });

  it("asks nothing when no variable has a choice", async () => {
    render(preview({}));
    await settle();
    await passDelay();

    expect(mockPreview).not.toHaveBeenCalled();
    expect(screen.getAllByText("Not set")).toHaveLength(2);
  });

  it("waits about 300ms and asks once for the latest choices", async () => {
    const { rerender } = render(preview({ a: "input" }));
    await settle();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(299);
    });
    expect(mockPreview).not.toHaveBeenCalled();

    rerender(preview({ a: "labels" }));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(299);
    });
    expect(mockPreview).not.toHaveBeenCalled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(mockPreview).toHaveBeenCalledTimes(1);
    expect(mockPreview).toHaveBeenCalledWith("tok", "agent-1", "t1", {
      a: "labels",
    });
  });

  it("does not ask again when the same choices are drawn again", async () => {
    const { rerender } = render(preview({ a: "input" }));
    await settle();
    await passDelay();
    rerender(preview({ a: "input" }));
    await passDelay();

    expect(mockPreview).toHaveBeenCalledTimes(1);
  });

  it("asks again when another trace is chosen", async () => {
    render(preview({ a: "input" }));
    await settle();
    await passDelay();

    fireEvent.change(screen.getByLabelText("Test on a trace"), {
      target: { value: "t2" },
    });
    await passDelay();

    expect(mockPreview).toHaveBeenLastCalledWith("tok", "agent-1", "t2", {
      a: "input",
    });
  });

  it("lets the newest request win when an older answer lands last", async () => {
    const older = deferred<{ values: unknown[] }>();
    const newer = deferred<{ values: unknown[] }>();
    mockPreview
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const { rerender } = render(preview({ a: "input" }));
    await settle();
    await passDelay();

    rerender(preview({ a: "labels" }));
    await passDelay();
    expect(mockPreview).toHaveBeenCalledTimes(2);

    await act(async () =>
      newer.resolve({ values: [answer("a", "labels", "Newer answer")] }),
    );
    expect(screen.getByText("Newer answer")).toBeInTheDocument();

    await act(async () =>
      older.resolve({ values: [answer("a", "labels", "Older answer")] }),
    );
    expect(screen.getByText("Newer answer")).toBeInTheDocument();
    expect(screen.queryByText("Older answer")).not.toBeInTheDocument();
  });

  it("stays loading until the newest answer, even if an older one lands first", async () => {
    const older = deferred<{ values: unknown[] }>();
    const newer = deferred<{ values: unknown[] }>();
    mockPreview
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const { rerender } = render(preview({ a: "input" }));
    await settle();
    await passDelay();
    rerender(preview({ a: "labels" }));
    await passDelay();

    await act(async () => older.resolve({ values: [] }));
    expect(screen.getByText("Loading")).toBeInTheDocument();

    await act(async () =>
      newer.resolve({ values: [answer("a", "labels", "Newer answer")] }),
    );
    expect(screen.queryByText("Loading")).not.toBeInTheDocument();
  });

  it("shows what the backend said when reading the trace fails, then clears it", async () => {
    mockPreview.mockRejectedValueOnce(
      new Error('Request failed: 404 - {"detail":"Trace not found"}'),
    );
    const { rerender } = render(preview({ a: "input" }));
    await settle();
    await passDelay();

    expect(screen.getByRole("alert")).toHaveTextContent("Trace not found");
    expect(reportError).toHaveBeenCalled();
    expect(screen.queryByText("Loading")).not.toBeInTheDocument();

    rerender(preview({ a: "labels" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("has its own words when the failure says nothing", async () => {
    mockPreview.mockRejectedValueOnce("nope");
    render(preview({ a: "input" }));
    await settle();
    await passDelay();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not read this trace.",
    );
  });

  it("ignores a failure from a request that is no longer the newest", async () => {
    const older = deferred<{ values: unknown[] }>();
    mockPreview
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({ values: [answer("a", "labels", "Newer answer")] });
    const { rerender } = render(preview({ a: "input" }));
    await settle();
    await passDelay();
    rerender(preview({ a: "labels" }));
    await passDelay();

    await act(async () => older.reject(new Error("Too late")));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Newer answer")).toBeInTheDocument();
  });
});

describe("an agent with no traces", () => {
  const button = () => screen.getByRole("button", { name: "Check for a trace" });

  beforeEach(() => {
    mockFetchTraces.mockResolvedValue({ items: [], total: 0 });
  });

  it("says what to do, with no select", async () => {
    render(preview({ a: "input" }));

    expect(
      await screen.findByText("Send a sample trace to test this on real data"),
    ).toBeInTheDocument();
    expect(button()).toBeEnabled();
    expect(screen.queryByLabelText("Test on a trace")).not.toBeInTheDocument();
    expect(screen.queryByText("No trace yet")).not.toBeInTheDocument();
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it("keeps the button on screen with a spinner, then says none has arrived", async () => {
    const user = setupUser();
    const { container } = render(preview({}));
    await screen.findByRole("button", { name: "Check for a trace" });

    const check = deferred<{ items: unknown[] }>();
    mockFetchTraces.mockReturnValueOnce(check.promise);
    await user.click(button());

    expect(button()).toBeDisabled();
    expect(container.querySelector("button .animate-spin")).not.toBeNull();

    await act(async () => check.resolve({ items: [] }));

    expect(button()).toBeEnabled();
    expect(screen.getByText("No trace yet")).toBeInTheDocument();
    expect(mockFetchTraces).toHaveBeenCalledTimes(2);
  });

  it("moves to the test section once a trace is there", async () => {
    const user = setupUser();
    mockPreview.mockResolvedValue({
      values: [answer("a", "input", "From the trace")],
    });
    render(preview({ a: "input" }));
    await screen.findByRole("button", { name: "Check for a trace" });

    mockFetchTraces.mockResolvedValueOnce({ items: traces });
    await user.click(button());

    expect(await traceSelect()).toHaveValue("t1");
    expect(
      screen.queryByRole("button", { name: "Check for a trace" }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("From the trace")).toBeInTheDocument();
  });

  it("offers the button beside the error when the traces could not be fetched", async () => {
    const user = setupUser();
    mockFetchTraces.mockRejectedValueOnce(new Error("down"));
    render(preview({}));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load the traces for this agent.",
    );
    expect(reportError).toHaveBeenCalled();

    mockFetchTraces.mockRejectedValueOnce(new Error("down"));
    await user.click(button());
    await waitFor(() => expect(button()).toBeEnabled());
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("No trace yet")).not.toBeInTheDocument();

    await user.click(button());
    await screen.findByText("No trace yet");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
