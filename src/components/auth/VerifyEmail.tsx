"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getBackendUrl } from "@/lib/api";
import { storeLoginAndRedirect, withCallback } from "@/lib/postLoginRedirect";
import { AUTH_LINK_CLASS, AuthCard, CONNECTION_ERROR } from "./AuthCard";

const EXPIRED =
  "This link has expired or was already used. Sign in to get a new one.";
const FAILED = "Could not verify your email. Please open the link again.";

export function VerifyEmail() {
  const [error, setError] = useState("");
  // Kept so the sign in link still leads back to an invite after an expired link
  const [search, setSearch] = useState("");
  // The link works once, so a second request (React runs effects twice in
  // development) would turn a verified email into an error on screen.
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const search = window.location.search;
    setSearch(search);
    const token = new URLSearchParams(search).get("token");
    // No token reads the same as a used one, without asking the backend
    const request = token
      ? fetch(`${getBackendUrl()}/auth/verify-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })
      : Promise.resolve(null);
    request
      .then(async (response) => {
        if (!response || response.status === 400) {
          setError(EXPIRED);
          return;
        }
        if (!response.ok) {
          setError(FAILED);
          return;
        }
        storeLoginAndRedirect(await response.json(), search);
      })
      .catch(() => setError(CONNECTION_ERROR));
  }, []);

  if (!error) {
    return (
      <AuthCard title="Verifying your email">
        <div className="flex justify-center" role="status" aria-label="Verifying your email">
          <svg className="animate-spin h-6 w-6 text-gray-500" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Verify your email">
      <p className="text-center text-gray-600">{error}</p>
      <p className="mt-6 text-center text-sm text-gray-600">
        <Link href={withCallback("/login", search)} className={AUTH_LINK_CLASS}>
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
