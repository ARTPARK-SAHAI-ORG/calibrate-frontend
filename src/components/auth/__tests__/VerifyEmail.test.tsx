import { render, screen, setupUser } from "@/test-utils";
import { LOGIN, mockFetchOnce, sentBody, setLocation } from "@/test-utils/auth";
import { waitFor } from "@testing-library/react";
import { VerifyEmail } from "../VerifyEmail";

const EXPIRED = "This link has expired. Request a new verification link.";
const EXPIRED_NO_ADDRESS =
  "This link has expired. Sign in to get a new verification link.";

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
    setLocation("?token=tok-1&email=a%40b.co&callbackUrl=%2Fsimulations");
    const fetchMock = mockFetchOnce(200, LOGIN);
    render(<VerifyEmail />);

    expect(screen.getByText("Verifying your email")).toBeInTheDocument();
    await waitFor(() => expect(window.location.href).toBe("/simulations"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/verify-email$/);
    expect(sentBody(fetchMock)).toEqual({ token: "tok-1", email: "a@b.co" });
    expect(localStorage.getItem("access_token")).toBe("jwt-123");
  });

  it("offers a new email for a link that no longer works, and shows a tick once sent", async () => {
    setLocation("?token=old&email=a%40b.co&callbackUrl=%2Finvite%2Ftok");
    const fetchMock = mockFetchSequence(
      [400, { detail: "expired_token" }],
      [202, { status: "sent", email: "a@b.co" }],
    );
    const user = setupUser();
    render(<VerifyEmail />);

    expect(await screen.findByText(EXPIRED)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Send verification email" }));

    expect(await screen.findByText("Verification email sent")).toBeInTheDocument();
    expect(
      screen.getByText(
        "We sent a new link to a@b.co. Click it to verify your email, then you can sign in.",
      ),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/auth\/resend-verification$/);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      email: "a@b.co",
      next: "/invite/tok",
    });
  });

  it("says the email is already verified and offers sign in", async () => {
    setLocation("?token=used&email=a%40b.co&callbackUrl=%2Finvite%2Ftok");
    mockFetchOnce(400, { detail: "already_verified" });
    render(<VerifyEmail />);

    expect(await screen.findByText("Your email is already verified.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?callbackUrl=%2Finvite%2Ftok",
    );
    expect(localStorage.getItem("access_token")).toBeNull();
  });

  it("sends a link with no address to sign in, which sends a new one", async () => {
    setLocation("?token=old&callbackUrl=%2Finvite%2Ftok");
    const fetchMock = mockFetchOnce(400, { detail: "expired_token" });
    render(<VerifyEmail />);

    expect(await screen.findByText(EXPIRED_NO_ADDRESS)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?callbackUrl=%2Finvite%2Ftok",
    );
    expect(sentBody(fetchMock)).toEqual({ token: "old" });
  });

  it("asks nothing when the address has no token", async () => {
    setLocation("?email=a%40b.co");
    const fetchMock = mockFetchOnce(200, LOGIN);
    render(<VerifyEmail />);

    expect(await screen.findByText(EXPIRED)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call the link expired when the server fails", async () => {
    setLocation("?token=tok-1");
    mockFetchOnce(500, { detail: "boom" });
    render(<VerifyEmail />);

    expect(
      await screen.findByText("Could not verify your email. Please open the link again."),
    ).toBeInTheDocument();
    expect(screen.queryByText(EXPIRED)).toBeNull();
  });

  it("says when the server cannot be reached", async () => {
    setLocation("?token=tok-1");
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    render(<VerifyEmail />);

    expect(
      await screen.findByText("Unable to connect to server. Please try again later."),
    ).toBeInTheDocument();
  });

  it("says so and keeps the button when sending fails", async () => {
    setLocation("?token=old&email=a%40b.co");
    mockFetchSequence([400, { detail: "expired_token" }], [500, {}]);
    const user = setupUser();
    render(<VerifyEmail />);

    await user.click(await screen.findByRole("button", { name: "Send verification email" }));
    expect(
      await screen.findByText("Could not send a new link. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send verification email" })).toBeEnabled();
  });

  it("says when the server cannot be reached while sending", async () => {
    setLocation("?token=old&email=a%40b.co");
    const fetchMock = mockFetchSequence([400, { detail: "expired_token" }]);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const user = setupUser();
    render(<VerifyEmail />);

    await user.click(await screen.findByRole("button", { name: "Send verification email" }));
    expect(
      await screen.findByText("Unable to connect to server. Please try again later."),
    ).toBeInTheDocument();
  });
});
