"use client";

import { useEffect, useState } from "react";

/**
 * The list of sessions down the left of the Learn page. The session being read
 * is marked as the reader scrolls.
 *
 * Hidden below the large breakpoint: the sessions stack full width there and
 * there is no room beside them.
 */

/** How far below the top of the screen a session counts as the one being read. */
const READING_LINE_PX = 160;

export function LearnTableOfContents({
  sections,
}: {
  sections: { id: string; title: string }[];
}) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const markTheOneBeingRead = () => {
      const passed = sections
        .map((section) => document.getElementById(section.id))
        .filter((element): element is HTMLElement => element !== null)
        .filter(
          (element) => element.getBoundingClientRect().top <= READING_LINE_PX,
        );
      // Before the first session reaches the line, the first one is still the
      // one the reader is heading for.
      setActiveId(passed[passed.length - 1]?.id ?? sections[0]?.id ?? "");
    };

    markTheOneBeingRead();
    window.addEventListener("scroll", markTheOneBeingRead, { passive: true });
    window.addEventListener("resize", markTheOneBeingRead);
    return () => {
      window.removeEventListener("scroll", markTheOneBeingRead);
      window.removeEventListener("resize", markTheOneBeingRead);
    };
  }, [sections]);

  if (sections.length === 0) return null;

  return (
    <nav aria-label="Sessions on this page" className="hidden lg:block">
      <div className="sticky top-24">
        <p className="mb-4 inline-block rounded-md border border-emerald-200/90 bg-emerald-50/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-950 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
          On this page
        </p>
        <ul className="flex flex-col gap-1.5">
          {sections.map((section) => {
            const isActive = section.id === activeId;
            return (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  aria-current={isActive ? "true" : undefined}
                  className={`block rounded-2xl border px-3.5 py-2.5 text-[15px] font-semibold leading-snug tracking-[-0.02em] transition-all duration-200 cursor-pointer ${
                    isActive
                      ? "border-emerald-200/90 bg-gradient-to-br from-white via-emerald-50 to-white text-emerald-950 shadow-[0_8px_30px_-12px_rgba(16,185,129,0.35)] ring-1 ring-emerald-900/[0.06]"
                      : "border-gray-100/90 bg-gray-50 text-gray-800 hover:border-gray-200 hover:bg-white hover:text-gray-950 hover:shadow-sm"
                  }`}
                >
                  {section.title}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
