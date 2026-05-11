type RetryIconProps = {
  className?: string;
};

export function RetryIcon({
  className = "w-3.5 h-3.5 shrink-0",
}: RetryIconProps) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582a8 8 0 0114.95-2M20 20v-5h-.581a8 8 0 01-14.95 2"
      />
    </svg>
  );
}
