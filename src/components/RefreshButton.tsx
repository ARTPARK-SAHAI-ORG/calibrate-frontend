"use client";

type RefreshButtonProps = {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** When set, renders an icon + label pill. Otherwise renders as an
   *  icon-only square button (for use next to a heading). */
  label?: string;
  title?: string;
  className?: string;
};

export function RefreshButton({
  onClick,
  loading,
  disabled,
  label,
  title = "Refresh",
  className,
}: RefreshButtonProps) {
  const isDisabled = disabled || loading;
  const base =
    "flex items-center justify-center gap-2 rounded-lg font-medium border cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-slate-500/10 border-slate-500/30 text-slate-700 dark:text-slate-200 hover:bg-slate-500/20 dark:hover:bg-slate-500/25";
  const sizing = label ? "h-8 px-2 md:px-3 text-xs md:text-sm" : "h-7 w-7";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      title={title}
      aria-label={title}
      className={`${base} ${sizing} ${className ?? ""}`}
    >
      <svg
        className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 4v6h6M20 20v-6h-6M20 9A8 8 0 006.34 6.34M4 15a8 8 0 0013.66 2.66"
        />
      </svg>
      {label}
    </button>
  );
}
