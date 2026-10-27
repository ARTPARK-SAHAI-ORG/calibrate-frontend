const SIZE_CLASSES = {
  section: "px-3 py-2 text-sm -mb-px",
  page: "px-4 py-2 text-[13px]",
  window: "pb-3 px-1 text-sm md:text-base whitespace-nowrap flex-shrink-0",
};

/**
 * The underlined tab buttons only, so each surface keeps the container it
 * already has. `size` is "section" for the tabs at the top of a page section,
 * "page" for a run's results page and "window" for a run's results window.
 */
export function TabButtons<T extends string>({
  tabs,
  active,
  onChange,
  size = "section",
  tourPrefix,
}: {
  tabs: readonly { id: T; label: string }[];
  active: string | null;
  onChange: (id: T) => void;
  size?: keyof typeof SIZE_CLASSES;
  /** Marks each button for the guided tour, e.g. `run-tab-summary`. */
  tourPrefix?: string;
}) {
  return (
    <>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          data-tour={tourPrefix ? `${tourPrefix}-${t.id}` : undefined}
          onClick={() => onChange(t.id)}
          className={`${SIZE_CLASSES[size]} font-medium border-b-2 transition-colors cursor-pointer ${
            active === t.id
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label}
        </button>
      ))}
    </>
  );
}

/** The plain underlined tabs at the top of a page or section. */
export function TabRow<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="border-b border-border flex items-center gap-1">
      <TabButtons tabs={tabs} active={active} onChange={onChange} />
    </div>
  );
}
