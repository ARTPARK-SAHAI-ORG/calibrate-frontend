import type React from "react";

const WARNING_BOX =
  "rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2";

export function WarningBox({
  children,
  after,
  action,
  icon,
}: {
  children: React.ReactNode;
  after?: React.ReactNode;
  /** Placed beside the text, such as a button. */
  action?: React.ReactNode;
  /** Drawn before the text. */
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={
        action
          ? `flex flex-wrap items-center justify-between gap-2 ${WARNING_BOX}`
          : icon
            ? `flex items-start gap-2 ${WARNING_BOX}`
            : WARNING_BOX
      }
    >
      {icon}
      <p className="text-sm text-amber-700 dark:text-amber-300">{children}</p>
      {action}
      {after}
    </div>
  );
}
