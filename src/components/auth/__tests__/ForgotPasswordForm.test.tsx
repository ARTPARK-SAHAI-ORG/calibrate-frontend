import { render, screen, setupUser } from "@/test-utils";
import { mockFetchOnce, sentBody, setLocation } from "@/test-utils/auth";
import { ForgotPasswordForm } from "../ForgotPasswordForm";

describe("ForgotPasswordForm", () => {
  it("sends the email with the wanted page and always says a link was sent", async () => {
    setLocation("?callbackUrl=%2Ftools");
    const fetchMock = mockFetchOnce(202, { status: "sent" });
    const user = setupUser();
    render(<ForgotPasswordForm />);

    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      "/login?callbackUrl=%2Ftools",
    );
    await user.type(screen.getByLabelText("Email"), " a@b.co ");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(
      await screen.findByText(
        "If an account exists for a@b.co, we sent a link to reset your password.",
      ),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/forgot-password$/);
    expect(sentBody(fetchMock)).toEqual({ email: "a@b.co", next: "/tools" });
  });

  it("says the link was not sent when the server fails", async () => {
    setLocation("");
    mockFetchOnce(500, { detail: "boom" });
    const user = setupUser();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(
      await screen.findByText("Could not send the link. Please try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/If an account exists/)).toBeNull();
  });

  it("leaves next out when the address names no page", async () => {
    setLocation("");
    const fetchMock = mockFetchOnce(202, { status: "sent" });
    const user = setupUser();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await screen.findByText(/If an account exists for a@b.co/);
    expect(sentBody(fetchMock)).toEqual({ email: "a@b.co" });
  });

  it("says when the server cannot be reached", async () => {
    setLocation("");
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const user = setupUser();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(
      await screen.findByText("Unable to connect to server. Please try again later."),
    ).toBeInTheDocument();
  });
});
