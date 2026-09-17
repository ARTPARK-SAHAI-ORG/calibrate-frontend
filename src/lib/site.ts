import type { Metadata } from "next";

/**
 * The one address this site is meant to be found at.
 *
 * Anyone can copy this repo and put it on their own address, which
 * SELF_HOSTING.md tells them how to do. Every copy carries the same pages and
 * the same words, so a search engine sees several sites saying the same thing
 * and picks one of them to show. Ours is the one that should be shown, so
 * every other address asks search engines to leave it out. src/middleware.ts
 * is where that request is sent.
 *
 * Written here rather than read from NEXT_PUBLIC_APP_URL because a copy of the
 * site sets that to its own address, which is the very thing being caught.
 * Moving to a new address means changing this line with it, or our own site
 * disappears from search.
 */
export const CANONICAL_HOST = "calibrate.artpark.ai";

/**
 * Where the site lives, as an absolute address.
 *
 * Search engines need one, since robots.txt and sitemap.xml carry full
 * addresses rather than paths. Set NEXT_PUBLIC_APP_URL per environment; the
 * fallback is production, so a preview build with no value set points readers
 * at the real site rather than at a dead address.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL || `https://${CANONICAL_HOST}`
).replace(/\/$/, "");

/**
 * True when a request came in on the address above.
 *
 * The port is ignored, so a local server on the same name still counts, and
 * capitals are ignored because a browser may send any mix of them.
 */
export function isCanonicalHost(host: string | null | undefined): boolean {
  return host?.split(":")[0].toLowerCase() === CANONICAL_HOST;
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
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: "Calibrate",
      title,
      description,
      url: path,
      // A page with its own picture is described by its own title, since that
      // is what the picture says. The rest fall back to the site-wide picture
      // and the words that go with it.
      images: [image ? shareImage(image, title) : shareImage()],
    },
  };
}
