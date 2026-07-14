import { signOut } from "next-auth/react";
import { getAudioDuration } from "@/components/evaluations/audioZip";
import { LIMITS } from "@/constants/limits";
import { reportError } from "@/lib/reportError";

/**
 * TTS-labelling audio upload helpers (single-add + bulk ZIP). Audio is never
 * sent through the backend — each clip is PUT straight to S3 via a short-lived
 * presigned URL, and the returned `s3_path` becomes the item's `audio_path`.
 * Shared audio/ZIP primitives live in `@/components/evaluations/audioZip`.
 */

// Re-exported so existing TTS-dialog imports keep a single entry point.
export { getAudioDuration };

/**
 * Validate an audio file against the size/duration caps. Returns a
 * human-readable error string when the file is rejected, or null when it's
 * acceptable. Duration probing is best-effort — a failed probe doesn't block.
 */
export async function validateTtsAudioFile(file: File): Promise<string | null> {
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > LIMITS.STT_MAX_AUDIO_FILE_SIZE_MB) {
    return `Audio must be under ${LIMITS.STT_MAX_AUDIO_FILE_SIZE_MB} MB (this file is ${sizeMB.toFixed(1)} MB).`;
  }
  try {
    const duration = await getAudioDuration(file);
    if (duration > LIMITS.STT_MAX_AUDIO_DURATION_SECONDS) {
      return `Audio must be under ${LIMITS.STT_MAX_AUDIO_DURATION_SECONDS}s (this file is ${Math.round(duration)}s).`;
    }
  } catch {
    // Best-effort duration probe; don't block on a failed read.
  }
  return null;
}

/**
 * Upload one audio file to S3 via a backend-issued presigned URL. Returns the
 * stored s3 path, or null on failure (which is reported to Sentry). Signs the
 * caller out on a 401.
 */
export async function uploadTtsAudioToS3(
  file: File,
  accessToken: string | null,
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
        task_type: "tts",
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
    reportError("Failed to upload TTS audio to S3", err);
    return null;
  }
}
