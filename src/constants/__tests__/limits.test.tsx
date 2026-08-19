import { toast } from "sonner";
import { exceedsEvalLimit, showLimitToast, CONTACT_LINK } from "../limits";

jest.mock("sonner", () => ({
  toast: { error: jest.fn() },
}));

describe("showLimitToast", () => {
  afterEach(() => jest.clearAllMocks());

  it("shows the message with a link to contact us", () => {
    showLimitToast("Too big.");
    expect(toast.error).toHaveBeenCalledTimes(1);
    const node = (toast.error as jest.Mock).mock.calls[0][0];
    const children = node.props.children;
    expect(children[0]).toBe("Too big.");
    expect(children[2].props.href).toBe(CONTACT_LINK);
  });
});

describe("exceedsEvalLimit", () => {
  afterEach(() => jest.clearAllMocks());

  it("lets a run under the limit through without a toast", () => {
    expect(exceedsEvalLimit(19, 20, "tests")).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("lets a run exactly on the limit through", () => {
    expect(exceedsEvalLimit(20, 20, "tests")).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("blocks a run over the limit and says both numbers", () => {
    expect(exceedsEvalLimit(21, 20, "tests")).toBe(true);
    expect(toast.error).toHaveBeenCalledTimes(1);
    const node = (toast.error as jest.Mock).mock.calls[0][0];
    expect(node.props.children[0]).toBe(
      "You can only run up to 20 tests at a time. This run needs 21.",
    );
  });

  it("names whatever is being run", () => {
    expect(exceedsEvalLimit(100, 20, "items")).toBe(true);
    const node = (toast.error as jest.Mock).mock.calls[0][0];
    expect(node.props.children[0]).toBe(
      "You can only run up to 20 items at a time. This run needs 100.",
    );
  });
});
