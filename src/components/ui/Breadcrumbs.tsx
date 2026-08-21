"use client";

import React, { Fragment } from "react";
import { Link } from "@/lib/nav";

export type Crumb = {
  /** Text shown for this step. */
  label: string;
  /** Page this step opens. Leave out for the page you are already on. */
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
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="text-muted-foreground hover:text-foreground transition-colors truncate cursor-pointer"
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
