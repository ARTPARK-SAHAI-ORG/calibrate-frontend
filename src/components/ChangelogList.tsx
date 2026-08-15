import type { ChangelogMonth } from "@/lib/changelog";

type ChangelogListProps = {
  months: ChangelogMonth[];
};

/**
 * The changelog, a month at a time, newest first. The month sits to the left
 * of its lines on a wide screen and above them on a phone.
 */
export function ChangelogList({ months }: ChangelogListProps) {
  if (months.length === 0) {
    return (
      <p className="text-base md:text-lg text-gray-500">
        Nothing here yet. Changes appear as soon as they are released.
      </p>
    );
  }

  return (
    <div className="space-y-10 md:space-y-14">
      {months.map((month) => (
        <section
          key={month.month}
          className="grid grid-cols-1 gap-4 md:grid-cols-[10rem_1fr] md:gap-8"
        >
          <h2 className="text-lg md:text-xl font-medium text-gray-900 tracking-[-0.02em]">
            {month.month}
          </h2>
          <ul className="space-y-4 border-l border-gray-200 pl-6 md:pl-8">
            {month.entries.map((entry) => (
              <li key={entry.number} className="text-gray-700 leading-relaxed">
                {entry.text}{" "}
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-gray-900 transition-colors whitespace-nowrap cursor-pointer"
                >
                  #{entry.number}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
