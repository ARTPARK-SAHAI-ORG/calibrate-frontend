import { toast } from "sonner";
import { showLimitToast, CONTACT_LINK } from "../limits";

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
