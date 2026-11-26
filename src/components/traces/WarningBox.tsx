import type React from "react";

export const WARNING_BOX =
  "rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2";

export function WarningBox({
  children,
  after,
}: {
  children: React.ReactNode;
  after?: React.ReactNode;
}) {
  return (
    <div className={WARNING_BOX}>
      <p className="text-sm text-amber-700 dark:text-amber-300">{children}</p>
      {after}
    </div>
  );
}
