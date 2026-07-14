import JSZip from "jszip";
import {
  createSilentWav,
  createToneWav,
  findDataCsvInZip,
  findZipAudioFile,
  parseCsvLine,
  splitCsvLines,
} from "../audioZip";

describe("parseCsvLine", () => {
  it("splits on commas and trims", () => {
    expect(parseCsvLine("a, b ,c")).toEqual(["a", "b", "c"]);
  });
  it("honours double-quoted commas", () => {
    expect(parseCsvLine('name,"hello, world",x.wav')).toEqual([
      "name",
      "hello, world",
      "x.wav",
    ]);
  });
});

describe("splitCsvLines", () => {
  it("strips a BOM and drops blank lines", () => {
    expect(splitCsvLines("﻿a,b\n\n c,d \n")).toEqual(["a,b", " c,d "]);
  });
});

describe("createSilentWav / createToneWav", () => {
  const riff = (bytes: Uint8Array) =>
    String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);

  it("emit valid RIFF/WAVE headers", () => {
    const silent = createSilentWav(0.05);
    const tone = createToneWav(0.05, 440);
    expect(riff(silent)).toBe("RIFF");
    expect(riff(tone)).toBe("RIFF");
    // 44-byte header + 16-bit mono samples at 44.1kHz for 0.05s.
    const expected = 44 + Math.round(0.05 * 44_100) * 2;
    expect(silent.length).toBe(expected);
    expect(tone.length).toBe(expected);
  });

  it("silence is all-zero samples while the tone is not", () => {
    const silent = createSilentWav(0.05);
    const tone = createToneWav(0.05, 440);
    const nonZero = (b: Uint8Array) => b.slice(44).some((v) => v !== 0);
    expect(nonZero(silent)).toBe(false);
    expect(nonZero(tone)).toBe(true);
  });
});

describe("findDataCsvInZip", () => {
  it("finds data.csv at the root", async () => {
    const zip = new JSZip();
    zip.file("data.csv", "x");
    expect(findDataCsvInZip(zip)?.basePath).toBe("");
  });
  it("finds data.csv nested in a single folder", async () => {
    const zip = new JSZip();
    zip.file("batch/data.csv", "x");
    expect(findDataCsvInZip(zip)?.basePath).toBe("batch/");
  });
  it("returns null when absent", async () => {
    const zip = new JSZip();
    zip.file("readme.txt", "x");
    expect(findDataCsvInZip(zip)).toBeNull();
  });
});

describe("findZipAudioFile", () => {
  it("prefers the audios/ folder, then the base path", async () => {
    const zip = new JSZip();
    zip.file("batch/audios/a.wav", "x");
    zip.file("batch/b.wav", "x");
    expect(findZipAudioFile(zip, "batch/", "a.wav")).not.toBeNull();
    expect(findZipAudioFile(zip, "batch/", "b.wav")).not.toBeNull();
    expect(findZipAudioFile(zip, "batch/", "missing.wav")).toBeNull();
  });
});
