import type { Metadata } from "next";

/**
 * The real site, written out rather than read from the environment.
 *
 * Anyone can run this app on their own domain, and the code is open, so copies
 * of every blog post exist on servers we do not control. Search engines treat
 * two identical pages as rivals and pick one, so the copies would take the
 * credit for writing we did. Every page open to everyone names this address as
 * its own, whichever server it is running on, which points that credit back
 * here. See IS_CANONICAL_SITE for the other half of it.
 */
export const CANONICAL_SITE_URL = "https://calibrate.artpark.ai";

/**
 * Where this particular build lives, as an absolute address.
 *
 * Search engines need one, since robots.txt and sitemap.xml carry full
 * addresses rather than paths. Set NEXT_PUBLIC_APP_URL per environment; the
 * fallback is production, so a preview build with no value set points readers
 * at the real site rather than at a dead address.
 */
const CONFIGURED_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(
  /\/$/,
  "",
);

export const SITE_URL = CONFIGURED_URL || CANONICAL_SITE_URL;

/**
 * Just the domain, so http against https, a capital letter, or a www in front
 * cannot make the real site look like a copy of itself and quietly drop it out
 * of search.
 */
function bareHost(url: string): string {
  return url
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .toLowerCase();
}

/**
 * True only on the real site. False on a copy someone else is running and on
 * our own preview builds.
 *
 * Naming the real address in a canonical link is a request a search engine may
 * ignore. This is what actually keeps a copy out of search: robots.ts blocks
 * every crawler and the root layout adds noindex when this is false.
 *
 * Read from NEXT_PUBLIC_APP_URL itself rather than from SITE_URL, so a build
 * that never set it counts as a copy rather than inheriting the real site
 * through the fallback below.
 */
export const IS_CANONICAL_SITE =
  bareHost(CONFIGURED_URL) === bareHost(CANONICAL_SITE_URL);

/**
 * A page's one true address: always on the real site, never on the server that
 * happens to be serving it.
 */
export function canonicalUrl(path: string): string {
  return `${CANONICAL_SITE_URL}${path}`;
}

/**
 * The picture shown when a link is pasted into WhatsApp, LinkedIn or X, and
 * the one Google puts beside an article result. Never appears on the site
 * itself. 1200 by 630 pixels; anything else gets cropped by someone.
 *
 * A post can name its own with `image`; this is the fallback for the rest.
 */
export const SHARE_IMAGE = "/share-card.png";

/** Every picture we ship for the preview box is this size. */
export const SHARE_IMAGE_WIDTH = 1200;
export const SHARE_IMAGE_HEIGHT = 630;

/** What the fallback picture says, for a reader who cannot see it. */
export const SHARE_IMAGE_ALT =
  "Calibrate. AI agent evaluation for non-profits.";

/**
 * One picture for the preview box, with its size written out.
 *
 * The size is here because WhatsApp and LinkedIn draw the box before the
 * picture has finished downloading. Without the numbers they guess, and the
 * guess is a small square thumbnail rather than the wide banner. The words are
 * for a reader using a screen reader, who otherwise gets a bare file name.
 *
 * Pass a path to use a page's own picture, and words that describe it. Leave
 * both out for the site-wide one. The test in src/app/__tests__/seo.test.ts
 * reads the file itself and fails if the real size stops matching.
 */
export function shareImage(path: string = SHARE_IMAGE, alt = SHARE_IMAGE_ALT) {
  return {
    url: path,
    width: SHARE_IMAGE_WIDTH,
    height: SHARE_IMAGE_HEIGHT,
    alt,
  };
}

/**
 * Everything a page open to everyone needs: what it is called, what it says,
 * its one true address, and the box a pasted link gets.
 *
 * Written once because Next does not mix a page's title into a preview box it
 * inherited. A page that sets a title but no preview box of its own quietly
 * shows the home page's title, description and address instead. Learn and the
 * changelog did exactly that for months and nothing broke, which is why it went
 * unnoticed.
 *
 * Every page listed in PAGES in src/app/sitemap.ts is built from this, and the
 * test in src/app/__tests__/seo.test.ts fails if one of them is not.
 */
export function pageMetadata({
  path,
  title,
  description,
  image,
}: {
  path: string;
  title: string;
  description: string;
  /**
   * The page's own picture, as a path from the site root, for a page that has
   * one drawn for it. Leave it out to use the site-wide picture. Must be 1200
   * by 630, which the test in src/app/__tests__/seo.test.ts holds it to.
   */
  image?: string;
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: canonicalUrl(path) },
    openGraph: {
      type: "website",
      siteName: "Calibrate",
      title,
      description,
      url: canonicalUrl(path),
      // A page with its own picture is described by its own title, since that
      // is what the picture says. The rest fall back to the site-wide picture
      // and the words that go with it.
      images: [image ? shareImage(image, title) : shareImage()],
    },
  };
}
