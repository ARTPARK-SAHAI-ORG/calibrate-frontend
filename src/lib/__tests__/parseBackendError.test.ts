import {
  readNameConflictMessage,
  readBulkNameConflictMessage,
  readNameConflictFromError,
  parseBackendErrorResponse,
  parseBackendErrorMessage,
  getErrorStatusCode,
} from "@/lib/parseBackendError";

// Use a relative specifier here (not the "@/" alias): next/jest's SWC
// transform rewrites "@/..." to relative paths only in import/export
// declarations, not in arbitrary string arguments like jest.mock()'s first
// argument. Jest mocks are keyed by the resolved absolute file path though,
// so a relative specifier here still intercepts the "@/lib/reportError" import.
jest.mock("../reportError", () => ({
  reportError: jest.fn(),
}));

import { reportError } from "@/lib/reportError";

function mockResponse(status: number, jsonBody?: unknown, jsonThrows = false): Response {
  const json = jsonThrows
    ? jest.fn().mockRejectedValue(new Error("not json"))
    : jest.fn().mockResolvedValue(jsonBody);
  const res: Partial<Response> = {
    status,
    ok: status >= 200 && status < 300,
    json,
    clone() {
      return res as Response;
    },
  };
  return res as Response;
}

describe("readNameConflictMessage", () => {
  it("returns null when status isn't 409", async () => {
    const res = mockResponse(400, { detail: "x already exists" });
    expect(await readNameConflictMessage(res)).toBeNull();
  });

  it("returns the detail on a 409 name-collision", async () => {
    const res = mockResponse(409, { detail: "Agent name already exists" });
    expect(await readNameConflictMessage(res)).toBe("Agent name already exists");
  });

  it("returns null on 409 without matching detail text", async () => {
    const res = mockResponse(409, { detail: "conflict" });
    expect(await readNameConflictMessage(res)).toBeNull();
  });

  it("returns null when detail isn't a string", async () => {
    const res = mockResponse(409, { detail: { nested: true } });
    expect(await readNameConflictMessage(res)).toBeNull();
  });

  it("returns null when the body isn't JSON", async () => {
    const res = mockResponse(409, undefined, true);
    expect(await readNameConflictMessage(res)).toBeNull();
  });
});

describe("readBulkNameConflictMessage", () => {
  it("returns null when status isn't 400", async () => {
    const res = mockResponse(409, { detail: "Test names already exist: a" });
    expect(await readBulkNameConflictMessage(res)).toBeNull();
  });

  it("returns detail for singular 'already exists'", async () => {
    const res = mockResponse(400, { detail: "Test name already exists" });
    expect(await readBulkNameConflictMessage(res)).toBe("Test name already exists");
  });

  it("returns detail for plural 'already exist'", async () => {
    const res = mockResponse(400, { detail: "Test names already exist: a, b" });
    expect(await readBulkNameConflictMessage(res)).toBe(
      "Test names already exist: a, b",
    );
  });

  it("returns detail for 'duplicate'", async () => {
    const res = mockResponse(400, { detail: "duplicate test name" });
    expect(await readBulkNameConflictMessage(res)).toBe("duplicate test name");
  });

  it("returns null for unrelated 400s", async () => {
    const res = mockResponse(400, { detail: "Invalid input" });
    expect(await readBulkNameConflictMessage(res)).toBeNull();
  });

  it("returns null when detail isn't a string", async () => {
    const res = mockResponse(400, { detail: 42 });
    expect(await readBulkNameConflictMessage(res)).toBeNull();
  });

  it("returns null when the body isn't JSON", async () => {
    const res = mockResponse(400, undefined, true);
    expect(await readBulkNameConflictMessage(res)).toBeNull();
  });
});

describe("readNameConflictFromError", () => {
  it("returns null for non-Error values", () => {
    expect(readNameConflictFromError("oops")).toBeNull();
  });

  it("returns null when message doesn't match the 409 pattern", () => {
    expect(readNameConflictFromError(new Error("Request failed: 500 - oops"))).toBeNull();
  });

  it("parses JSON detail and returns it on a 409 name collision", () => {
    const err = new Error(
      `Request failed: 409 - ${JSON.stringify({ detail: "Agent name already exists" })}`,
    );
    expect(readNameConflictFromError(err)).toBe("Agent name already exists");
  });

  it("returns null when parsed JSON detail doesn't match name-collision text", () => {
    const err = new Error(
      `Request failed: 409 - ${JSON.stringify({ detail: "conflict" })}`,
    );
    expect(readNameConflictFromError(err)).toBeNull();
  });

  it("falls back to the raw body when it isn't JSON but matches text", () => {
    const err = new Error("Request failed: 409 - Agent name already exists (raw)");
    expect(readNameConflictFromError(err)).toBe("Agent name already exists (raw)");
  });

  it("returns null when raw non-JSON body doesn't match", () => {
    const err = new Error("Request failed: 409 - plain text body");
    expect(readNameConflictFromError(err)).toBeNull();
  });

  it("returns null when parsed JSON detail isn't a string", () => {
    const err = new Error(
      `Request failed: 409 - ${JSON.stringify({ detail: { x: 1 } })}`,
    );
    expect(readNameConflictFromError(err)).toBeNull();
  });
});

