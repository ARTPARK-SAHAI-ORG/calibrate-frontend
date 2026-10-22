import { render, screen, setupUser } from "@/test-utils";
import { type Answer, LOGIN, fakeBackend, sentBody, setLocation, fullText } from "@/test-utils/auth";
import { waitFor } from "@testing-library/react";
import { VERIFY_EXPIRED, VerifyEmail } from "../VerifyEmail";

const EXPIRED_ANSWER: Answer = [400, { detail: "expired_token" }];

beforeEach(() => localStorage.clear());

describe("VerifyEmail", () => {
  it("verifies the email once, keeps the login and goes to the wanted page", async () => {
    setLocation("?token=tok-1&callbackUrl=%2Fsimulations");
    const fetchMock = fakeBackend([200, LOGIN]);
    render(<VerifyEmail />);

    expect(screen.getByText("Verifying your email")).toBeInTheDocument();
    await waitFor(() => expect(window.location.href).toBe("/simulations"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/verify-email$/);
    expect(sentBody(fetchMock)).toEqual({ token: "tok-1" });
    expect(localStorage.getItem("access_token")).toBe("jwt-123");
  });

  it("sends a new link from the expired one with one click, and shows a tick once sent", async () => {
    setLocation("?token=old&callbackUrl=%2Finvite%2Ftok");
    const fetchMock = fakeBackend(EXPIRED_ANSWER, [202, { status: "sent", email: "a@b.co" }]);
    const user = setupUser();
    render(<VerifyEmail />);

    expect(await screen.findByText(VERIFY_EXPIRED)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Send verification email" }));

    expect(await screen.findByText("Verification email sent")).toBeInTheDocument();
    expect(
      screen.getByText(
        fullText("We sent a new link to a@b.co. Click it to verify your email, then you can sign in."),
      ),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/auth\/resend-verification$/);
    expect(sentBody(fetchMock, 1)).toEqual({ token: "old", next: "/invite/tok" });
  });

  it("says the email is already verified when asking for a new link", async () => {
    setLocation("?token=old&callbackUrl=%2Finvite%2Ftok");
    fakeBackend(EXPIRED_ANSWER, [400, { detail: "already_verified" }]);
    const user = setupUser();
    render(<VerifyEmail />);

    await user.click(await screen.findByRole("button", { name: "Send verification email" }));
    expect(await screen.findByText("Your email is already verified.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?callbackUrl=%2Finvite%2Ftok",
    );
  });

  it("says the email is already verified and offers sign in", async () => {
    setLocation("?token=used&callbackUrl=%2Finvite%2Ftok");
    fakeBackend([400, { detail: "already_verified" }]);
    render(<VerifyEmail />);

    expect(await screen.findByText("Your email is already verified.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?callbackUrl=%2Finvite%2Ftok",
    );
    expect(localStorage.getItem("access_token")).toBeNull();
  });

  it("asks nothing when the address has no token", async () => {
    setLocation("");
    const fetchMock = fakeBackend([200, LOGIN]);
    render(<VerifyEmail />);

    expect(await screen.findByText(VERIFY_EXPIRED)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call the link expired when the server fails", async () => {
    setLocation("?token=tok-1");
    fakeBackend([500, { detail: "boom" }]);
    render(<VerifyEmail />);

    expect(
      await screen.findByText("Could not verify your email. Please open the link again."),
    ).toBeInTheDocument();
    expect(screen.queryByText(VERIFY_EXPIRED)).toBeNull();
  });

  it("says when the server cannot be reached", async () => {
    setLocation("?token=tok-1");
    fakeBackend("unreachable");
    render(<VerifyEmail />);

    expect(
      await screen.findByText("Unable to connect to server. Please try again later."),
    ).toBeInTheDocument();
  });

  it("says so and keeps the button when sending fails", async () => {
    setLocation("?token=old");
    fakeBackend(EXPIRED_ANSWER, [400, { detail: "invalid_or_expired_token" }]);
    const user = setupUser();
    render(<VerifyEmail />);

    await user.click(await screen.findByRole("button", { name: "Send verification email" }));
    expect(
      await screen.findByText("Could not send a new link. Please try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send verification email" })).toBeEnabled();
  });

  it("says when the server cannot be reached while sending", async () => {
    setLocation("?token=old");
    fakeBackend(EXPIRED_ANSWER, "unreachable");
    const user = setupUser();
    render(<VerifyEmail />);

    await user.click(await screen.findByRole("button", { name: "Send verification email" }));
    expect(
      await screen.findByText("Unable to connect to server. Please try again later."),
    ).toBeInTheDocument();
  });
});
