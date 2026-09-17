"use client";

/**
 * An on/off switch, for a setting that takes effect as soon as it is flipped
 * rather than waiting for a Save button.
 *
 * It is a real switch to a screen reader, so `label` is what gets read out.
 * Use it where the two states are plainly on and off; a choice between two
 * named things is a pair of radio buttons, not this.
 */
export function Switch({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** What a screen reader calls this switch. */
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 w-11 h-6 rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? "bg-foreground" : "bg-muted"
      }`}
    >
      {/* `left-0.5` is not decoration. Without it the knob is placed wherever
          the button happens to lay out an absolutely positioned child, and the
          slide is measured from there: on a 44px track the "on" knob ended up
          at 42px, almost entirely outside the pill, so the switch read as a
          plain black lozenge with no knob at all. */}
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-background transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
