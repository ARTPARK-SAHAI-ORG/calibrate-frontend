"use client";

import type { TaskEvaluatorOption } from "./itemEvaluators";

type ItemEvaluatorPickerProps = {
  /** Every evaluator currently linked to the task, in task display order. */
  evaluators: TaskEvaluatorOption[];
  /** The evaluators that apply to this item. */
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /**
   * False when the item follows the task's list. Unticking an evaluator is
   * what customises it, so the reset link only shows once it is true.
   */
  isCustomised: boolean;
  /** Puts the item back on the task's list. */
  onFollowTask: () => void;
  disabled?: boolean;
  /** How many items this one choice applies to, so the copy reads right. */
  itemCount?: number;
};

/**
 * Picks which evaluators apply to a single item.
 *
 * The backend rejects an empty list, so the last ticked evaluator cannot be
 * unticked. This mirrors the "a task must keep one evaluator" rule in
 * ManageEvaluatorsDialog.
 */
export default function ItemEvaluatorPicker({
  evaluators,
  selectedIds,
  onChange,
  isCustomised,
  onFollowTask,
  disabled = false,
  itemCount = 1,
}: ItemEvaluatorPickerProps) {
  if (evaluators.length === 0) return null;

  const many = itemCount > 1;
  const customisedText = many
    ? `These ${itemCount} items use their own evaluators. Adding an evaluator to the task later will not add it to these items.`
    : "This item uses its own evaluators. Adding an evaluator to the task later will not add it to this item.";
  const followingText = many
    ? `These ${itemCount} items use the task's evaluators and follow any change made to them.`
    : "This item uses the task's evaluators and follows any change made to them.";
  const lockedTitle = many
    ? "Each item must keep at least one evaluator"
    : "An item must keep at least one evaluator";

  const selected = new Set(selectedIds);
  const isLastSelected = (uuid: string) =>
    selected.size === 1 && selected.has(uuid);

  const toggle = (uuid: string) => {
    if (selected.has(uuid)) {
      if (isLastSelected(uuid)) return;
      onChange(selectedIds.filter((id) => id !== uuid));
      return;
    }
    // Keep the task's order rather than appending, so the list reads the same
    // everywhere.
    onChange(
      evaluators
        .filter((ev) => ev.uuid === uuid || selected.has(ev.uuid))
        .map((ev) => ev.uuid),
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="block text-base font-medium text-foreground">
          Evaluators
        </label>
        {isCustomised && (
          <button
            type="button"
            onClick={onFollowTask}
            disabled={disabled}
            className="text-xs text-muted-foreground hover:text-foreground underline cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            Use the task&apos;s evaluators
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {isCustomised ? customisedText : followingText}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {evaluators.map((ev) => {
          const checked = selected.has(ev.uuid);
          const lockedOn = checked && isLastSelected(ev.uuid);
          const boxDisabled = disabled || lockedOn;
          return (
            <label
              key={ev.uuid}
              title={lockedOn ? lockedTitle : undefined}
              className={`flex items-start gap-3 px-3 py-2 rounded-md border border-border transition-colors ${
                boxDisabled
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:bg-muted/30 cursor-pointer"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={boxDisabled}
                onChange={() => toggle(ev.uuid)}
                className="mt-0.5 w-4 h-4 accent-foreground cursor-pointer disabled:cursor-not-allowed"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{ev.name}</div>
                {ev.description && (
                  <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {ev.description}
                  </div>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
