"use client";

// Single source of truth for the per-evaluator card surface used in:
//
//   - LLM / benchmark test results        (read mode)
//   - Public labelling annotation UI      (write mode for binary / rating)
//   - Admin "view submitted" labelling    (read mode)
//
// Two modes:
//
//   "read"  — the verdict is final. Show coloured surface, verdict pill
//             (Pass/Fail or score / max), optional variables block, and
//             reasoning behind a "See reasoning" toggle.
//
//   "write" — annotator picks a verdict and may add reasoning. Surface
//             stays neutral until they pick. Reasoning sits behind an
//             "Add reasoning" toggle to match the read-mode card visually.
//
// `ReasoningToggleButton` and `ReasoningExpandedContent` are exported so
// other callers (tool-call verdicts in test-results/shared.tsx) reuse the
// exact same toggle visual without duplicating it.

import Link from "next/link";
import { useState } from "react";

export type EvaluatorOutputType = "binary" | "rating";

type CommonProps = {
  /** Evaluator's display name. */
  name: string;
  /** Short evaluator description, shown under the name. */
  description?: string | null;
  /** Optional version label (e.g. "v3") shown as a small monospace pill
   * next to the name. Use this when annotators are evaluating against a
   * specific evaluator version so it stays visually distinct from the
   * evaluator's display name. */
  versionLabel?: string | null;
  /** "binary" → Correct/Wrong, "rating" → 1..scaleMax buttons. */
  outputType: EvaluatorOutputType;
  /** Evaluator uuid — used for linking the name to its detail page. */
  evaluatorUuid?: string;
  /** When true, the name links to /evaluators/<uuid>. Default false. */
  enableLink?: boolean;
  /** Variable substitutions used by the evaluator for this item. */
  variableValues?: Record<string, string> | null;
  /** Lower bound of a rating scale; only meaningful for rating evaluators. */
  scaleMin?: number;
  /** Upper bound of a rating scale; rating buttons render 1..scaleMax. */
  scaleMax?: number;
};

type ReadProps = CommonProps & {
  mode: "read";
  /** Binary verdict — true=pass, false=fail, null/undefined=no verdict. */
  match?: boolean | null;
  /** Rating verdict — number when scored, null/undefined for no verdict. */
  score?: number | null;
  /** Reasoning attached to the verdict, if any. */
  reasoning?: string | null;
};

type WriteProps = CommonProps & {
  mode: "write";
  /** Current value the annotator picked. Boolean for binary, number for rating. */
  value?: boolean | number;
  /** Current free-text reasoning the annotator entered. */
  comment?: string;
  /** Called when the annotator picks a new verdict. */
  onValueChange?: (v: boolean | number) => void;
  /** Called when the reasoning textarea changes. */
  onCommentChange?: (s: string) => void;
  /** Renders the controls but disables interaction (e.g. saving in flight). */
  disabled?: boolean;
};

export type EvaluatorVerdictCardProps = ReadProps | WriteProps;

export type Tone = "green" | "red" | "amber" | "neutral";

export function readVerdictTone(p: {
  match?: boolean | null;
  score?: number | null;
  scaleMin?: number;
  scaleMax?: number;
}): Tone {
  const isBinary = p.match !== null && p.match !== undefined;
  const isRating = p.score !== null && p.score !== undefined;
  if (isBinary) return p.match ? "green" : "red";
  if (isRating) {
    if (p.scaleMax !== undefined && p.score === p.scaleMax) return "green";
    if (p.scaleMin !== undefined && p.score === p.scaleMin) return "red";
    return "amber";
  }
  return "neutral";
}

export function evaluatorCardSurfaceClass(tone: Tone): string {
  const base = "rounded-lg border shadow-md dark:shadow-lg transition-colors";
  switch (tone) {
    case "green":
      return `${base} border-green-500/40 bg-green-500/[0.14] dark:border-green-500/45 dark:bg-green-500/[0.16] dark:shadow-green-950/35`;
    case "red":
      return `${base} border-red-500/40 bg-red-500/[0.12] dark:border-red-500/45 dark:bg-red-500/[0.14] dark:shadow-red-950/30`;
    case "amber":
      return `${base} border-amber-500/40 bg-amber-500/[0.12] dark:border-amber-500/45 dark:bg-amber-500/[0.13] dark:shadow-amber-950/30`;
    default:
      return `${base} border-border bg-muted/30 dark:bg-muted/40 dark:border-border dark:shadow-black/25`;
  }
}

