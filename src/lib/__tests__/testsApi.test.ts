import { bulkDeleteTests } from "../testsApi";

const BACKEND = "https://backend.test";

function mockResponse(
  init: { ok?: boolean; status?: number; jsonBody?: unknown } = {},
): Response {
  const { ok = true, status = 200, jsonBody } = init;
  return {
    ok,
    status,
    json: async () => jsonBody,
  } as unknown as Response;
}

describe("bulkDeleteTests", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("POSTs all uuids to /tests/bulk-delete in a single request", async () => {
    const fetchMock = global.fetch as jest.Mock;
    fetchMock.mockResolvedValue(mockResponse({ jsonBody: { deleted_count: 2 } }));

    const result = await bulkDeleteTests(BACKEND, "tok", ["a", "b"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BACKEND}/tests/bulk-delete`);
    expect(opts?.method).toBe("POST");
    expect(JSON.parse(opts?.body as string)).toEqual({
      test_uuids: ["a", "b"],
    });
    expect(result).toEqual({ unauthorized: false, deletedCount: 2 });
  });

  it("reports a partial delete when deleted_count is less than requested", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse({ jsonBody: { deleted_count: 1 } }));

    const result = await bulkDeleteTests(BACKEND, "tok", ["a", "b"]);

    expect(result.deletedCount).toBe(1);
  });

  it("defaults deletedCount to 0 when the body omits deleted_count", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse({ jsonBody: {} }));

    const result = await bulkDeleteTests(BACKEND, "tok", ["a"]);

    expect(result).toEqual({ unauthorized: false, deletedCount: 0 });
  });

  it("flags unauthorized on a 401 without throwing", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse({ ok: false, status: 401 }));

    const result = await bulkDeleteTests(BACKEND, null, ["a"]);

    expect(result).toEqual({ unauthorized: true, deletedCount: 0 });
  });

  it("throws on a non-401 error response", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockResponse({ ok: false, status: 500 }));

    await expect(bulkDeleteTests(BACKEND, "tok", ["a"])).rejects.toThrow(
      "Failed to delete test(s)",
    );
  });
});
