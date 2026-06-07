import React from "react";

/**
 * Inline validation message shown beneath a form field, in the standard red
 * style used across the tool/parameter forms. Renders nothing when `show` is
 * false so call sites stay a single line.
 */
export const FieldError = ({
  show,
  children,
}: {
  show: boolean;
  children: React.ReactNode;
}) => {
  if (!show) return null;
  return <p className="mt-1 text-sm text-red-500">{children}</p>;
};