export function EvaluatorVerdictCard(props: EvaluatorVerdictCardProps) {
  const tone: Tone = props.mode === "read" ? readVerdictTone(props) : "neutral";

  const hasVariables =
    !!props.variableValues &&
    typeof props.variableValues === "object" &&
    Object.keys(props.variableValues).length > 0;

  // Read mode collapses both variables and reasoning behind one toggle
  // (matches the LLM test output cards). Write mode shows everything
  // inline so annotators can see variables and write reasoning in one
  // pass — no toggle.
  const hasReasoning =
    props.mode === "read" && !!props.reasoning?.trim();
  const hasCollapsibleBody =
    props.mode === "read" && (hasVariables || hasReasoning);

  const [open, setOpen] = useState(false);

  const onSurfaceClick = (e: React.MouseEvent) => {
    if (props.mode !== "read" || !hasCollapsibleBody) return;
    const el = e.target as HTMLElement;
    if (el.closest("button") || el.closest("a[href]")) return;
    if (el.closest("[data-reasoning-body]")) return;
    if (el.closest("[data-evaluator-verdict-chips]")) return;
    setOpen((o) => !o);
  };

  const surface = evaluatorCardSurfaceClass(tone);
  const isReadCollapsibleClickable =
    props.mode === "read" && hasCollapsibleBody;

  return (
    <div
      onClick={isReadCollapsibleClickable ? onSurfaceClick : undefined}
      className={`${surface} p-3 space-y-3${
        isReadCollapsibleClickable ? " cursor-pointer" : ""
      }`}
    >
      {/* Header: name + verdict pill + toggle on one row; description
          on its own row below so it can use the full card width. */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            <NameLabel
              name={props.name}
              uuid={props.evaluatorUuid}
              enableLink={props.enableLink}
            />
            {props.versionLabel && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-md border border-foreground/20 bg-background text-foreground">
                {props.versionLabel}
              </span>
            )}
          </div>
          <div
            className="flex-shrink-0 flex items-center gap-1.5"
            data-evaluator-verdict-chips
          >
            {props.mode === "read" && (
              <ReadVerdictPill
                outputType={props.outputType}
                match={props.match}
                score={props.score}
                scaleMin={props.scaleMin}
                scaleMax={props.scaleMax}
              />
            )}
            {hasCollapsibleBody && (
              <ReasoningToggleButton
                open={open}
                onToggle={() => setOpen((o) => !o)}
              />
            )}
          </div>
        </div>
        {props.description && (
          <p className="text-xs text-muted-foreground whitespace-normal break-words">
            {props.description}
          </p>
        )}
      </div>

      {props.mode === "write" && (
        <>
          <WriteControls
            outputType={props.outputType}
            scaleMin={props.scaleMin}
            scaleMax={props.scaleMax}
            value={props.value}
            onChange={(v) => props.onValueChange?.(v)}
            disabled={props.disabled}
          />
          {hasVariables && (
            <VariableValuesBlock values={props.variableValues!} />
          )}
          <WriteReasoning
            value={props.comment ?? ""}
            onChange={(s) => props.onCommentChange?.(s)}
            disabled={props.disabled}
          />
        </>
      )}

      {props.mode === "read" && open && hasCollapsibleBody && (
        <div
          data-reasoning-body
          className="pt-2 border-t border-border/60 space-y-3"
        >
          {hasVariables && (
            <VariableValuesBlock values={props.variableValues!} />
          )}
          {props.reasoning?.trim() && (
            <ReasoningExpandedContent
              text={props.reasoning}
              showReasoningLabel
              mutedBody={false}
            />
          )}
        </div>
      )}
    </div>
  );
}

function NameLabel({
  name,
  uuid,
  enableLink,
}: {
  name: string;
  uuid?: string;
  enableLink?: boolean;
}) {
  const cls =
    "text-sm font-medium text-foreground break-words inline-block max-w-full align-top";
  if (enableLink && uuid) {
    return (
      <Link
        href={`/evaluators/${uuid}`}
        className={`${cls} hover:underline underline-offset-2 cursor-pointer`}
      >
        {name}
      </Link>
    );
  }
  return <span className={cls}>{name}</span>;
}

function ReadVerdictPill({
  outputType,
  match,
  score,
  scaleMin,
  scaleMax,
}: {
  outputType: EvaluatorOutputType;
  match?: boolean | null;
  score?: number | null;
  scaleMin?: number;
  scaleMax?: number;
}) {
  if (outputType === "binary") {
    if (match === null || match === undefined) return null;
    return (
      <span
        className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${
          match
            ? "bg-green-500/15 text-green-600 dark:text-green-400"
            : "bg-red-500/15 text-red-600 dark:text-red-400"
        }`}
      >
        {match ? (
          <CheckIcon className="w-3 h-3" />
        ) : (
          <XIcon className="w-3 h-3" />
        )}
        {match ? "Correct" : "Wrong"}
      </span>
    );
  }
  if (score === null || score === undefined) return null;
  const tone: Tone =
    scaleMax !== undefined && score === scaleMax
      ? "green"
      : scaleMin !== undefined && score === scaleMin
        ? "red"
        : "amber";
  const toneClass =
    tone === "green"
      ? "bg-green-500/15 text-green-600 dark:text-green-400"
      : tone === "red"
        ? "bg-red-500/15 text-red-600 dark:text-red-400"
        : "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  return (
    <span
      className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${toneClass}`}
    >
      {scaleMax !== undefined ? `${score} / ${scaleMax}` : `Score: ${score}`}
    </span>
  );
}

