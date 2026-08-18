/**
 * Runs the test that imports it as the hosted site.
 *
 * A build with no NEXT_PUBLIC_APP_URL counts as a copy of the hosted site and
 * asks search engines to skip it (IS_CANONICAL_SITE in src/lib/site.ts). That
 * value is read once, when the file is first loaded, so this has to be set
 * before anything that reads it: import this first, above every other import.
 */
process.env.NEXT_PUBLIC_APP_URL ||= "https://calibrate.artpark.ai";
