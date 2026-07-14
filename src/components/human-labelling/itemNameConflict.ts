/**
 * Parse ITEM_NAME_* API errors so add/edit item dialogs can show them
 * inline under the Name field instead of a bottom banner.
 */

export type ItemNameConflict = {
  code: "ITEM_NAME_CONFLICT" | "ITEM_NAME_DUPLICATE_IN_REQUEST";
  conflictingNames: string[];
  message: string;
};

function formatNames(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `"${names[0]}"`;
  return names.map((n) => `"${n}"`).join(", ");
}

function humaniseNameConflictDetail(detail: {
  code?: string;
  conflicting_names?: string[];
}): ItemNameConflict | null {
  const code = detail.code;
  if (
    code !== "ITEM_NAME_CONFLICT" &&
    code !== "ITEM_NAME_DUPLICATE_IN_REQUEST"
  ) {
    return null;
  }
  const conflictingNames = detail.conflicting_names ?? [];
  const fmt = formatNames(conflictingNames);

  let message: string;
  if (code === "ITEM_NAME_CONFLICT") {
    message = fmt
      ? conflictingNames.length === 1
        ? `An item named ${fmt} already exists in this task`
        : `Items with these names already exist in this task: ${fmt}`
      : "One or more item names already exist in this task";
  } else {
    message = fmt
      ? conflictingNames.length === 1
        ? `Duplicate name in your request: ${fmt}`
        : `Duplicate names in your request: ${fmt}`
      : "Your request contains duplicate item names";
  }

  return { code, conflictingNames, message };
}

/** Per-row copy when several names conflict — keep the field message specific. */
export function perRowNameConflictMessage(
  name: string,
  conflict: ItemNameConflict,
): string {
  if (conflict.code === "ITEM_NAME_DUPLICATE_IN_REQUEST") {
    return `Duplicate name in your request: "${name}"`;
  }
  return `An item named "${name}" already exists in this task`;
}

export function parseItemNameConflictFromError(
  err: unknown,
): ItemNameConflict | null {
  if (!(err instanceof Error)) return null;
  const m = err.message.match(/Request failed: \d+ - ([\s\S]+)$/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]);
    if (!parsed?.detail || typeof parsed.detail !== "object") return null;
    return humaniseNameConflictDetail(parsed.detail);
  } catch {
    return null;
  }
}

/**
 * Map a name conflict onto draft rows by trimmed name. Returns `{}` when no
 * row matches (caller should fall back to a general banner).
 */
export function rowNameErrorsFromConflict(
  rows: { id: string; name: string }[],
  conflict: ItemNameConflict,
): Record<string, string> {
  const names = new Set(conflict.conflictingNames);
  const out: Record<string, string> = {};

  if (names.size === 0) {
    // Generic conflict with no names listed — attach to the sole row if any.
    if (rows.length === 1 && rows[0].name.trim()) {
      out[rows[0].id] = conflict.message;
    }
    return out;
  }

  for (const row of rows) {
    const n = row.name.trim();
    if (names.has(n)) {
      out[row.id] = perRowNameConflictMessage(n, conflict);
    }
  }
  return out;
}
