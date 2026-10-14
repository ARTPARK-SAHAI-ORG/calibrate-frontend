"use client";

import { useState } from "react";
import { EyeIcon, EyeSlashIcon } from "@/components/icons";

/** A provider API key field, hidden by default with an eye button to show it.
 *  Google Cloud's service account JSON spans several lines, so it gets a text
 *  box instead of a one-line field. */
export function KeyField({
  id,
  name,
  value,
  onChange,
  onEnter,
  multiline,
  disabled,
  error,
  errorId,
  ariaLabel,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  multiline?: boolean;
  disabled?: boolean;
  error?: boolean;
  errorId?: string;
  ariaLabel?: string;
}) {
  const [shown, setShown] = useState(false);
  const border = error
    ? "border-red-500/60 focus:ring-red-500/20"
    : "border-border focus:ring-foreground/10";
  const shared = {
    id,
    value,
    disabled,
    "aria-label": ariaLabel,
    "aria-invalid": !!error,
    "aria-describedby": error ? errorId : undefined,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(e.target.value),
  };
  const base = `w-full rounded-md border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 disabled:opacity-50 pr-10 ${border}`;

  return (
    <div className="relative flex-1 min-w-0">
      {multiline ? (
        <textarea
          {...shared}
          rows={6}
          spellCheck={false}
          placeholder="Paste your service account JSON"
          // A text box cannot be a password field, so its text is masked instead.
          style={
            shown
              ? undefined
              : ({ WebkitTextSecurity: "disc" } as React.CSSProperties)
          }
          className={`${base} px-3 py-2 font-mono placeholder:font-sans`}
        />
      ) : (
        <input
          {...shared}
          type={shown ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          placeholder={`Paste your ${name} API key`}
          onKeyDown={(e) => {
            if (e.key === "Enter" && onEnter) {
              e.preventDefault();
              onEnter();
            }
          }}
          className={`${base} h-10 px-3`}
        />
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShown((s) => !s);
        }}
        aria-label={shown ? `Hide the ${name} key` : `Show the ${name} key`}
        className={`absolute right-3 ${multiline ? "top-2.5" : "top-1/2 -translate-y-1/2"} text-muted-foreground hover:text-foreground transition-colors cursor-pointer`}
      >
        {shown ? (
          <EyeSlashIcon className="w-4 h-4" />
        ) : (
          <EyeIcon className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}
