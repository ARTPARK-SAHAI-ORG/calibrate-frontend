"use client";

/**
 * The tabs on every page and window that shows the results of a run: the test
 * run and model comparison windows, the Speech-to-Text and Text-to-Speech
 * evaluation pages, and the shared links to all four. Each of them used to
 * write its own row of buttons, which is how the same tab came to be called
 * "Results" in one place and "Outputs" in another. The names live here now, so
 * a rename lands everywhere at once. "outputs" is the row-by-row tab on the
 * speech pages; a test run and a model comparison call the same tab "tests",
 * because every row there is one test.
 */
export type ResultTabId =
  | "summary"
  | "leaderboard"
  | "top-picks"
  | "outputs"
  | "tests"
  | "about";

/** The one place each of these tabs is named. */
export const RESULT_TAB_LABELS: Record<ResultTabId, string> = {
  summary: "Results",
  leaderboard: "Leaderboard",
  "top-picks": "Model selection",
  outputs: "Results",
  tests: "Tests",
  about: "About",
};

/**
 * The row of buttons only, so each surface keeps the container it already has
 * (a page lays them out under a heading, a window inside its own border).
 * `size` is "page" on a full page and "window" in a dialog, where the tabs sit
 * a little larger and can be scrolled sideways on a phone.
 */
export function ResultTabs<T extends ResultTabId>({
  tabs,
  activeTab,
  onChange,
  size = "page",
  tourPrefix,
}: {
  tabs: readonly T[];
  activeTab: string;
  onChange: (tab: T) => void;
  size?: "page" | "window";
  /** Marks each button for the guided tour, e.g. `run-tab-summary`. */
  tourPrefix?: string;
}) {
  return (
    <>
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          data-tour={tourPrefix ? `${tourPrefix}-${tab}` : undefined}
          onClick={() => onChange(tab)}
          className={`${
            size === "window"
              ? "pb-3 px-1 text-sm md:text-base whitespace-nowrap flex-shrink-0"
              : "px-4 py-2 text-[13px]"
          } font-medium border-b-2 transition-colors cursor-pointer ${
            activeTab === tab
              ? "border-foreground text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {RESULT_TAB_LABELS[tab]}
        </button>
      ))}
    </>
  );
}
