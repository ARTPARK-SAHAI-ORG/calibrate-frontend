import { Tooltip } from "@/components/Tooltip";
import { InfoIcon } from "@/components/icons";
import { PILL } from "@/components/human-labelling/EvaluatorNamePill";
import {
  formatKappa,
  kappaBlank,
  kappaLabel,
  type KappaFields,
} from "@/lib/agreementKappa";

/** An (i) whose hover shows `content`, which is also its name for a screen
 * reader. It often sits inside a link (a row that opens an annotator), so it
 * is not a nested button, and a click on it does not follow the link. */
export function KappaInfoIcon({ content }: { content: string }) {
  return (
    <Tooltip content={content}>
      <span
        role="button"
        className="inline-block p-1 rounded-md hover:bg-muted transition-colors cursor-pointer"
        aria-label={content}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <InfoIcon className="w-4 h-4 text-muted-foreground" />
      </span>
    </Tooltip>
  );
}

/** Why there is no kappa: a pill, and an info icon that explains it on hover. */
function KappaReasonPill({ blank }: { blank: { text: string; help: string } }) {
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <span className={`${PILL} max-w-full min-w-0 cursor-default`}>
        {blank.text}
      </span>
      <KappaInfoIcon content={blank.help} />
    </span>
  );
}

/** A table cell: the kappa with its kind on hover, the pill saying why there
 * is none, or a dash. */
export function KappaCell({
  fields,
}: {
  fields: KappaFields | null | undefined;
}) {
  if (fields?.kappa != null) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {formatKappa(fields.kappa)}
        <KappaInfoIcon content={kappaLabel(fields.kappa_type)} />
      </span>
    );
  }
  const blank = kappaBlank(fields);
  if (blank) return <KappaReasonPill blank={blank} />;
  return <span>—</span>;
}
