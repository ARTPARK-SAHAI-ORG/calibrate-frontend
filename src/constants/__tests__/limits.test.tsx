import { render } from "@testing-library/react";
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
    const { container } = render((toast.error as jest.Mock).mock.calls[0][0]);
    expect(container.innerHTML).toBe(
      `<span>Too big. <a href="${CONTACT_LINK}" target="_blank" rel="noopener noreferrer" class="font-bold">Click here</a> to contact us to extend your limits.</span>`,
    );
  });
});
