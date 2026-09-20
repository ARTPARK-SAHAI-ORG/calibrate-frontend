import React from "react";

type Props = React.SelectHTMLAttributes<HTMLSelectElement> & {
  wrapperClassName?: string;
};

// A styled wrapper around the native <select> that gives the chevron proper
// breathing room from the right edge. Native selects render their own chevron
// touching the border, which looks cramped — we hide it with appearance-none
// and draw our own with adequate padding.
export function Select({
  className = "",
  wrapperClassName = "",
  children,
  ...rest
}: Props) {
  return (
    <div className={`relative ${wrapperClassName}`}>
      <select
        {...rest}
        className={`appearance-none w-full h-10 pl-3 pr-9 rounded-md text-sm border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:bg-muted/30 disabled:text-muted-foreground ${className}`}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 8.25l-7.5 7.5-7.5-7.5"
        />
      </svg>
    </div>
  );
}
