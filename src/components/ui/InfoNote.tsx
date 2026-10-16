import React from "react";

/** The blue note that explains something on the page, with an "i" icon. */
export function InfoNote({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex items-start gap-2 rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-xs md:text-sm leading-relaxed text-blue-900 dark:text-blue-300 ${className}`}
    >
      <svg
        className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-600 dark:text-blue-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.75}
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
        />
      </svg>
      {children}
    </div>
  );
}
