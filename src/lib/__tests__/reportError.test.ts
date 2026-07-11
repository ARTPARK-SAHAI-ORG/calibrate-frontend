const captureException = jest.fn();

jest.mock("@sentry/nextjs", () => ({
  __esModule: true,
  captureException: (...args: unknown[]) => captureException(...args),
}));

import { reportError } from "../reportError";

describe("reportError", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    captureException.mockClear();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    Object.defineProperty(process.env, "NODE_ENV", {
      value: originalNodeEnv,
      configurable: true,
    });
  });

  it("logs to console in non-production and captures exception", () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "development",
      configurable: true,
    });
    const err = new Error("boom");

    reportError("Something failed", err, { extraInfo: 1 });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Something failed",
      err,
      { extraInfo: 1 },
    );
    expect(captureException).toHaveBeenCalledWith(err, {
      extra: { message: "Something failed", details: [err, { extraInfo: 1 }] },
    });
  });

  it("does not log to console in production", () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
    });

    reportError("Prod failure");

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalled();
  });

  it("synthesizes an Error from the message when no Error is present in details", () => {
    reportError("No error object here", { code: 500 });

    const [capturedErr, context] = captureException.mock.calls[0];
    expect(capturedErr).toBeInstanceOf(Error);
    expect((capturedErr as Error).message).toBe("No error object here");
    expect(context).toEqual({
      extra: { message: "No error object here", details: [{ code: 500 }] },
    });
  });

  it("finds an Error anywhere in the details list", () => {
    const err = new Error("nested");
    reportError("msg", { code: 1 }, err, "trailing");

    const [capturedErr] = captureException.mock.calls[0];
    expect(capturedErr).toBe(err);
  });

  it("works with no details at all", () => {
    reportError("just a message");

    const [capturedErr, context] = captureException.mock.calls[0];
    expect(capturedErr).toBeInstanceOf(Error);
    expect((capturedErr as Error).message).toBe("just a message");
    expect(context).toEqual({
      extra: { message: "just a message", details: [] },
    });
  });
});
