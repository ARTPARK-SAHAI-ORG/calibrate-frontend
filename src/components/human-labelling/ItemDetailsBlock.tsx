import { MetadataTable, type MetadataEntry } from "@/components/ui";

export function itemDescriptionOf(payload: unknown): string {
  const description =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).description
      : undefined;
  return typeof description === "string" ? description.trim() : "";
}

export function hasItemDetails(
  payload: unknown,
  metadata?: MetadataEntry[] | null,
): boolean {
  return Boolean(itemDescriptionOf(payload)) || Boolean(metadata?.length);
}

/** An item's description and metadata in one box headed "Item details", the
 *  way every view that shows one item draws them. Renders nothing when the item
 *  has neither. */
export function ItemDetailsBlock({
  payload,
  metadata,
}: {
  payload: unknown;
  metadata?: MetadataEntry[] | null;
}) {
  if (!hasItemDetails(payload, metadata)) return null;
  const description = itemDescriptionOf(payload);
  return (
    <section className="border border-border rounded-xl bg-muted/20 p-3 space-y-3">
      <h2 className="text-sm font-semibold">Item details</h2>
      {description && (
        <div className="space-y-1.5">
          <h3 className="text-sm font-semibold">Description</h3>
          <p className="text-sm text-foreground whitespace-pre-wrap break-words">
            {description}
          </p>
        </div>
      )}
      <MetadataTable entries={metadata} />
    </section>
  );
}
