import { render, screen, setupUser } from "@/test-utils";
import { TracesFilterDialog } from "../TracesFilterDialog";
import { NO_TRACE_FILTERS, type TraceFilterValues } from "@/lib/tracesApi";

const onApply = jest.fn();
const onClose = jest.fn();

const props = {
  isOpen: true,
  onClose,
  value: NO_TRACE_FILTERS,
  onApply,
  allLabels: ["production", "staging"],
  allMetadataKeys: ["clinic_id"],
};

beforeEach(() => jest.clearAllMocks());

/** The filters the last Apply handed back. */
function applied(): TraceFilterValues {
  return onApply.mock.calls[onApply.mock.calls.length - 1][0];
}

describe("TracesFilterDialog", () => {
  it("shows nothing until it is opened", () => {
    render(<TracesFilterDialog {...props} isOpen={false} />);

    expect(screen.queryByText("Filter traces")).not.toBeInTheDocument();
  });

  it("hands back everything the reader set, and closes", async () => {
    const user = setupUser();
    render(<TracesFilterDialog {...props} />);

    await user.click(screen.getByRole("button", { name: "Tool call" }));
    await user.type(screen.getByPlaceholderText("Any input"), "polio");
    await user.type(screen.getByPlaceholderText("Any output"), "14 weeks");
    await user.click(screen.getByText("All labels"));
    await user.click(screen.getByText("production"));
    await user.click(screen.getByText("All metadata keys"));
    await user.click(screen.getByText("clinic_id"));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(applied()).toEqual({
      outputType: "tool_call",
      labels: ["production"],
      metadataKeys: ["clinic_id"],
      inputContains: "polio",
      outputContains: "14 weeks",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("changes nothing until Apply is pressed", async () => {
    const user = setupUser();
    render(<TracesFilterDialog {...props} />);

    await user.type(screen.getByPlaceholderText("Any input"), "polio");

    expect(onApply).not.toHaveBeenCalled();
  });

  it("starts again from what is filtering the list each time it opens", async () => {
    const user = setupUser();
    const { rerender } = render(<TracesFilterDialog {...props} />);

    await user.type(screen.getByPlaceholderText("Any input"), "abandoned");
    rerender(<TracesFilterDialog {...props} isOpen={false} />);
    rerender(<TracesFilterDialog {...props} />);

    expect(screen.getByPlaceholderText("Any input")).toHaveValue("");
  });

  it("clears everything back to nothing filtered", async () => {
    const user = setupUser();
    render(
      <TracesFilterDialog
        {...props}
        value={{
          outputType: "response",
          labels: ["staging"],
          metadataKeys: ["clinic_id"],
          inputContains: "polio",
          outputContains: "14 weeks",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Clear all" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(applied()).toEqual(NO_TRACE_FILTERS);
  });

  it("cannot clear when nothing is set", () => {
    render(<TracesFilterDialog {...props} />);

    expect(screen.getByRole("button", { name: "Clear all" })).toBeDisabled();
  });

  it("says so instead of offering an empty picker", () => {
    render(
      <TracesFilterDialog {...props} allLabels={[]} allMetadataKeys={[]} />,
    );

    expect(
      screen.getByText(
        "This agent has not sent any labels with its traces yet.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This agent has not sent any metadata with its traces yet.",
      ),
    ).toBeInTheDocument();
  });
});
