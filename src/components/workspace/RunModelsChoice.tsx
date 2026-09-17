"use client";

const OPTIONS = [
  { value: "parallel", label: "Parallel" },
  { value: "sequential", label: "Sequential" },
] as const;

/**
 * The two choices for how a comparison runs its models: all at the same time
 * (Parallel) or one after another (Sequential).
 *
 * Shared by the model picker inside a comparison and the workspace settings
 * page, so it carries nothing but the two rows. The heading, the description
 * and any box around them belong to the page using it.
 */
export function RunModelsChoice({
  value,
  onChange,
  disabled = false,
  name = "run-models",
}: {
  /** true = the models run at the same time. */
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Radio group name, so two of these on one page cannot clash. */
  name?: string;
}) {
  return (
    <div>
      {OPTIONS.map((option) => (
        <label
          key={option.value}
          className={`flex items-center gap-3 py-1 select-none ${
            disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
          }`}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === (option.value === "parallel")}
            onChange={() => onChange(option.value === "parallel")}
            disabled={disabled}
            className="w-4 h-4 cursor-pointer accent-foreground disabled:cursor-not-allowed"
          />
          <span className="text-sm">{option.label}</span>
        </label>
      ))}
    </div>
  );
}
