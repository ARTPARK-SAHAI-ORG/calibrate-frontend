import { auth } from "@/auth";
import { NextResponse, type NextRequest } from "next/server";
import { CALLBACK_PARAM, safeCallbackUrl } from "@/lib/postLoginRedirect";
import { isPublicPath, orgFromPath } from "@/lib/routes";
import { OPENING_PATH } from "@/lib/opening";
import { isCanonicalHost } from "@/lib/site";

// Set MAINTENANCE_MODE=true in .env.local to show maintenance page at /
const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === "true";

export default auth((req) => {
  const response = route(req);
  // A copy of this site served from any other address asks search engines to
  // leave it out, so only ours appears in results. Google and Bing read this
  // header the same way they read a noindex tag on the page itself. See
  // CANONICAL_HOST in src/lib/site.ts for why a copy exists at all.
  if (!isCanonicalHost(req.headers.get("host"))) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
});

/** Which page a request is answered with. */
function route(req: NextRequest & { auth: unknown }): NextResponse {
  const isHomePage = req.nextUrl.pathname === "/";
  const isApiRoute = req.nextUrl.pathname.startsWith("/api/");

  // Maintenance mode: redirect all non-API routes to /
  if (MAINTENANCE_MODE) {
    if (isHomePage || isApiRoute) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Legacy marketing URL: standalone About page removed; vision & team live on `/` (#about-calibrate)
  if (req.nextUrl.pathname === "/about") {
    return NextResponse.redirect(new URL("/#about-calibrate", req.url));
  }

  const isAuthRoute = req.nextUrl.pathname.startsWith("/api/auth");
  const isDebugRoute =
    req.nextUrl.pathname.startsWith("/debug") ||
    req.nextUrl.pathname.startsWith("/api/debug");
  const isDocsRoute = req.nextUrl.pathname.startsWith("/docs");
  const isTermsPage = req.nextUrl.pathname === "/terms";
  const isPrivacyPage = req.nextUrl.pathname === "/privacy";
  const isChangelogPage = req.nextUrl.pathname === "/changelog";
  const isLearnPage = req.nextUrl.pathname === "/learn";
  const isBlogRoute = req.nextUrl.pathname.startsWith("/blog");
  // Without this the crawler asks for the sitemap and is handed the login page.
  const isCrawlerFile =
    req.nextUrl.pathname === "/robots.txt" ||
    req.nextUrl.pathname === "/sitemap.xml";
  const isPublicShareRoute = req.nextUrl.pathname.startsWith("/public/");
  const isAnnotateJobRoute = req.nextUrl.pathname.startsWith("/annotate-job/");

  // Allow public pages: landing page, auth API, debug, docs, terms, privacy, changelog, learn, blog, robots.txt and sitemap.xml, public share links, annotate-job links
  if (isHomePage || isAuthRoute || isDebugRoute || isDocsRoute || isTermsPage || isPrivacyPage || isChangelogPage || isLearnPage || isBlogRoute || isCrawlerFile || isPublicShareRoute || isAnnotateJobRoute) {
    return NextResponse.next();
  }

  // Check for authentication via NextAuth session OR JWT cookie
  const hasNextAuthSession = !!req.auth;
  const hasJwtCookie = !!req.cookies.get("access_token")?.value;
  const isLoggedIn = hasNextAuthSession || hasJwtCookie;

  const isLoginPage = req.nextUrl.pathname === "/login";
  const isSignupPage = req.nextUrl.pathname === "/signup";
  const isAuthPage = isLoginPage || isSignupPage;

  // Redirect logged-in users away from login/signup pages, to the page they asked for
  if (isAuthPage && isLoggedIn) {
    const wanted = safeCallbackUrl(req.nextUrl.searchParams.get(CALLBACK_PARAM));
    return NextResponse.redirect(new URL(wanted, req.url));
  }

  // Redirect unauthenticated users to login page (except for auth pages),
  // remembering the page they asked for so a shared link survives signing in
  if (!isAuthPage && !isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set(
      CALLBACK_PARAM,
      req.nextUrl.pathname + req.nextUrl.search
    );
    return NextResponse.redirect(loginUrl);
  }

  // An address that does not name a workspace: a link made before workspaces
  // were part of the address, or the page someone lands on after signing in.
  // Show the opening page in its place, which works out the workspace and puts
  // it in the address. This is a swap, not a jump, so the address the person
  // typed stays on screen until the real one replaces it.
  if (
    !isPublicPath(req.nextUrl.pathname) &&
    req.nextUrl.pathname !== OPENING_PATH &&
    !orgFromPath(req.nextUrl.pathname)
  ) {
    return NextResponse.rewrite(new URL(OPENING_PATH, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
