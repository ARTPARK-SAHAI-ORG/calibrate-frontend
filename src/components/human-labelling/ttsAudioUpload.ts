import {
  getAudioDuration,
  uploadAudioToS3,
} from "@/components/evaluations/audioZip";
import { LIMITS } from "@/constants/limits";

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
 * Upload one TTS-item audio file to S3 via a backend presigned URL. Returns
 * the stored s3 path, or null on failure. Thin wrapper over the shared
 * `uploadAudioToS3` with the "tts" task type.
 */
export const uploadTtsAudioToS3 = (
  file: File,
  accessToken: string | null,
): Promise<string | null> => uploadAudioToS3(file, accessToken, "tts");