function WriteControls({
  outputType,
  scaleMin,
  scaleMax,
  value,
  onChange,
  disabled,
}: {
  outputType: EvaluatorOutputType;
  scaleMin?: number;
  scaleMax?: number;
  value?: boolean | number;
  onChange: (v: boolean | number) => void;
  disabled?: boolean;
}) {
  if (outputType === "binary") {
    const baseBtn =
      "h-9 px-4 rounded-md text-sm font-medium border transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed";
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(true)}
          className={`${baseBtn} ${
            value === true
              ? "border-green-200 bg-green-100 text-green-700 dark:border-green-500/30 dark:bg-green-500/20 dark:text-green-400"
              : "border-border bg-background hover:bg-muted/50"
          }`}
        >
          Correct
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(false)}
          className={`${baseBtn} ${
            value === false
              ? "border-red-200 bg-red-100 text-red-700 dark:border-red-500/30 dark:bg-red-500/20 dark:text-red-400"
              : "border-border bg-background hover:bg-muted/50"
          }`}
        >
          Wrong
        </button>
      </div>
    );
  }
  // Build the rating options as `scaleMin..scaleMax` so evaluators with a
  // non-1 minimum (e.g. 0..5) work correctly. Default to 1..5 when no
  // bounds are provided. Guard against an inverted range as a sanity
  // fallback.
  const min = typeof scaleMin === "number" ? scaleMin : 1;
  const rawMax = typeof scaleMax === "number" && scaleMax > 0 ? scaleMax : 5;
  const max = rawMax >= min ? rawMax : min;
  const options = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {options.map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            className={`w-9 h-9 rounded-md border text-sm font-medium transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background hover:bg-muted/50"
            }`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

function VariableValuesBlock({ values }: { values: Record<string, string> }) {
  const names = Object.keys(values);
  return (
    <div className="space-y-2">
      {names.map((name) => (
        <div key={name}>
          <span className="font-mono text-[10px] text-muted-foreground">
            {`{{${name}}}`}
          </span>
          <p className="text-xs text-foreground whitespace-pre-wrap break-words mt-0.5">
            {String(values[name])}
          </p>
        </div>
      ))}
    </div>
  );
}

function WriteReasoning({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (s: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">
        Reasoning {disabled ? "" : "(optional)"}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={disabled ? "" : "Add your reasoning"}
        rows={2}
        className="w-full text-sm rounded-md border border-border bg-background px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-foreground/20 disabled:opacity-60"
      />
    </div>
  );
}

/** Toggle button used to expand/collapse the variables + reasoning body
 * on every evaluator verdict surface. Same visual everywhere — read
 * mode test cards, write mode labelling cards, and the standalone
 * tool-call reasoning strip in test-results/shared.tsx. */
export function ReasoningToggleButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const label = open ? "Hide reasoning" : "See reasoning";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-expanded={open}
      className={`inline-flex items-center gap-1.5 max-w-[min(100%,14rem)] rounded-md border px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer shrink-0 ${
        open
          ? "border-fuchsia-500/50 bg-fuchsia-500/16 text-fuchsia-950 dark:border-fuchsia-500/45 dark:bg-fuchsia-500/18 dark:text-fuchsia-100 hover:bg-fuchsia-500/26 dark:hover:bg-fuchsia-500/28"
          : "border-cyan-500/50 bg-cyan-500/14 text-cyan-950 dark:border-cyan-500/45 dark:bg-cyan-500/16 dark:text-cyan-100 hover:bg-cyan-500/24 dark:hover:bg-cyan-500/22"
      }`}
    >
      <span className="truncate">{label}</span>
      <ChevronDownIcon
        className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${
          open ? "rotate-180" : ""
        }`}
      />
    </button>
  );
}

/** Read-only reasoning body — shared with the tool-call collapsible
 * strip in shared.tsx so all reasoning content uses the same typography. */
export function ReasoningExpandedContent({
  text,
  showReasoningLabel = false,
  mutedBody = true,
  italic = false,
}: {
  text: string;
  showReasoningLabel?: boolean;
  mutedBody?: boolean;
  italic?: boolean;
}) {
  return (
    <div className="space-y-1">
      {showReasoningLabel && (
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide block">
          Reasoning
        </span>
      )}
      <p
        className={`${
          mutedBody
            ? "text-xs text-muted-foreground whitespace-pre-wrap break-words"
            : "text-xs text-foreground whitespace-pre-wrap break-words"
        }${italic ? " italic" : ""}`}
      >
        {text}
      </p>
    </div>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={3}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

function XIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={3}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

function ChevronDownIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
      />
    </svg>
  );
}
