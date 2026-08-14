import { render, screen, setupUser } from "@/test-utils";
import {
  EMPTY_LABELLED_BY_FILTER,
  LabelledByFilterControl,
  isLabelledByFilterActive,
  type LabelledByAnnotator,
} from "../LabelledByFilter";

const asha: LabelledByAnnotator = { uuid: "ann-asha", name: "Asha" };
const ravi: LabelledByAnnotator = { uuid: "ann-ravi", name: "Ravi" };
const unnamed: LabelledByAnnotator = { uuid: "abcdefgh-1234", name: null };

describe("isLabelledByFilterActive", () => {
  it("is inactive until anyone or a person is picked", () => {
    expect(isLabelledByFilterActive(EMPTY_LABELLED_BY_FILTER)).toBe(false);
    expect(isLabelledByFilterActive({ anyone: true, annotatorIds: [] })).toBe(
      true,
    );
    expect(
      isLabelledByFilterActive({ anyone: false, annotatorIds: ["ann-asha"] }),
    ).toBe(true);
  });
});

describe("LabelledByFilterControl", () => {
  const noop = jest.fn();

  it("renders nothing when there are no annotators", () => {
    const { container } = render(
      <LabelledByFilterControl
        annotators={[]}
        filter={EMPTY_LABELLED_BY_FILTER}
        onChange={noop}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows only the pill before anything is picked", () => {
    render(
      <LabelledByFilterControl
        annotators={[asha]}
        filter={EMPTY_LABELLED_BY_FILTER}
        onChange={noop}
      />,
    );
    expect(
      screen.getByRole("button", { name: "+ Labelled by" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Anyone" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
  });

  it("picking Anyone turns on the anyone mode", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(
      <LabelledByFilterControl
        annotators={[asha, ravi]}
        filter={EMPTY_LABELLED_BY_FILTER}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "+ Labelled by" }));
    await user.click(screen.getByRole("button", { name: "Anyone" }));
    expect(onChange).toHaveBeenCalledWith({ anyone: true, annotatorIds: [] });
  });

  it("picking a person clears anyone", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(
      <LabelledByFilterControl
        annotators={[asha, ravi]}
        filter={{ anyone: true, annotatorIds: [] }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "+ Labelled by" }));
    await user.click(screen.getByRole("button", { name: "Asha" }));
    expect(onChange).toHaveBeenCalledWith({
      anyone: false,
      annotatorIds: ["ann-asha"],
    });
  });

  it("picking a second person keeps both, with the dropdown still open", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(
      <LabelledByFilterControl
        annotators={[asha, ravi]}
        filter={{ anyone: false, annotatorIds: ["ann-asha"] }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "+ Labelled by" }));
    await user.click(screen.getByRole("button", { name: "Ravi" }));
    expect(onChange).toHaveBeenCalledWith({
      anyone: false,
      annotatorIds: ["ann-asha", "ann-ravi"],
    });
    expect(screen.getByRole("button", { name: "Asha" })).toBeVisible();
  });

  it("falls back to the first part of the uuid when a person has no name", async () => {
    const user = setupUser();
    render(
      <LabelledByFilterControl
        annotators={[unnamed]}
        filter={EMPTY_LABELLED_BY_FILTER}
        onChange={noop}
      />,
    );
    await user.click(screen.getByRole("button", { name: "+ Labelled by" }));
    expect(screen.getByRole("button", { name: "abcdefgh" })).toBeVisible();
  });

  it("shows a tag per choice and the x removes just that one", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(
      <LabelledByFilterControl
        annotators={[asha, ravi]}
        filter={{ anyone: false, annotatorIds: ["ann-asha", "ann-ravi"] }}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("Labelled by Asha")).toBeInTheDocument();
    expect(screen.getByText("Labelled by Ravi")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Remove Labelled by Asha" }),
    );
    expect(onChange).toHaveBeenCalledWith({
      anyone: false,
      annotatorIds: ["ann-ravi"],
    });
  });

  it("removes the anyone tag", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(
      <LabelledByFilterControl
        annotators={[asha]}
        filter={{ anyone: true, annotatorIds: [] }}
        onChange={onChange}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Remove Labelled by anyone" }),
    );
    expect(onChange).toHaveBeenCalledWith(EMPTY_LABELLED_BY_FILTER);
  });

  it("Clear all shows only with two tags and empties the filter", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    const { rerender } = render(
      <LabelledByFilterControl
        annotators={[asha, ravi]}
        filter={{ anyone: false, annotatorIds: ["ann-asha"] }}
        onChange={onChange}
      />,
    );
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();

    rerender(
      <LabelledByFilterControl
        annotators={[asha, ravi]}
        filter={{ anyone: false, annotatorIds: ["ann-asha", "ann-ravi"] }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onChange).toHaveBeenCalledWith(EMPTY_LABELLED_BY_FILTER);
  });

  it("unticking a person in the list takes them out of the filter", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(
      <LabelledByFilterControl
        annotators={[asha, ravi]}
        filter={{ anyone: false, annotatorIds: ["ann-asha", "ann-ravi"] }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "+ Labelled by" }));
    await user.click(screen.getByRole("button", { name: "Asha" }));
    expect(onChange).toHaveBeenCalledWith({
      anyone: false,
      annotatorIds: ["ann-ravi"],
    });
  });

  it("keeps a tag for someone who has dropped off the task", async () => {
    // Asha's items were deleted, so she is gone from the task's annotator
    // list, but the filter is still on her. The tag has to stay or there is
    // no way to switch the filter off.
    const user = setupUser();
    const onChange = jest.fn();
    render(
      <LabelledByFilterControl
        annotators={[]}
        filter={{ anyone: false, annotatorIds: ["ann-asha"] }}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("Labelled by ann-asha")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Remove Labelled by ann-asha" }),
    );
    expect(onChange).toHaveBeenCalledWith({ anyone: false, annotatorIds: [] });
  });

  it("closes the dropdown on Escape", async () => {
    const user = setupUser();
    render(
      <LabelledByFilterControl
        annotators={[asha]}
        filter={EMPTY_LABELLED_BY_FILTER}
        onChange={noop}
      />,
    );
    await user.click(screen.getByRole("button", { name: "+ Labelled by" }));
    expect(screen.getByRole("button", { name: "Anyone" })).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Anyone" })).toBeNull();
  });
});
