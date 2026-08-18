/**
 * What we hand a search engine.
 *
 * Two things are pinned here. Every blog post must be in the sitemap, since a
 * post nobody links to is a post nobody finds. And the two share-link paths
 * must stay blocked, since those open without signing in and a crawler that
 * follows one would put a customer's results in search results.
 */
// The root layout pulls in the Vercel analytics tag, which ships in a form
// jest cannot read. Only the layout's metadata is read here, never rendered.
jest.mock("@vercel/analytics/next", () => ({ Analytics: () => null }));

import { metadata as rootMetadata } from "../layout";
import { metadata as blogMetadata } from "../blog/layout";
import { metadata as changelogMetadata } from "../changelog/layout";
import { metadata as learnMetadata } from "../learn/layout";
import { generateMetadata as postMetadata } from "../blog/[slug]/page";
import robots from "../robots";
import sitemap from "../sitemap";
import { POSTS } from "@/lib/blogPosts";
import { SITE_URL } from "@/lib/site";

describe("sitemap", () => {
  it("lists the marketing pages and every post, with the post's own date", () => {
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toEqual([
      `${SITE_URL}/`,
      `${SITE_URL}/learn`,
      `${SITE_URL}/changelog`,
      `${SITE_URL}/blog`,
      ...POSTS.map((post) => `${SITE_URL}/blog/${post.slug}`),
    ]);

    for (const post of POSTS) {
      expect(
        entries.find((entry) => entry.url.endsWith(`/blog/${post.slug}`)),
      ).toHaveProperty("lastModified", post.date);
    }
  });

  it("dates only the posts, so a deploy does not look like a change everywhere", () => {
    for (const entry of sitemap().slice(0, 4)) {
      expect(entry.lastModified).toBeUndefined();
    }
  });

  it("keeps pages that need signing in out of it", () => {
    const urls = sitemap().map((entry) => entry.url);
    for (const path of ["/login", "/signup", "/opening", "/public/"]) {
      expect(urls.some((url) => url.includes(path))).toBe(false);
    }
  });
});

describe("robots", () => {
  it("keeps crawlers away from the share links", () => {
    const { disallow } = robots().rules as { disallow: string[] };

    expect(disallow).toContain("/public/");
    expect(disallow).toContain("/annotate-job/");
  });

  it("points at the sitemap", () => {
    expect(robots().sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it("leaves the blog open to every crawler", () => {
    const rules = robots().rules as { userAgent: string; disallow: string[] };

    expect(rules.userAgent).toBe("*");
    expect(rules.disallow.some((path) => path.startsWith("/blog"))).toBe(false);
  });
});

/**
 * The canonical address is the one line that stops the same page counting as
 * several: a share with a tracking tag on the end, a copy posted elsewhere.
 * Copying a layout file for the next page and dropping the line is the easy
 * mistake, so every public page is named here.
 */
describe("canonical addresses", () => {
  it("names the site once, at the root", () => {
    expect(rootMetadata.metadataBase?.toString()).toBe(`${SITE_URL}/`);
  });

  it.each([
    ["the landing page", rootMetadata, "/"],
    ["the blog", blogMetadata, "/blog"],
    ["learn", learnMetadata, "/learn"],
    ["the changelog", changelogMetadata, "/changelog"],
  ])("gives %s its own address", (_name, meta, expected) => {
    expect(meta.alternates?.canonical).toBe(expected);
  });

  it("gives every post its own address", async () => {
    for (const post of POSTS) {
      const meta = await postMetadata({
        params: Promise.resolve({ slug: post.slug }),
      });
      expect(meta.alternates?.canonical).toBe(`/blog/${post.slug}`);
    }
  });
});
