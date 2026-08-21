"use client";

import React, { Fragment, useEffect } from "react";
import { Link, usePathname } from "@/lib/nav";
import { rememberParentPage } from "@/lib/parentPage";

export type Crumb = {
  /** Text shown for this step. */
  label: string;
  /** Page this step opens. Leave out for the page you are already on. On an
   * error page the trail can end on a step that still has one, and it stays
   * clickable so there is always a way back. */
  href?: string;
  /** Action on the last step, used where the name is editable in place. */
  onClick?: () => void;
  /** Tooltip, used with `onClick`. */
  title?: string;
};

/**
 * The trail of pages leading to this one, e.g. Agents / Support bot.
 *
 * Rendered in the top bar through AppLayout's `customHeader`, and again in the
 * page body with `className="md:hidden"` because that bar is hidden on phones.
 */
export function Breadcrumbs({
  items,
  className = "",
}: {
  items: Crumb[];
  className?: string;
}) {
  const pathname = usePathname();
  // Record this page so a page reached from several places (the evaluator
  // page) can name the one the reader came from. The evaluator page is left
  // out so it never records itself as its own parent.
  const label = items[items.length - 1]?.label ?? "";
  useEffect(() => {
    if (!label || pathname.startsWith("/evaluators/")) return;
    const search = typeof window === "undefined" ? "" : window.location.search;
    rememberParentPage({ href: `${pathname}${search}`, label });
  }, [pathname, label]);

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center gap-1.5 text-sm min-w-0 ${className}`}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 && (
              <span aria-hidden="true" className="text-muted-foreground/60">
                /
              </span>
            )}
            {item.href ? (
              <Link
                href={item.href}
                aria-current={isLast ? "page" : undefined}
                className={`truncate cursor-pointer transition-colors hover:text-foreground ${
                  isLast
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {item.label}
              </Link>
            ) : item.onClick ? (
              <button
                type="button"
                onClick={item.onClick}
                title={item.title}
                aria-current={isLast ? "page" : undefined}
                className="font-semibold text-foreground truncate cursor-pointer hover:opacity-70 transition-opacity"
              >
                {item.label}
              </button>
            ) : (
              <span
                aria-current={isLast ? "page" : undefined}
                className={`truncate ${isLast ? "font-semibold text-foreground" : "text-muted-foreground"}`}
              >
                {item.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
