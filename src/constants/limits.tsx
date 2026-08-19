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

  // Fallback when the workspace trace-limit API is unreachable

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

/**
 * The one check every bulk run funnels through.
 *
 * `count` is the amount of work the run creates. Where one row is repeated,
 * the caller multiplies it out first: tests times models in a model
 * comparison, items times evaluators in a labelling run. Shows the limit toast
 * and returns true when the run is too big to start.
 */
export function exceedsEvalLimit(
  count: number,
  max: number,
  noun: string,
): boolean {
  if (count <= max) return false;
  showLimitToast(
    `You can only run up to ${max} ${noun} at a time. This run needs ${count}.`,
  );
  return true;
}
