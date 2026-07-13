import { render, screen, setupUser } from "@/test-utils";
import {
  dedupeSourceEvaluators,
  SubmitForLabellingButton,
} from "../labellingSubmit";

const toastErrorMock = jest.fn();
jest.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}));

describe("dedupeSourceEvaluators", () => {
  it("drops uuid-less entries and collapses duplicates, keeping first name", () => {
    expect(
      dedupeSourceEvaluators([
        { uuid: "a", name: "First" },
        { uuid: undefined, name: "No uuid" },
        { uuid: "a", name: "Dup of a" },
        { uuid: null, name: "Null uuid" },
        { uuid: "b", name: "Second" },
      ]),
    ).toEqual([
      { uuid: "a", name: "First" },
      { uuid: "b", name: "Second" },
    ]);
  });

  it("returns an empty array for no usable evaluators", () => {
    expect(dedupeSourceEvaluators([{ uuid: undefined }, { uuid: null }])).toEqual(
      [],
    );
  });
});

describe("SubmitForLabellingButton", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the count and opens the dialog when rows are selected", async () => {
    const user = setupUser();
    const onOpen = jest.fn();
    render(
      <SubmitForLabellingButton
        count={3}
        emptyMessage="pick something"
        onOpen={onOpen}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Submit for labelling \(3\)/ }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("toasts and does not open when nothing is selected", async () => {
    const user = setupUser();
    const onOpen = jest.fn();
    render(
      <SubmitForLabellingButton
        count={0}
        emptyMessage="pick something"
        onOpen={onOpen}
      />,
    );
    // No count suffix when empty.
    expect(
      screen.getByRole("button", { name: "Submit for labelling" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    expect(onOpen).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith("pick something");
  });
});
