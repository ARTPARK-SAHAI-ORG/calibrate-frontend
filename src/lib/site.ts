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
