import { Tooltip } from "@/components/Tooltip";
import {
  formatKappa,
  kappaLabel,
  type KappaFields,
} from "@/lib/agreementKappa";

/** A table cell: the kappa, with its kind on hover, or a dash when there is none. */
export function KappaCell({
  fields,
  oneAgainstOthers = false,
}: {
  fields: KappaFields | null | undefined;
  oneAgainstOthers?: boolean;
}) {
  if (fields?.kappa == null) return <span>—</span>;
  return (
    <div className="flex items-center gap-1.5">
      {formatKappa(fields.kappa)}
      <Tooltip content={kappaLabel(fields.kappa_type, oneAgainstOthers)}>
        <button
          type="button"
          className="p-1 rounded-md hover:bg-muted transition-colors cursor-pointer"
          aria-label="Kind of kappa"
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
    </div>
  );
}
