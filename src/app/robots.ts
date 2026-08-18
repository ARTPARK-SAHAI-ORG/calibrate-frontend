import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * The first thing a search engine reads. Anything not listed here is open to
 * crawlers, which is what we want for the marketing pages.
 *
 * /public/ and /annotate-job/ are the ones that matter: both open without
 * signing in because the address itself carries a share token, so a link
 * pasted anywhere public could otherwise put a customer's results in search
 * results. This is a request a crawler chooses to honour, not a lock, so it
 * never replaces the token check on those pages.
 *
 * The workspace pages are left out on purpose. A crawler is not signed in, so
 * it is already sent to the login page, and listing them would publish the
 * shape of the app for nothing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: [
        "/public/",
        "/annotate-job/",
        "/api/",
        "/login",
        "/signup",
        "/opening",
        "/debug-client",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
