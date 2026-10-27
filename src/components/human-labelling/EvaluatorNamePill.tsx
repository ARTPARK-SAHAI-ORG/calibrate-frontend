"use client";

import { Tooltip } from "@/components/Tooltip";
import { useIsNameClipped } from "@/hooks/useIsNameClipped";

/** The small bordered pill every agreement screen uses for a name or a short
 * reason. Callers add what their spot needs (truncating, wrapping). */
export const PILL =
  "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground";

export const PILL_LINK =
  "hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer";

/**
 * One evaluator's name, as a pill that opens how that evaluator judges, or
 * plain text where there is nothing to open. The name is cut to fit the row,
 * and the whole of it is on hover only when it is actually cut off.
 */
export function EvaluatorNamePill({
  name,
  onOpen,
  fitClassName,
}: {
  name: string;
  /** Without it the pill is plain text, as on a shared page. */
  onOpen?: () => void;
  /** Sizing for the row this pill sits in, on whatever wraps the pill. */
  fitClassName: string;
}) {
  const { ref, clipped } = useIsNameClipped(name);
  const text = (
    <span ref={ref} className="truncate">
      {name}
    </span>
  );
  const pill = onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      className={`${PILL} truncate max-w-full ${PILL_LINK}`}
    >
      {text}
    </button>
  ) : (
    <span className={`${PILL} truncate max-w-full cursor-default`}>{text}</span>
  );
  return clipped ? (
    <Tooltip content={name} className={fitClassName}>
      {pill}
    </Tooltip>
  ) : (
    <div className={`relative ${fitClassName}`}>{pill}</div>
  );
}
