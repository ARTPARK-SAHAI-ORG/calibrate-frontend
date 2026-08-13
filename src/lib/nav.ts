"use client";

/**
 * Navigation that carries the workspace on its own.
 *
 * Every page behind sign-in sits under its workspace (see `src/lib/routes.ts`).
 * Rather than rewrite the ~130 places that name a page, those places keep
 * writing plain addresses like "/agents" and import from here instead of
 * `next/navigation` and `next/link`. The workspace in the current address is
 * added on the way out and taken off on the way in, so page code never sees it.
 *
 *   import { useRouter, usePathname, Link } from "@/lib/nav";
 *
 * Pages that sit outside a workspace (login, signup, the shared result pages)
 * can import from here too: with no workspace in the address there is nothing
 * to add, and every address passes through untouched.
 */

import NextLink from "next/link";
import {
  usePathname as useNextPathname,
  useRouter as useNextRouter,
} from "next/navigation";
import { createElement, forwardRef, useMemo } from "react";
import type { ComponentProps } from "react";
import { orgFromPath, withWorkspace } from "@/lib/routes";

/** The workspace named by the address on screen, or null. */
export function useOrgUuid(): string | null {
  return orgFromPath(useNextPathname() ?? "");
}

/** The address on screen, without the workspace. */
export function usePathname(): string {
  const full = useNextPathname() ?? "";
  const org = orgFromPath(full);
  return org ? full.slice(org.length + 1) || "/" : full;
}

type NextRouter = ReturnType<typeof useNextRouter>;

/**
 * Everything after the address. Passing these straight through keeps a call
 * that gives no options looking exactly like one, so tests that watch
 * navigation read the same as before.
 */
type SkipFirst<T extends unknown[]> = T extends [unknown, ...infer Rest]
  ? Rest
  : [];

/**
 * `useRouter`, with the workspace added to whatever page you ask for. Same
 * shape as the one from `next/navigation`.
 */
export function useRouter(): NextRouter {
  const router = useNextRouter();
  const org = useOrgUuid();
  return useMemo(
    () => ({
      ...router,
      push: (href: string, ...rest: SkipFirst<Parameters<NextRouter["push"]>>) =>
        router.push(withWorkspace(href, org), ...rest),
      replace: (
        href: string,
        ...rest: SkipFirst<Parameters<NextRouter["replace"]>>
      ) => router.replace(withWorkspace(href, org), ...rest),
      prefetch: (
        href: string,
        ...rest: SkipFirst<Parameters<NextRouter["prefetch"]>>
      ) => router.prefetch(withWorkspace(href, org), ...rest),
    }),
    [router, org],
  );
}

type LinkProps = ComponentProps<typeof NextLink>;

/** `next/link`, with the workspace added to the page it points at. */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, ...rest },
  ref,
) {
  const org = useOrgUuid();
  const target = typeof href === "string" ? withWorkspace(href, org) : href;
  return createElement(NextLink, { ...rest, href: target, ref });
});

/**
 * Change the address on screen without loading anything, for pages that keep
 * the open tab or the current filters in the address. Same workspace handling
 * as the rest of this file.
 */
export function replaceUrl(path: string): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(
    null,
    "",
    withWorkspace(path, orgFromPath(window.location.pathname)),
  );
}

export { useParams, useSearchParams, redirect, notFound } from "next/navigation";
