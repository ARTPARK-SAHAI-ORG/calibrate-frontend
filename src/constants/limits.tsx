import { toast } from "sonner";

// Usage limits for various features
// Contact the Calibrate team to extend these limits

export const LIMITS = {
  // STT audio file limits
  STT_MAX_AUDIO_DURATION_SECONDS: 60,
  STT_MAX_AUDIO_FILE_SIZE_MB: 5,

  // TTS text limits
  TTS_MAX_TEXT_LENGTH: 200,

  // Simulation limits
  SIMULATION_MAX_PERSONAS: 2,
  SIMULATION_MAX_SCENARIOS: 5,

  // Fallback when the per-user limit API is unreachable
  DEFAULT_MAX_ROWS_PER_EVAL: 20,

  // Max concurrent S3 uploads when bulk-uploading audio (ZIP import)
  STT_UPLOAD_CONCURRENCY: 8,
};

// Contact link for extending limits
// TODO: Replace with actual contact link
export const CONTACT_LINK = "https://forms.gle/3VmAyWdWaCKnTqTs8";

/**
 * Show a limit-exceeded error toast with an inline "Contact us" link.
 */
export function showLimitToast(message: string) {
  toast.error(
    <span>
      {message}{" "}
      <a href={CONTACT_LINK} target="_blank" rel="noopener noreferrer" className="font-bold">
        Click here
      </a>{" "}
      to contact us to extend your limits.
    </span>,
  );
}
