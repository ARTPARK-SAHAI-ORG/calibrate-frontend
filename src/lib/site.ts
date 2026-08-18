/**
 * Where the site lives, as an absolute address.
 *
 * Search engines need one, since robots.txt and sitemap.xml carry full
 * addresses rather than paths. Set NEXT_PUBLIC_APP_URL per environment; the
 * fallback is production, so a preview build with no value set points readers
 * at the real site rather than at a dead address.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://calibrate.artpark.ai"
).replace(/\/$/, "");

/**
 * The picture shown when a link is pasted into WhatsApp, LinkedIn or X, and
 * the one Google puts beside an article result. Never appears on the site
 * itself. 1200 by 630 pixels; anything else gets cropped by someone.
 *
 * A post can name its own with `image`; this is the fallback for the rest.
 */
export const SHARE_IMAGE = "/share-card.png";
