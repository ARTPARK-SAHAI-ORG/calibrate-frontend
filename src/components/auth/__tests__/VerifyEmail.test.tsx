import { render, screen } from "@/test-utils";
import { LOGIN, mockFetchOnce, sentBody, setLocation } from "@/test-utils/auth";
import { waitFor } from "@testing-library/react";
import { VerifyEmail } from "../VerifyEmail";

const EXPIRED =
  "This link has expired or was already used. Sign in to get a new one.";

beforeEach(() => localStorage.clear());

describe("VerifyEmail", () => {
  it("confirms the email once, keeps the login and goes to the wanted page", async () => {
    setLocation("?token=tok-1&callbackUrl=%2Fsimulations");
    const fetchMock = mockFetchOnce(200, LOGIN);
    render(<VerifyEmail />);

    expect(screen.getByText("Confirming your email")).toBeInTheDocument();
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

    expect(await screen.findByText(EXPIRED)).toBeInTheDocument();
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

    expect(await screen.findByText(EXPIRED)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call the link used up when the server fails", async () => {
    setLocation("?token=tok-1");
    mockFetchOnce(500, { detail: "boom" });
    render(<VerifyEmail />);

    expect(
      await screen.findByText("Could not confirm your email. Please open the link again."),
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
});
