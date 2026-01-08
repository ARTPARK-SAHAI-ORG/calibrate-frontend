export function ContentPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-6">
      {/* Title Section */}
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground text-[15px] leading-relaxed">
          {description}
        </p>
      </div>

      {/* Placeholder Cards */}
      <div className="grid gap-4 pt-4">
        {/* Upload/Input Area Placeholder */}
        <div className="border-2 border-dashed border-border rounded-xl p-12 flex flex-col items-center justify-center text-center bg-muted/20">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <svg
              className="w-6 h-6 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
              />
            </svg>
          </div>
          <p className="text-[14px] font-medium text-foreground mb-1">
            Upload files or configure test
          </p>
          <p className="text-[13px] text-muted-foreground">
            Component-specific input area will appear here
          </p>
        </div>

        {/* Results Area Placeholder */}
        <div className="border border-border rounded-xl p-6 bg-muted/10">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-muted-foreground/30"></div>
            <span className="text-[13px] font-medium text-muted-foreground">
              Results & Metrics
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 rounded-lg bg-muted/50 animate-pulse"
              ></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
