import { audioFileExtension, fetchRunForExport } from "../audioExport";

describe("audioFileExtension", () => {
  it("reads the extension and ignores a signed link's query string", () => {
    expect(
      audioFileExtension(
        "https://bucket.s3.amazonaws.com/a/b/clip.MP3?X-Amz-Signature=x.y",
      ),
    ).toBe("mp3");
  });

  it("falls back to wav when the link has no extension", () => {
    expect(audioFileExtension("https://host/audio/123?sig=a.b")).toBe("wav");
  });
});

describe("fetchRunForExport", () => {
  const OLD = process.env.NEXT_PUBLIC_BACKEND_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = "https://api.test";
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = OLD;
    // @ts-expect-error cleanup test-only global
    delete global.fetch;
  });

  it("reads the run with the token and returns it", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ task_id: "t" }) });
    await expect(fetchRunForExport("/stt/evaluate/t", "tok")).resolves.toEqual({
      task_id: "t",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.test/stt/evaluate/t",
      {
        headers: { accept: "application/json", Authorization: "Bearer tok" },
      },
    );
  });

  it("sends no token for a shared link, and fails on an error answer", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(fetchRunForExport("/public/stt/x")).rejects.toThrow(
      "HTTP 404 for /public/stt/x",
    );
    expect(global.fetch).toHaveBeenCalledWith("https://api.test/public/stt/x", {
      headers: { accept: "application/json" },
    });
  });
});
