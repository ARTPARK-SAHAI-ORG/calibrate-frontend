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

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { metadata as rootMetadata } from "../layout";
import { metadata as blogMetadata } from "../blog/layout";
import { metadata as changelogMetadata } from "../changelog/layout";
import { metadata as learnMetadata } from "../learn/layout";
import { generateMetadata as postMetadata } from "../blog/[slug]/page";
import robots from "../robots";
import sitemap from "../sitemap";
import { POSTS, articleJsonLd, tabTitle } from "@/lib/blogPosts";
import type { BlogPost } from "@/lib/blogPosts";
import { SHARE_IMAGE, SITE_URL } from "@/lib/site";

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

/**
 * The preview box a link gets when it is pasted into WhatsApp, LinkedIn or X.
 * Most readers meet a post through one of those, not through a search, so a
 * page that loses its picture or its headline here costs real clicks.
 */
describe("link previews", () => {
  it.each([
    ["the landing page", rootMetadata, "website"],
    ["the blog", blogMetadata, "website"],
  ])("gives %s a picture and a headline", (_name, meta, type) => {
    expect(meta.openGraph?.type).toBe(type);
    expect(meta.openGraph?.title).toBeTruthy();
    expect(meta.openGraph?.images).toEqual([SHARE_IMAGE]);
  });

  it("describes a post as an article, with its own date and picture", async () => {
    const post = POSTS[0];
    const meta = await postMetadata({
      params: Promise.resolve({ slug: post.slug }),
    });
    const openGraph = meta.openGraph as {
      type: string;
      title: string;
      publishedTime: string;
      images: string[];
    };

    expect(openGraph.type).toBe("article");
    expect(openGraph.title).toBe(post.title);
    expect(openGraph.publishedTime).toBe(post.date);
    expect(openGraph.images).toEqual([post.image ?? SHARE_IMAGE]);
  });
});

/**
 * The picture itself, not just the line of metadata pointing at it. Naming a
 * file that was never added is silent: the build passes, the page loads, and
 * the only symptom is a bare link with no picture wherever it is shared. The
 * size matters as much as the file, since WhatsApp and LinkedIn crop anything
 * that is not 1200 by 630.
 */
describe("share pictures", () => {
  const PUBLIC_DIR = join(__dirname, "..", "..", "..", "public");

  /** Width and height straight out of the PNG header. */
  function pngSize(path: string): { width: number; height: number } {
    const header = readFileSync(path).subarray(16, 24);
    return { width: header.readUInt32BE(0), height: header.readUInt32BE(4) };
  }

  const pictures = [
    ["the site-wide fallback", SHARE_IMAGE],
    ...POSTS.filter((post) => post.image).map(
      (post) => [`the ${post.slug} post`, post.image as string] as const,
    ),
  ] as const;

  it.each(pictures)("ships a file for %s", (_name, path) => {
    expect(existsSync(join(PUBLIC_DIR, path))).toBe(true);
  });

  it.each(pictures)("sizes %s at 1200 by 630", (_name, path) => {
    expect(pngSize(join(PUBLIC_DIR, path))).toEqual({
      width: 1200,
      height: 630,
    });
  });
});

/**
 * What Google reads to show a result as a dated article by a person rather
 * than a bare link. Every address in it has to be a full one, since the block
 * is read away from the page it sits in.
 */
describe("article facts", () => {
  const article = articleJsonLd(POSTS[0]) as Record<string, never> & {
    headline: string;
    datePublished: string;
    image: string;
    mainEntityOfPage: string;
    author: { name: string; url?: string };
    publisher: { logo: { url: string } };
  };

  it("carries the headline, the date and the author", () => {
    expect(article.headline).toBe(POSTS[0].title);
    expect(article.datePublished).toBe(POSTS[0].date);
    expect(article.author.name).toBe(POSTS[0].author);
    expect(article.author.url).toBe(POSTS[0].authorUrl);
  });

  it("writes every address out in full", () => {
    for (const url of [
      article.image,
      article.mainEntityOfPage,
      article.publisher.logo.url,
    ]) {
      expect(url.startsWith(`${SITE_URL}/`)).toBe(true);
    }
  });
});

/**
 * A headline that reads well on the page is often not what someone types into
 * a search. The tab and the search result can carry those words instead, while
 * the page keeps its headline.
 */
describe("the browser tab", () => {
  const post = { title: "Evaluation is all you need" } as BlogPost;

  it("uses the headline when a post asks for nothing else", () => {
    expect(tabTitle(post)).toBe("Evaluation is all you need | Calibrate");
  });

  it("uses the searchable words when a post has them", () => {
    expect(tabTitle({ ...post, seoTitle: "Why AI evals matter" })).toBe(
      "Why AI evals matter | Calibrate",
    );
  });

  it("leaves the preview box showing the headline", async () => {
    const meta = await postMetadata({
      params: Promise.resolve({ slug: POSTS[0].slug }),
    });
    expect(meta.title).toBe(tabTitle(POSTS[0]));
    expect(meta.openGraph?.title).toBe(POSTS[0].title);
  });
});
