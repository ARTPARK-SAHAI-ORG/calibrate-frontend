/**
 * Where the workspace lives in the address.
 *
 * Every page behind sign-in sits under the workspace it belongs to:
 *
 *   /8f3c1a2b-4d5e-.../agents
 *   /8f3c1a2b-4d5e-.../simulations/<id>/runs/<id>
 *
 * That makes a link mean one exact thing, so opening someone else's link no
 * longer depends on which workspace the reader happens to be sitting in.
 *
 * The landing page, login, signup, the shared result pages under /public and
 * the annotate links carry no workspace: they are readable without an account,
 * and they already carry their own token.
 *
 * A workspace id is always a uuid, so the first part of the address tells the
 * two apart with no list to keep in sync: a uuid means the address already
 * names its workspace, anything else means an older link that predates this.
 */

/** Matches a workspace id, which is always a uuid. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Addresses that never carry a workspace. */
const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/public/",
  "/annotate-job/",
  "/api/",
  "/terms",
  "/privacy",
  "/changelog",
  "/blog",
  "/docs",
  "/debug",
  "/about",
];

/**
 * The sections with a list page of their own. Switching workspace from a
 * detail page lands on the list page for the section the user was in, since
 * the item they were looking at belongs to the workspace they just left.
 * Anything else falls back to /agents, which every workspace has.
 */
export const SECTION_LIST_PAGES = new Set([
  "agent-evaluators",
  "agents",
  "evaluators",
  "human-alignment",
  "personas",
  "scenarios",
  "simulation-evaluators",
  "simulations",
  "stt",
  "tests",
  "tools",
  "tts",
]);

/** The page every workspace can show. */
export const HOME_PATH = "/agents";

/**
 * Just the page part, without the query or the part after "#". Every check
 * below has to ignore those: "/login?callbackUrl=/agents" is the sign-in page
 * and must be treated as one.
 */
function pagePart(path: string): string {
  const cut = path.search(/[?#]/);
  return cut === -1 ? path : path.slice(0, cut);
}

/** True for an address that must never gain a workspace. */
export function isPublicPath(path: string): boolean {
  const page = pagePart(path);
  if (page === "/") return true;
  return PUBLIC_PREFIXES.some(
    (p) => page === p || page.startsWith(p.endsWith("/") ? p : `${p}/`),
  );
}

/**
 * Split an address into the workspace it names and the rest. `org` is null
 * when the address names no workspace.
 */
export function splitWorkspace(path: string): {
  org: string | null;
  path: string;
} {
  const first = pagePart(path).split("/")[1] ?? "";
  if (!UUID.test(first)) return { org: null, path };
  // Lower case, because every workspace id the backend gives out is, and the
  // places that compare one match character for character.
  const org = first.toLowerCase();
  // What is left after the workspace. A workspace on its own leaves nothing,
  // or just a query, so put the leading slash back.
  const rest = path.slice(first.length + 1);
  return { org, path: rest.startsWith("/") ? rest : `/${rest}` };
}

/** The workspace an address names, or null. */
export function orgFromPath(path: string): string | null {
  return splitWorkspace(path).org;
}

/**
 * Put `org` in front of an address. Leaves it alone when there is no
 * workspace to add, when the address is public, when it already names a
 * workspace, or when it points at another site.
 */
export function withWorkspace(path: string, org: string | null): string {
  if (!org || !path.startsWith("/")) return path;
  if (isPublicPath(path)) return path;
  if (splitWorkspace(path).org) return path;
  return `/${org}${path}`;
}

/**
 * The list page to land on when the workspace changes, given where the user
 * is now (an address with no workspace in it).
 */
export function landingPathAfterSwitch(path: string): string {
  const section = path.split("/")[1] ?? "";
  if (section === "workspace-settings") return "/workspace-settings";
  return SECTION_LIST_PAGES.has(section) ? `/${section}` : HOME_PATH;
}
