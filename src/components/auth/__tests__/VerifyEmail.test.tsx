import { render, screen, setupUser } from "@/test-utils";
import { LOGIN, mockFetchOnce, sentBody, setLocation } from "@/test-utils/auth";
import { waitFor } from "@testing-library/react";
import { VerifyEmail } from "../VerifyEmail";

const USED = "This link was already used, or a newer one was sent to you.";

/** The verify call answers first, then the resend call. */
function mockFetchSequence(...answers: Array<[number, unknown]>) {
  const fetchMock = jest.fn();
  for (const [status, body] of answers) {
    fetchMock.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    });
  }
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

beforeEach(() => localStorage.clear());

describe("VerifyEmail", () => {
  it("verifies the email once, keeps the login and goes to the wanted page", async () => {
    setLocation("?token=tok-1&callbackUrl=%2Fsimulations");
    const fetchMock = mockFetchOnce(200, LOGIN);
    render(<VerifyEmail />);

    expect(screen.getByText("Verifying your email")).toBeInTheDocument();
    await waitFor(() => expect(window.location.href).toBe("/simulations"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/verify-email$/);
    expect(sentBody(fetchMock)).toEqual({ token: "tok-1" });
    expect(localStorage.getItem("access_token")).toBe("jwt-123");
  });

  it("says the link is used up when the backend refuses it", async () => {
    setLocation("?token=old&callbackUrl=%2Finvite%2Ftok");
    mockFetchOnce(400, { detail: "invalid_or_expired_token" });
    render(<VerifyEmail />);

    expect(await screen.findByText(USED)).toBeInTheDocument();
    // Signing in from here still leads back to the invite
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?callbackUrl=%2Finvite%2Ftok",
    );
    expect(localStorage.getItem("access_token")).toBeNull();
  });

  it("says the same when the address has no token, and asks nothing", async () => {
    setLocation("");
    const fetchMock = mockFetchOnce(200, LOGIN);
    render(<VerifyEmail />);

    expect(await screen.findByText(USED)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call the link used up when the server fails", async () => {
    setLocation("?token=tok-1");
    mockFetchOnce(500, { detail: "boom" });
    render(<VerifyEmail />);

    expect(
      await screen.findByText("Could not verify your email. Please open the link again."),
    ).toBeInTheDocument();
    expect(screen.queryByText(USED)).toBeNull();
  });

  it("says when the server cannot be reached", async () => {
    setLocation("?token=tok-1");
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    render(<VerifyEmail />);

    expect(
      await screen.findByText("Unable to connect to server. Please try again later."),
    ).toBeInTheDocument();
  });
});


describe("VerifyEmail with an expired link", () => {
  it("offers a new email and shows a tick once it is sent", async () => {
    setLocation("?token=old&callbackUrl=%2Finvite%2Ftok");
    const fetchMock = mockFetchSequence(
      [400, { detail: "expired_token" }],
      [202, { status: "sent", email: "a@b.co" }],
    );
    const user = setupUser();
    render(<VerifyEmail />);

    expect(await screen.findByText("This verification link has expired.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send a new verification email" }));

    expect(await screen.findByText("Verification email sent")).toBeInTheDocument();
    expect(
      screen.getByText(
        "We sent a new link to a@b.co. Click it to verify your email, then you can sign in.",
      ),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/auth\/resend-verification$/);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      token: "old",
      next: "/invite/tok",
    });
  });

  it("falls back to sign in when the link can no longer ask for a new one", async () => {
    setLocation("?token=old");
    mockFetchSequence(
      [400, { detail: "expired_token" }],
      [400, { detail: "invalid_or_expired_token" }],
    );
    const user = setupUser();
    render(<VerifyEmail />);

    await user.click(
      await screen.findByRole("button", { name: "Send a new verification email" }),
    );
    expect(await screen.findByText(USED)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });

  it("says so and keeps the button when sending fails", async () => {
    setLocation("?token=old");
    mockFetchSequence([400, { detail: "expired_token" }], [500, {}]);
    const user = setupUser();
    render(<VerifyEmail />);

    await user.click(
      await screen.findByRole("button", { name: "Send a new verification email" }),
    );
    expect(
      await screen.findByText("Could not send a new link. Please try again."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send a new verification email" }),
    ).toBeEnabled();
  });

  it("says when the server cannot be reached while sending", async () => {
    setLocation("?token=old");
    const fetchMock = mockFetchSequence([400, { detail: "expired_token" }]);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const user = setupUser();
    render(<VerifyEmail />);

    await user.click(
      await screen.findByRole("button", { name: "Send a new verification email" }),
    );
    expect(
      await screen.findByText("Unable to connect to server. Please try again later."),
    ).toBeInTheDocument();
  });
});
