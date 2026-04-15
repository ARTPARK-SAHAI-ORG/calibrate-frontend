import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Set MAINTENANCE_MODE=true in .env.local to show maintenance page at /
const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === "true";

export default auth((req) => {
  const isHomePage = req.nextUrl.pathname === "/";
  const isApiRoute = req.nextUrl.pathname.startsWith("/api/");

  // Maintenance mode: redirect all non-API routes to /
  if (MAINTENANCE_MODE) {
    if (isHomePage || isApiRoute) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/", req.url));
  }

  const isAuthRoute = req.nextUrl.pathname.startsWith("/api/auth");
  const isDebugRoute =
    req.nextUrl.pathname.startsWith("/debug") ||
    req.nextUrl.pathname.startsWith("/api/debug");
  const isDocsRoute = req.nextUrl.pathname.startsWith("/docs");
  const isAboutPage = req.nextUrl.pathname === "/about";
  const isTermsPage = req.nextUrl.pathname === "/terms";
  const isPrivacyPage = req.nextUrl.pathname === "/privacy";
  const isPublicShareRoute = req.nextUrl.pathname.startsWith("/public/");

  // Allow public pages: landing page, auth API, debug, docs, about, terms, privacy, public share links
  if (isHomePage || isAuthRoute || isDebugRoute || isDocsRoute || isAboutPage || isTermsPage || isPrivacyPage || isPublicShareRoute) {
    return NextResponse.next();
  }

  // Check for authentication via NextAuth session OR JWT cookie
  const hasNextAuthSession = !!req.auth;
  const hasJwtCookie = !!req.cookies.get("access_token")?.value;
  const isLoggedIn = hasNextAuthSession || hasJwtCookie;

  const isLoginPage = req.nextUrl.pathname === "/login";
  const isSignupPage = req.nextUrl.pathname === "/signup";
  const isAuthPage = isLoginPage || isSignupPage;

  // Redirect logged-in users away from login/signup pages
  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/agents", req.url));
  }

  // Redirect unauthenticated users to login page (except for auth pages)
  if (!isAuthPage && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
