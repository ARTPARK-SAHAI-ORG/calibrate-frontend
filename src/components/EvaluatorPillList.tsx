"use client";

import { useEffect, useState } from "react";
import { Tooltip } from "@/components/Tooltip";
import { EvaluatorPreviewModal } from "@/components/evaluators/EvaluatorPreviewModal";

export type EvaluatorPillItem = {
  /**
   * The evaluator this pill stands for, when the list it came from carries
   * one. Without it the pill is plain text: there is nothing to preview.
   */
  uuid?: string | null;
  name: string;
};

const EVALUATOR_PILL_CLASSES =
  "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground max-w-full";

/**
 * True while the column is narrow enough to cut the name off. A pill whose
 * name is fully readable must not put the same name in a hover popup: it
 * covers the row and tells the reader nothing.
 */
function useIsNameClipped(name: string) {
  const [el, setEl] = useState<HTMLSpanElement | null>(null);
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    if (!el) return;
    const measure = () => setClipped(el.scrollWidth > el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, name]);
  // The wrapper around the pill changes when the name turns out to be cut
  // off, which mounts a new span. Keeping the span in state rather than a ref
  // re-runs the effect on that new one, so widening the column later still
  // clears the hover text.
  return { ref: setEl, clipped };
}

/**
 * One pill. `onOpen` makes it a button that opens how the evaluator judges;
 * without it the pill is plain text. In a table row the name is cut to fit the
 * column and the whole of it is on hover. `wrap` is for the "+N" popup, which
 * has room to run a long name onto a second line: hover text there would be
 * drawn outside the popup, and moving onto it would close the popup.
 */
function NamePill({
  name,
  onOpen,
  wrap = false,
}: {
  name: string;
  onOpen?: (e: React.MouseEvent) => void;
  wrap?: boolean;
}) {
  const { ref, clipped } = useIsNameClipped(name);
  const label = wrap ? (
    <span className="break-words">{name}</span>
  ) : (
    <span ref={ref} className="truncate">
      {name}
    </span>
  );
  const pillClasses = `${EVALUATOR_PILL_CLASSES} ${
    wrap ? "" : "w-full truncate"
  }`;
  const pill = onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      className={`${pillClasses} hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer`}
    >
      {label}
    </button>
  ) : (
    <span className={pillClasses}>{label}</span>
  );
  if (wrap) return pill;
  return clipped ? (
    <Tooltip content={name} className="min-w-0 shrink">
      {pill}
    </Tooltip>
  ) : (
    <div className="relative min-w-0 shrink">{pill}</div>
  );
}

/**
 * Fixed-width evaluators cell: shows up to 2 pills (each opens how that
 * evaluator judges in a preview), and folds the rest into a "+N" chip whose
 * tooltip lists the remaining evaluators as the same pills on hover. One
 * instance renders per table row, so the preview modal is owned here rather
 * than lifted to the row's parent — only one can be open per row anyway, and
 * it mounts/unmounts with the row.
 */
export function EvaluatorPillList({
  evaluators,
}: {
  evaluators: EvaluatorPillItem[];
}) {
  const [previewEvaluator, setPreviewEvaluator] = useState<{
    uuid: string;
    name: string;
  } | null>(null);

  if (evaluators.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  const visible =
    evaluators.length <= 2 ? evaluators : evaluators.slice(0, 1);
  const rest = evaluators.length <= 2 ? [] : evaluators.slice(1);
  return (
    <div className="flex items-center gap-1 min-w-0">
      {visible.map((ev, index) => (
        // Keyed by position: a list with no ids can hold the same name twice,
        // and two pills with the same key confuse React.
        <NamePill
          key={ev.uuid ?? `${index}-${ev.name}`}
          name={ev.name}
          onOpen={
            ev.uuid
              ? (e) => {
                  e.stopPropagation();
                  setPreviewEvaluator({
                    uuid: ev.uuid as string,
                    name: ev.name,
                  });
                }
              : undefined
          }
        />
      ))}
      {rest.length > 0 && (
        <Tooltip
          content={
            // The pills in here open the same preview as the ones in the row.
            // The popup is drawn outside the table, but a click in it still
            // reaches the row underneath, so each pill stops its own click.
            <div className="flex flex-wrap gap-1 max-w-64">
              {rest.map((ev, index) => (
                <NamePill
                  key={ev.uuid ?? `${index}-${ev.name}`}
                  name={ev.name}
                  wrap
                  onOpen={
                    ev.uuid
                      ? (e) => {
                          e.stopPropagation();
                          setPreviewEvaluator({
                            uuid: ev.uuid as string,
                            name: ev.name,
                          });
                        }
                      : undefined
                  }
                />
              ))}
            </div>
          }
        >
          <span
            onClick={(e) => e.stopPropagation()}
            className={`${EVALUATOR_PILL_CLASSES} shrink-0 text-muted-foreground cursor-default`}
          >
            +{rest.length}
          </span>
        </Tooltip>
      )}
      <EvaluatorPreviewModal
        evaluatorUuid={previewEvaluator?.uuid ?? null}
        evaluatorName={previewEvaluator?.name}
        onClose={() => setPreviewEvaluator(null)}
      />
    </div>
  );
}

/**
 * The same fixed-width pills for plain names that are not evaluators, so a
 * table row stays one line high whatever it holds. Used for the models a run
 * tried.
 */
export function NamePillList({ names }: { names: string[] }) {
  return <EvaluatorPillList evaluators={names.map((name) => ({ name }))} />;
}
