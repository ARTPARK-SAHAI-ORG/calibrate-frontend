import React from "react";
import { LabellingRowCheckbox } from "@/components/test-results/shared";

// Shared "Submit for labelling" checkbox column used by the STT and TTS
// results tables. Both tables need the identical machinery — an opt-in leading
// column with a per-row select button and a header select-all — differing only
// in the row type, the default eligibility rule, and the disabled tooltip.
// Keeping it in one place stops the two tables drifting apart.

/** Fixed pixel width of the checkbox column; added to each table's min width. */
export const LABELLING_CHECKBOX_COL_WIDTH = 44;

// The opt-in labelling-selection props a results table accepts. When
// `onToggleLabellingSelection` + `labellingKeyForRow` are both provided the
// column renders; otherwise it's absent (public / read-only tables pass none).
// Callers own the selection set and the row→key mapping (rows are keyed per
// provider, e.g. `openai:0`).
export type LabellingColumnProps<Row> = {
  labellingSelection?: Set<string>;
  onToggleLabellingSelection?: (key: string) => void;
  onLabellingBulkToggle?: (keys: string[]) => void;
  labellingKeyForRow?: (row: Row, index: number) => string;
  /** Rows for which selection is disabled. Defaults to `defaultEligible`. */
  labellingRowEligible?: (row: Row, index: number) => boolean;
};

export type LabellingColumnState<Row> = {
  /** True when the column should render at all. */
  showCheckboxes: boolean;
  /** Whether a given row can be selected. */
  rowEligible: (row: Row, index: number) => boolean;
  /** Keys of every currently-selectable row, in row order. */
  allSelectableKeys: string[];
  /** True when every selectable row is currently selected. */
  allSelected: boolean;
};

/**
 * Derive the labelling column's state from a table's rows and props.
 * `defaultEligible` is the table-specific fallback rule (e.g. STT: has ground
 * truth; TTS: has synthesized audio) used when the caller passes no
 * `labellingRowEligible`.
 */
export function useLabellingColumn<Row>(
  results: Row[],
  props: LabellingColumnProps<Row>,
  defaultEligible: (row: Row, index: number) => boolean,
): LabellingColumnState<Row> {
  const {
    labellingSelection,
    onToggleLabellingSelection,
    labellingKeyForRow,
    labellingRowEligible,
  } = props;

  const showCheckboxes = !!onToggleLabellingSelection && !!labellingKeyForRow;
  const rowEligible = (r: Row, i: number) =>
    labellingRowEligible ? labellingRowEligible(r, i) : defaultEligible(r, i);
  // Keys computed against the original row index so they line up with the
  // per-row rendering.
  const allSelectableKeys = showCheckboxes
    ? results.reduce<string[]>((acc, r, i) => {
        if (rowEligible(r, i)) acc.push(labellingKeyForRow!(r, i));
        return acc;
      }, [])
    : [];
  const allSelected =
    allSelectableKeys.length > 0 &&
    allSelectableKeys.every((k) => labellingSelection?.has(k));

  return { showCheckboxes, rowEligible, allSelectableKeys, allSelected };
}

/** The `<th>` select-all checkbox for the leading labelling column. */
export function LabellingHeaderCheckbox({
  allSelectableKeys,
  allSelected,
  onBulkToggle,
}: {
  allSelectableKeys: string[];
  allSelected: boolean;
  onBulkToggle?: (keys: string[]) => void;
}) {
  return (
    <th style={{ width: LABELLING_CHECKBOX_COL_WIDTH }} className="px-3 py-3 text-left">
      <button
        type="button"
        onClick={() => onBulkToggle?.(allSelectableKeys)}
        disabled={allSelectableKeys.length === 0}
        title={allSelected ? "Deselect all" : "Select all"}
        aria-label={allSelected ? "Deselect all" : "Select all"}
        className="cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <LabellingRowCheckbox
          checked={allSelected}
          disabled={allSelectableKeys.length === 0}
        />
      </button>
    </th>
  );
}

/**
 * The `<td>` per-row select button. Disabled (ineligible) rows show a greyed,
 * unchecked box; `disabledTitle` is the table-specific hover explanation.
 */
export function LabellingSelectCell({
  eligible,
  checked,
  onToggle,
  disabledTitle,
}: {
  eligible: boolean;
  checked: boolean;
  onToggle: () => void;
  /** Tooltip shown on the disabled (ineligible) box, e.g. why the row can't be labelled. */
  disabledTitle: string;
}) {
  return (
    <td className="px-3 py-3">
      <button
        type="button"
        onClick={() => eligible && onToggle()}
        disabled={!eligible}
        title={eligible ? "Select for labelling" : disabledTitle}
        aria-label="Select for labelling"
        className="cursor-pointer disabled:cursor-not-allowed"
      >
        <LabellingRowCheckbox checked={checked && eligible} disabled={!eligible} />
      </button>
    </td>
  );
}
