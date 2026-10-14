import { audioFileExtension } from "../audioExport";

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
