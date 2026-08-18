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

import type { Metadata } from "next";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { metadata as rootMetadata } from "../layout";
import { metadata as blogMetadata } from "../blog/layout";
import { metadata as changelogMetadata } from "../changelog/layout";
import { metadata as learnMetadata } from "../learn/layout";
import { generateMetadata as postMetadata } from "../blog/[slug]/page";
import robots from "../robots";
import sitemap, { PAGES, BEHIND_SIGN_IN } from "../sitemap";
import { POSTS, articleJsonLd, tabTitle } from "@/lib/blogPosts";
import type { BlogPost } from "@/lib/blogPosts";
import {
  CANONICAL_SITE_URL,
  SHARE_IMAGE,
  SHARE_IMAGE_ALT,
  SITE_URL,
  canonicalUrl,
  pageMetadata,
  shareImage,
} from "@/lib/site";

/** A picture in the preview box: where it is, how big, and what it says. */
type OgImage = { url: string; width: number; height: number; alt: string };

describe("sitemap", () => {
  it("lists the marketing pages and every post, with the post's own date", () => {
    const entries = sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toEqual([
      `${CANONICAL_SITE_URL}/`,
      `${CANONICAL_SITE_URL}/learn`,
      `${CANONICAL_SITE_URL}/changelog`,
      `${CANONICAL_SITE_URL}/blog`,
      ...POSTS.map((post) => `${CANONICAL_SITE_URL}/blog/${post.slug}`),
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
    expect(meta.alternates?.canonical).toBe(canonicalUrl(expected));
  });

  it("gives every post its own address", async () => {
    for (const post of POSTS) {
      const meta = await postMetadata({
        params: Promise.resolve({ slug: post.slug }),
      });
      expect(meta.alternates?.canonical).toBe(
        canonicalUrl(`/blog/${post.slug}`),
      );
    }
  });
});

/**
 * Every page open to everyone, and the preview box it hands out.
 *
 * Kept as a map rather than a list so the first test below can hold it against
 * the sitemap: a page added to one and not the other fails here by name.
 */
const PUBLIC_PAGES: Record<string, Metadata> = {
  "/": rootMetadata,
  "/learn": learnMetadata,
  "/changelog": changelogMetadata,
  "/blog": blogMetadata,
};

/**
 * The trap that caught learn and the changelog.
 *
 * Next does not mix a page's own title into a preview box it inherited. A page
 * that sets a title but no preview box of its own shows the home page's title,
 * description and address to anyone who pastes its link, and nothing breaks:
 * the page loads, the build passes, the tab is right. The only symptom is the
 * wrong words in a chat window, which nobody sees from inside the code.
 */
describe("every page open to everyone speaks for itself", () => {
  it("covers exactly the pages in the sitemap", () => {
    expect(Object.keys(PUBLIC_PAGES).sort()).toEqual([...PAGES].sort());
  });

  it.each(PAGES)("gives %s its own address in the preview box", (path) => {
    expect(PUBLIC_PAGES[path].openGraph?.url).toBe(canonicalUrl(path));
  });

  it("never lets a page hand out another page's words", () => {
    const said = PAGES.map((path) => {
      const openGraph = PUBLIC_PAGES[path].openGraph;
      return `${openGraph?.title} | ${openGraph?.description}`;
    });

    expect(new Set(said).size).toBe(PAGES.length);
  });

  it.each(PAGES)(
    "says the same thing in the tab and the preview for %s",
    (path) => {
      const meta = PUBLIC_PAGES[path];
      const title =
        typeof meta.title === "string"
          ? meta.title
          : (meta.title as { default: string }).default;

      expect(meta.openGraph?.title).toBe(title);
      expect(meta.openGraph?.description).toBe(meta.description);
    },
  );
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
    expect(meta.openGraph?.images).toEqual([shareImage()]);
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
      images: OgImage[];
    };

    expect(openGraph.type).toBe("article");
    expect(openGraph.title).toBe(post.title);
    expect(openGraph.publishedTime).toBe(post.date);
    expect(openGraph.images).toEqual([
      post.image ? shareImage(post.image, post.title) : shareImage(),
    ]);
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
 * The size and the words that go beside the picture.
 *
 * WhatsApp and LinkedIn lay the preview box out before the picture has
 * finished downloading, so a page that does not say how big its picture is
 * gets a small square thumbnail instead of the wide banner. The words are what
 * a screen reader says in place of the picture.
 *
 * The numbers are read back out of the file itself, so swapping in a picture
 * of another size fails here rather than quietly telling every reader a size
 * that is not true.
 */
describe("what the preview box is told about the picture", () => {
  const PUBLIC_DIR = join(__dirname, "..", "..", "..", "public");

  function pngSize(path: string): { width: number; height: number } {
    const header = readFileSync(path).subarray(16, 24);
    return { width: header.readUInt32BE(0), height: header.readUInt32BE(4) };
  }

  /** Every public page, and the one picture each of them names. */
  async function declaredPictures(): Promise<[string, OgImage][]> {
    const posts = await Promise.all(
      POSTS.map(async (post) => {
        const meta = await postMetadata({
          params: Promise.resolve({ slug: post.slug }),
        });
        return [`the ${post.slug} post`, meta] as const;
      }),
    );
    return [
      ...PAGES.map((path) => [path, PUBLIC_PAGES[path]] as const),
      ...posts,
    ].map(([name, meta]) => [
      name,
      (meta.openGraph as { images: OgImage[] }).images[0],
    ]);
  }

  /**
   * WhatsApp stops showing a preview picture reliably somewhere above a few
   * hundred kilobytes, and there is no warning when it gives up: the link just
   * appears as bare text. Everything we ship is well under this, so the cap is
   * a tripwire for a picture exported at full quality by mistake, not a budget
   * to spend up to.
   */
  const HEAVIEST_PICTURE_BYTES = 300 * 1024;

  it("keeps every picture light enough for WhatsApp to show", async () => {
    for (const [name, picture] of await declaredPictures()) {
      const bytes = readFileSync(join(PUBLIC_DIR, picture.url)).length;
      expect([name, bytes < HEAVIEST_PICTURE_BYTES]).toEqual([name, true]);
    }
  });

  it("gives every page a picture, its real size, and words for it", async () => {
    const pages = await declaredPictures();
    expect(pages.length).toBe(PAGES.length + POSTS.length);

    for (const [name, picture] of pages) {
      expect([name, picture.width]).toEqual([name, 1200]);
      expect([name, picture.height]).toEqual([name, 630]);
      expect([name, picture.alt.length > 0]).toEqual([name, true]);
      expect([name, pngSize(join(PUBLIC_DIR, picture.url))]).toEqual([
        name,
        { width: picture.width, height: picture.height },
      ]);
    }
  });

  it("describes a post's own picture with the post's headline", async () => {
    const post = POSTS.find((entry) => entry.image);
    if (!post) return;
    const meta = await postMetadata({
      params: Promise.resolve({ slug: post.slug }),
    });
    const [picture] = (meta.openGraph as { images: OgImage[] }).images;

    expect(picture.url).toBe(post.image);
    expect(picture.alt).toBe(post.title);
  });

  it("lets a page use its own picture, described by its own title", () => {
    const meta = pageMetadata({
      path: "/learn",
      title: "Learn | Calibrate",
      description: "Learning resources on Calibrate and AI evals",
      image: "/share/learn.png",
    });

    expect((meta.openGraph as { images: OgImage[] }).images).toEqual([
      shareImage("/share/learn.png", "Learn | Calibrate"),
    ]);
  });

  it("falls back to the site-wide picture and its words", () => {
    expect(shareImage()).toEqual({
      url: SHARE_IMAGE,
      width: 1200,
      height: 630,
      alt: SHARE_IMAGE_ALT,
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
      expect(url.startsWith(`${CANONICAL_SITE_URL}/`)).toBe(true);
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

/**
 * The one check that survives someone adding a page months from now.
 *
 * A page nobody lists is invisible to search and nobody notices, because
 * nothing breaks: the page loads, the build passes, and it simply never
 * appears in Google. So every page with an address of its own has to be
 * declared somewhere, and this fails by name when one is not.
 */
describe("every page is accounted for", () => {
  const APP_DIR = join(__dirname, "..");

  /** True when this folder, or anything under it, answers an address. */
  function hasRoute(dir: string): boolean {
    return readdirSync(dir, { withFileTypes: true }).some((entry) =>
      entry.isDirectory()
        ? hasRoute(join(dir, entry.name))
        : entry.name === "page.tsx" || entry.name === "route.ts",
    );
  }

  /** Folder name of every page with an address, "" for the landing page. */
  function routeFolders(): string[] {
    const folders = readdirSync(APP_DIR, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name !== "__tests__" &&
          hasRoute(join(APP_DIR, entry.name)),
      )
      .map((entry) => entry.name);
    return existsSync(join(APP_DIR, "page.tsx")) ? ["", ...folders] : folders;
  }

  /** "/blog", "/api/" and "blog" all name the same folder. */
  const folderOf = (path: string) => path.replace(/^\/|\/$/g, "");

  it("lists every page in the sitemap, in the robots block list, or behind sign-in", () => {
    const declared = new Set([
      ...PAGES.map(folderOf),
      ...(robots().rules as { disallow: string[] }).disallow.map(folderOf),
      ...BEHIND_SIGN_IN.map(folderOf),
    ]);

    expect(routeFolders().filter((folder) => !declared.has(folder))).toEqual(
      [],
    );
  });

  it("knows what it is looking at", () => {
    expect(routeFolders()).toContain("blog");
    expect(routeFolders()).toContain("");
  });
});

/**
 * A copy of this site running somewhere else.
 *
 * The code is open, so anyone can serve every blog post from their own domain,
 * and our own preview builds do the same on throwaway addresses. A search
 * engine treats two identical pages as rivals and shows one of them, so a copy
 * left open can take the credit for writing we did. Two lines stop it: every
 * page still names the real site as its own address, and the copy asks to be
 * left out of search altogether.
 *
 * Both are read from the environment when the file is first loaded, so each
 * test here loads a fresh copy of the app with a different address set.
 */
describe("a copy of this site running on another domain", () => {
  const REAL_VALUE = process.env.NEXT_PUBLIC_APP_URL;
  const SOMEONE_ELSE = "https://evals.example.org";

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = SOMEONE_ELSE;
  });

  afterEach(() => {
    if (REAL_VALUE === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = REAL_VALUE;
  });

  /** Load one file again, with the copy's address in the environment. */
  async function reload<T>(load: () => Promise<T>): Promise<T> {
    let loaded: T | undefined;
    await jest.isolateModulesAsync(async () => {
      loaded = await load();
    });
    return loaded as T;
  }

  it("knows it is not the real site", async () => {
    const site = await reload(() => import("@/lib/site"));

    expect(site.SITE_URL).toBe(SOMEONE_ELSE);
    expect(site.IS_CANONICAL_SITE).toBe(false);
    expect(site.CANONICAL_SITE_URL).toBe("https://calibrate.artpark.ai");
  });

  it("still points every page at the real site", async () => {
    const site = await reload(() => import("@/lib/site"));
    const meta = site.pageMetadata({
      path: "/blog",
      title: "Blog | Calibrate",
      description: "Learnings from real-world AI deployments",
    });

    expect(meta.alternates?.canonical).toBe(
      "https://calibrate.artpark.ai/blog",
    );
    expect(meta.openGraph?.url).toBe("https://calibrate.artpark.ai/blog");
  });

  it("still points every post at the real site", async () => {
    const page = await reload(() => import("../blog/[slug]/page"));
    const meta = await page.generateMetadata({
      params: Promise.resolve({ slug: POSTS[0].slug }),
    });

    expect(meta.alternates?.canonical).toBe(
      `https://calibrate.artpark.ai/blog/${POSTS[0].slug}`,
    );
  });

  it("lists the real site's addresses in its sitemap, not its own", async () => {
    const { default: copySitemap } = await reload(() => import("../sitemap"));

    for (const entry of copySitemap()) {
      expect(entry.url.startsWith("https://calibrate.artpark.ai")).toBe(true);
    }
  });

  it("names the real site in the facts Google reads about a post", async () => {
    const { articleJsonLd: copyArticleJsonLd } = await reload(
      () => import("@/lib/blogPosts"),
    );
    const copyArticle = copyArticleJsonLd(POSTS[0]);

    for (const url of [
      copyArticle.image,
      copyArticle.mainEntityOfPage,
      copyArticle.publisher.logo.url,
    ]) {
      expect(url.startsWith("https://calibrate.artpark.ai/")).toBe(true);
    }
  });

  it("offers nothing to a crawler and names no sitemap", async () => {
    const { default: copyRobots } = await reload(() => import("../robots"));
    const result = copyRobots();
    const rules = result.rules as { userAgent: string; disallow: string };

    expect(rules.userAgent).toBe("*");
    expect(rules.disallow).toBe("/");
    expect(result.sitemap).toBeUndefined();
  });

  it("asks search engines to leave it out altogether", async () => {
    const { metadata: copyRootMetadata } = await reload(
      () => import("../layout"),
    );

    expect(copyRootMetadata.robots).toEqual({ index: false, follow: false });
  });

  it("counts a build that names no address at all as a copy", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const site = await reload(() => import("@/lib/site"));

    expect(site.IS_CANONICAL_SITE).toBe(false);
    // The address is still needed for absolute links, so it falls back to the
    // real site. Only the search guard treats the missing value as a copy.
    expect(site.SITE_URL).toBe(CANONICAL_SITE_URL);
  });

  it.each([
    ["with a slash on the end", "https://calibrate.artpark.ai/"],
    ["without the s in https", "http://calibrate.artpark.ai"],
    ["with a www in front", "https://www.calibrate.artpark.ai"],
    ["shouted in capitals", "https://Calibrate.ArtPark.ai"],
  ])(
    "still counts the real site as itself when written %s",
    async (_name, written) => {
      process.env.NEXT_PUBLIC_APP_URL = written;
      const site = await reload(() => import("@/lib/site"));

      expect(site.IS_CANONICAL_SITE).toBe(true);
    },
  );

  it("leaves the real site indexed and crawlable", () => {
    expect(rootMetadata.robots).toBeUndefined();
    expect((robots().rules as { disallow: string[] }).disallow).not.toBe("/");
  });
});
