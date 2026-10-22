import React from "react";

/** The red box that says what went wrong, readable in light and dark mode. */
export function ErrorNote({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs md:text-sm leading-relaxed break-words text-red-700 dark:text-red-300 ${className}`}
    >
      {children}
    </div>
  );
}
