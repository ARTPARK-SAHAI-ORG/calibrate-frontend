import { Tooltip } from "@/components/Tooltip";
import {
  formatKappa,
  kappaBlank,
  kappaLabel,
  type KappaFields,
} from "@/lib/agreementKappa";

function InfoIcon({ content, label }: { content: string; label: string }) {
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

/** A table cell: the kappa with its kind on hover, why there is none, or a dash. */
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
        <InfoIcon
          content={kappaLabel(fields.kappa_type, oneAgainstOthers)}
          label="Kind of kappa"
        />
      </div>
    );
  }
  const blank = kappaBlank(fields);
  if (!blank) return <span>—</span>;
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{blank.text}</span>
      <InfoIcon content={blank.help} label="Why there is no kappa" />
    </div>
  );
}
