import {
  formatKappa,
  kappaLabel,
  type KappaFields,
} from "@/lib/agreementKappa";

/** A table cell: the kappa, with its kind underneath, or a dash when there is none. */
export function KappaCell({
  fields,
  oneAgainstOthers = false,
}: {
  fields: KappaFields | null | undefined;
  oneAgainstOthers?: boolean;
}) {
  if (fields?.kappa == null) return <span>—</span>;
  return (
    <span>
      {formatKappa(fields.kappa)}
      <span className="block text-xs font-normal text-muted-foreground">
        {kappaLabel(fields.kappa_type, oneAgainstOthers)}
      </span>
    </span>
  );
}