describe("parseBackendErrorResponse", () => {
  beforeEach(() => {
    (reportError as jest.Mock).mockClear();
  });

  it("returns the detail string for a plain application error", async () => {
    const res = mockResponse(400, { detail: "Dataset not found" });
    expect(await parseBackendErrorResponse(res)).toBe("Dataset not found");
  });

  it("joins FastAPI validation messages for 422 array details", async () => {
    const res = mockResponse(422, {
      detail: [{ msg: "field required", loc: ["body", "name"] }, { msg: "too long" }],
    });
    expect(await parseBackendErrorResponse(res)).toBe("field required — too long");
  });

  it("skips array entries without a msg field", async () => {
    const res = mockResponse(422, {
      detail: [{ loc: ["body"] }, { msg: "ok" }],
    });
    expect(await parseBackendErrorResponse(res)).toBe("ok");
  });

  it("skips array entries whose msg isn't a string", async () => {
    const res = mockResponse(422, {
      detail: [{ msg: 5 }, { msg: "ok" }],
    });
    expect(await parseBackendErrorResponse(res)).toBe("ok");
  });

  it("falls back to Request failed(N) when detail array yields no messages", async () => {
    const res = mockResponse(422, { detail: [{ loc: ["body"] }] });
    expect(await parseBackendErrorResponse(res)).toBe("Request failed (422)");
  });

  it("falls back to body.message when detail is absent", async () => {
    const res = mockResponse(400, { message: "custom message" });
    expect(await parseBackendErrorResponse(res)).toBe("custom message");
  });

  it("falls back to generic Request failed(N) when nothing usable is present", async () => {
    const res = mockResponse(404, {});
    expect(await parseBackendErrorResponse(res)).toBe("Request failed (404)");
  });

  it("treats a blank detail string as absent", async () => {
    const res = mockResponse(400, { detail: "   " });
    expect(await parseBackendErrorResponse(res)).toBe("Request failed (400)");
  });

  it("handles a non-JSON body by falling through to status message", async () => {
    const res = mockResponse(404, undefined, true);
    expect(await parseBackendErrorResponse(res)).toBe("Request failed (404)");
  });

  it("returns the generic message for 5xx and logs when logPrefix + detail given", async () => {
    const res = mockResponse(500, { detail: "db connection lost" });
    const msg = await parseBackendErrorResponse(res, "retryEvaluation(stt)");
    expect(msg).toBe("Something went wrong on our end. Please try again in a moment.");
    expect(reportError).toHaveBeenCalledWith(
      "retryEvaluation(stt): server error",
      500,
      "db connection lost",
    );
  });

  it("returns the generic message for 5xx without logging when no logPrefix", async () => {
    const res = mockResponse(503, { detail: "unavailable" });
    const msg = await parseBackendErrorResponse(res);
    expect(msg).toBe("Something went wrong on our end. Please try again in a moment.");
    expect(reportError).not.toHaveBeenCalled();
  });

  it("returns the generic message for 5xx without logging when body has no detail", async () => {
    const res = mockResponse(500, {});
    const msg = await parseBackendErrorResponse(res, "prefix");
    expect(msg).toBe("Something went wrong on our end. Please try again in a moment.");
    expect(reportError).not.toHaveBeenCalled();
  });
});

describe("parseBackendErrorMessage", () => {
  beforeEach(() => {
    (reportError as jest.Mock).mockClear();
  });

  it("returns fallback for non-Error values", () => {
    expect(parseBackendErrorMessage("oops", "fallback")).toBe("fallback");
  });

  it("returns err.message when it doesn't match the pattern", () => {
    expect(parseBackendErrorMessage(new Error("network down"), "fallback")).toBe(
      "network down",
    );
  });

  it("returns fallback when message is empty and doesn't match pattern", () => {
    expect(parseBackendErrorMessage(new Error(""), "fallback")).toBe("fallback");
  });

  it("returns the generic 5xx message and reports it", () => {
    const err = new Error("Request failed: 500 - internal error text");
    const msg = parseBackendErrorMessage(err, "fallback");
    expect(msg).toBe("Something went wrong on our end. Please try again in a moment.");
    expect(reportError).toHaveBeenCalledWith(
      "Server error from apiClient:",
      500,
      "internal error text",
    );
  });

  it("returns rawBody when the body isn't JSON", () => {
    const err = new Error("Request failed: 404 - plain text not json");
    expect(parseBackendErrorMessage(err, "fallback")).toBe("plain text not json");
  });

  it("returns the parsed detail when present", () => {
    const err = new Error(
      `Request failed: 400 - ${JSON.stringify({ detail: "Bad input" })}`,
    );
    expect(parseBackendErrorMessage(err, "fallback")).toBe("Bad input");
  });

  it("falls back to rawBody when parsed JSON has no usable detail", () => {
    const rawBody = JSON.stringify({ foo: "bar" });
    const err = new Error(`Request failed: 400 - ${rawBody}`);
    expect(parseBackendErrorMessage(err, "fallback")).toBe(rawBody);
  });
});

describe("getErrorStatusCode", () => {
  it("returns null for non-Error values", () => {
    expect(getErrorStatusCode("oops")).toBeNull();
  });

  it("returns null when the message doesn't carry a status", () => {
    expect(getErrorStatusCode(new Error("network down"))).toBeNull();
  });

  it("extracts the numeric status code", () => {
    expect(getErrorStatusCode(new Error("Request failed: 404 - not found"))).toBe(404);
  });
});
