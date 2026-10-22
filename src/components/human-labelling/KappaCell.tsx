import { Tooltip } from "@/components/Tooltip";
import {
  formatKappa,
  kappaBlank,
  kappaLabel,
  type KappaFields,
} from "@/lib/agreementKappa";

export const agreementStatPillBase =
  "inline-flex items-center max-w-full min-w-0 px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground";

export function KappaInfoIcon({
  content,
  label,
}: {
  content: string;
  label: string;
}) {
  return (
    <Tooltip content={content}>
      <button
        type="button"
        className="p-1 rounded-md hover:bg-muted transition-colors cursor-pointer"
        aria-label={label}
      >
        <svg
          className="w-4 h-4 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>
    </Tooltip>
  );
}

/** Why there is no kappa, as a pill that explains itself on hover. */
function KappaReasonPill({ blank }: { blank: { text: string; help: string } }) {
  return (
    <Tooltip content={blank.help} className="inline-block align-middle">
      <span className={`${agreementStatPillBase} cursor-default`}>
        {blank.text}
      </span>
    </Tooltip>
  );
}

/** The kappa to two places, the pill saying why there is none, or a muted dash. */
export function KappaValue({
  fields,
}: {
  fields: KappaFields | null | undefined;
}) {
  if (fields?.kappa != null) return <>{formatKappa(fields.kappa)}</>;
  const blank = kappaBlank(fields);
  if (blank) return <KappaReasonPill blank={blank} />;
  return <span className="text-muted-foreground">—</span>;
}

/** A table cell: the kappa with its kind on hover, the pill saying why there
 * is none, or a dash. */
export function KappaCell({
  fields,
  oneAgainstOthers = false,
}: {
  fields: KappaFields | null | undefined;
  oneAgainstOthers?: boolean;
}) {
  if (fields?.kappa != null) {
    return (
      <div className="flex items-center gap-1.5">
        {formatKappa(fields.kappa)}
        <KappaInfoIcon
          content={kappaLabel(fields.kappa_type, oneAgainstOthers)}
          label="Kind of kappa"
        />
      </div>
    );
  }
  const blank = kappaBlank(fields);
  if (blank) return <KappaReasonPill blank={blank} />;
  return <span>—</span>;
}
