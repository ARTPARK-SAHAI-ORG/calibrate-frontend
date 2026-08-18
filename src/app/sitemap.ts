import type { MetadataRoute } from "next";
import { POSTS } from "@/lib/blogPosts";
import { SITE_URL } from "@/lib/site";

/** The pages worth finding that are not blog posts. */
const PAGES = ["/", "/learn", "/changelog", "/blog"];

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
