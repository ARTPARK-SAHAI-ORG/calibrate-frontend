import type JSZip from "jszip";
import { signOut } from "next-auth/react";
import { reportError } from "@/lib/reportError";

/**
 * Shared audio + ZIP helpers for the STT/TTS "upload a ZIP of audio clips +
 * a data.csv" flows (STT dataset editor and TTS labelling bulk upload). Keeps
 * the WAV encoding, duration probing, ZIP/CSV navigation, and S3 upload in one
 * place so the two flows can't drift.
 */

/**
 * Upload one audio file to S3 via a backend-issued presigned URL for the given
 * task type ("stt" | "tts"). Returns the stored s3 path, or null on failure
 * (reported to Sentry). Signs the caller out on a 401.
 */
export async function uploadAudioToS3(
  file: File,
  accessToken: string | null,
  taskType: "stt" | "tts",
): Promise<string | null> {
  try {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) return null;
    const response = await fetch(`${backendUrl}/presigned-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        task_type: taskType,
        content_type: file.type || "audio/wav",
        extension: "wav",
      }),
    });
    if (response.status === 401) {
      await signOut({ callbackUrl: "/login" });
      return null;
    }
    if (!response.ok) throw new Error("Failed to get presigned URL");
    const data = await response.json();
    const { presigned_url: presignedUrl, s3_path: s3Path } = data;
    if (!presignedUrl || !s3Path) throw new Error("Missing URL/path");
    const put = await fetch(presignedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "audio/wav" },
      body: file,
    });
    if (!put.ok) throw new Error("S3 upload failed");
    return s3Path as string;
  } catch (err) {
    reportError(`Failed to upload ${taskType} audio to S3`, err);
    return null;
  }
}

/** Read a media file's duration (seconds) via a throwaway <audio> element. */
export const getAudioDuration = (file: File): Promise<number> =>
  new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(file);
    audio.src = url;
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(audio.duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load audio"));
    };
  });

/**
 * Encode 16-bit mono PCM WAV bytes. `sampleAt(i)` returns each sample in the
 * range [-1, 1]. Produces a standard 44-byte header so browsers report a valid
 * duration.
 */
function encodeWav(
  numSamples: number,
  sampleRate: number,
  sampleAt: (i: number) => number,
): Uint8Array {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataBytes = numSamples * numChannels * bytesPerSample;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  let o = 0;
  view.setUint32(o, 0x52494646, false); // "RIFF"
  o += 4;
  view.setUint32(o, 44 + dataBytes - 8, true);
  o += 4;
  view.setUint32(o, 0x57415645, false); // "WAVE"
  o += 4;
  view.setUint32(o, 0x666d7420, false); // "fmt "
  o += 4;
  view.setUint32(o, 16, true);
  o += 4;
  view.setUint16(o, 1, true); // PCM
  o += 2;
  view.setUint16(o, numChannels, true);
  o += 2;
  view.setUint32(o, sampleRate, true);
  o += 4;
  view.setUint32(o, byteRate, true);
  o += 4;
  view.setUint16(o, blockAlign, true);
  o += 2;
  view.setUint16(o, bitsPerSample, true);
  o += 2;
  view.setUint32(o, 0x64617461, false); // "data"
  o += 4;
  view.setUint32(o, dataBytes, true);
  o += 4;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, sampleAt(i)));
    view.setInt16(o, Math.round(clamped * 0x7fff), true);
    o += 2;
  }
  return new Uint8Array(buffer);
}

/** ~`seconds`s of real PCM silence (carries valid duration metadata). */
export const createSilentWav = (seconds = 0.1, sampleRate = 44_100): Uint8Array =>
  encodeWav(Math.round(seconds * sampleRate), sampleRate, () => 0);

/** ~`seconds`s of an audible sine tone with short in/out fades. */
export const createToneWav = (
  seconds = 1,
  freq = 440,
  sampleRate = 44_100,
): Uint8Array =>
  encodeWav(Math.round(seconds * sampleRate), sampleRate, (i) => {
    const t = i / sampleRate;
    const fade = Math.min(1, t / 0.02, (seconds - t) / 0.02); // 20ms fades
    return 0.25 * fade * Math.sin(2 * Math.PI * freq * t);
  });

/** Locate `data.csv` at the ZIP root or inside a single top-level folder. */
export function findDataCsvInZip(
  zip: JSZip,
): { file: JSZip.JSZipObject; basePath: string } | null {
  const root = zip.file("data.csv");
  if (root) return { file: root, basePath: "" };
  const folders = Object.keys(zip.files).filter(
    (p) =>
      p.endsWith("/") &&
      p.split("/").length === 2 &&
      !p.includes("__MACOSX") &&
      !p.startsWith("._"),
  );
  for (const folder of folders) {
    const candidate = zip.file(`${folder}data.csv`);
    if (candidate) return { file: candidate, basePath: folder };
  }
  return null;
}

/** Strip a leading BOM and split CSV text into non-empty lines. */
export function splitCsvLines(csv: string): string[] {
  const c = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
  return c.split(/\r\n|\n|\r/).filter((l) => l.trim());
}

/** Parse one CSV line, honouring simple double-quote escaping. */
export function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else current += char;
  }
  values.push(current.trim());
  return values;
}

/** Find an audio entry by filename, checking the `audios/` folder then base. */
export function findZipAudioFile(
  zip: JSZip,
  basePath: string,
  filename: string,
): JSZip.JSZipObject | null {
  return (
    zip.file(`${basePath}audios/${filename}`) ||
    zip.file(`${basePath}${filename}`)
  );
}
