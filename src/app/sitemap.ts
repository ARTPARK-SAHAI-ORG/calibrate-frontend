import type { MetadataRoute } from "next";
import { POSTS } from "@/lib/blogPosts";
import { SITE_URL } from "@/lib/site";

/** The pages worth finding that are not blog posts. */
export const PAGES = ["/", "/learn", "/changelog", "/blog"];

/**
 * Pages left out of the sitemap because they need signing in, so a search
 * engine can never see them anyway.
 *
 * Written as the folder name under src/app. A new page has to appear here, in
 * PAGES, or in the robots block list, or the test in
 * src/app/__tests__/seo.test.ts fails and names it. That is the only thing
 * stopping a page from being quietly invisible to search.
 */
export const BEHIND_SIGN_IN = ["[org]"];

/**
 * Every page we want in search results.
 *
 * Posts come from the same list the blog pages read, so writing one adds it
 * here with nothing else to remember. Only a post carries a date: stamping the
 * other pages with the time of the build would tell a crawler they change on
 * every deploy, and it would stop trusting the dates that do mean something.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...PAGES.map((path) => ({ url: `${SITE_URL}${path}` })),
    ...POSTS.map((post) => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: post.date,
    })),
  ];
}
