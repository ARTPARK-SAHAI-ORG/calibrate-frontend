import { render, screen } from "@/test-utils";
import { LOGIN, mockFetchOnce, sentBody, setLocation } from "@/test-utils/auth";
import { waitFor } from "@testing-library/react";
import { VerifyEmail } from "../VerifyEmail";

const EXPIRED =
  "This link has expired or was already used. Log in to get a new one.";

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
    setLocation("?token=old");
    mockFetchOnce(400, { detail: "invalid_or_expired_token" });
    render(<VerifyEmail />);

    expect(await screen.findByText(EXPIRED)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to log in" })).toHaveAttribute(
      "href",
      "/login",
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

  it("says when the server cannot be reached", async () => {
    setLocation("?token=tok-1");
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    render(<VerifyEmail />);

    expect(
      await screen.findByText("Unable to connect to server. Please try again later."),
    ).toBeInTheDocument();
  });
});
