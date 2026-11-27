import { render, screen, setupUser } from "@/test-utils";
import { TraceVariableValues } from "../TraceVariableValues";

const row = (
  perTrace: { traceId: string; label: string; value: string | null }[],
  source = "feedback.comment",
) => ({ variable: "comment", source, perTrace });

describe("TraceVariableValues", () => {
  it("shows the one trace's value under the variable and where it comes from", () => {
    render(
      <TraceVariableValues
        rows={[row([{ traceId: "t1", label: "Hi", value: "Too slow" }])]}
        outcome="tests"
      />,
    );
    expect(screen.getByText("{{comment}}")).toBeInTheDocument();
    expect(screen.getByText("from")).toBeInTheDocument();
    expect(screen.getByText("User feedback comment")).toBeInTheDocument();
    expect(screen.getByText("Too slow")).toBeInTheDocument();
  });

  it("warns that the test goes without the evaluator when the one trace has no value", () => {
    render(
      <TraceVariableValues
        rows={[row([{ traceId: "t1", label: "Hi", value: null }])]}
        outcome="tests"
      />,
    );
    expect(
      screen.getByText(
        "This trace has no user feedback comment, so the test will be added without this evaluator",
      ),
    ).toBeInTheDocument();
  });

  it("warns that the item has it left blank when labelling", () => {
    render(
      <TraceVariableValues
        rows={[
          row([{ traceId: "t1", label: "Hi", value: null }], "metadata.city"),
        ]}
        outcome="labelling"
      />,
    );
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === "P" &&
          el.textContent ===
            "This trace has no metadata entry called city, so this item will have it left blank",
      ),
    ).toBeInTheDocument();
    // The field's name is set apart from the words around it.
    expect(screen.getByText("city").tagName).toBe("CODE");
  });

  it("sets a missing metadata field's name apart in the list of traces", () => {
    render(
      <TraceVariableValues
        rows={[
          row(
            [
              { traceId: "t1", label: "Hi", value: null },
              { traceId: "t2", label: "Bye", value: "Pune" },
            ],
            "metadata.city",
          ),
        ]}
        outcome="tests"
      />,
    );
    const key = screen.getByText("city");
    expect(key.tagName).toBe("CODE");
    expect(key.parentElement?.textContent).toBe("No city in the metadata");
  });

  it("lists every trace with its value, or what it lacks", () => {
    render(
      <TraceVariableValues
        rows={[
          row([
            { traceId: "t1", label: "First trace", value: "Good" },
            { traceId: "t2", label: "Second trace", value: null },
          ]),
        ]}
        outcome="tests"
      />,
    );
    expect(screen.getByText("Trace")).toBeInTheDocument();
    expect(screen.getByText("Value")).toBeInTheDocument();
    expect(screen.getByText("First trace")).toBeInTheDocument();
    expect(screen.getByText("Good")).toBeInTheDocument();
    expect(screen.getByText("Second trace")).toBeInTheDocument();
    expect(screen.getByText("No user feedback comment")).toBeInTheDocument();
  });

  it("explains the source on hover", async () => {
    const user = setupUser();
    render(
      <TraceVariableValues
        rows={[
          row([{ traceId: "t1", label: "Hi", value: "x" }], "metadata.city"),
        ]}
        outcome="tests"
      />,
    );
    await user.hover(screen.getByText("Metadata: city"));
    expect(
      await screen.findByText("A field your code sent in the trace's metadata"),
    ).toBeInTheDocument();
  });

  it("names a source with no hint, and only the source when no trace is named", () => {
    render(<TraceVariableValues rows={[row([], "input")]} outcome="tests" />);
    expect(screen.getByText("{{comment}}")).toBeInTheDocument();
    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.queryByText("Trace")).not.toBeInTheDocument();
  });

  it("shows loading in place of the values", () => {
    render(
      <TraceVariableValues
        rows={[row([{ traceId: "t1", label: "Hi", value: "Too slow" }])]}
        outcome="tests"
        loading
      />,
    );
    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(screen.queryByText("Too slow")).not.toBeInTheDocument();
  });

  it("keeps a long value with no spaces inside the box, scrolling past a cap", () => {
    const long = "x".repeat(500);
    render(
      <TraceVariableValues
        rows={[
          row([
            { traceId: "t1", label: "Hi", value: long },
            { traceId: "t2", label: "Bye", value: "Pune" },
          ]),
        ]}
        outcome="tests"
      />,
    );
    // A fixed layout lets the cell break the word instead of widening.
    expect(screen.getByRole("table")).toHaveClass("table-fixed");
    const cell = screen.getByText(long);
    expect(cell).toHaveClass("max-h-40", "overflow-y-auto");
    expect(cell.closest("td")).toHaveClass("[overflow-wrap:anywhere]");
  });

  it("caps one trace's long value the same way", () => {
    const long = "y".repeat(500);
    render(
      <TraceVariableValues
        rows={[row([{ traceId: "t1", label: "Hi", value: long }])]}
        outcome="tests"
      />,
    );
    expect(screen.getByText(long)).toHaveClass(
      "max-h-40",
      "overflow-y-auto",
      "[overflow-wrap:anywhere]",
    );
  });
});
