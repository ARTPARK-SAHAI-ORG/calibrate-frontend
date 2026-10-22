"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getBackendUrl } from "@/lib/api";
import { storeLoginAndRedirect } from "@/lib/postLoginRedirect";
import { AUTH_LINK_CLASS, AuthCard, CONNECTION_ERROR } from "./AuthCard";

const EXPIRED =
  "This link has expired or was already used. Log in to get a new one.";

export function VerifyEmail() {
  const [error, setError] = useState("");
  // The link works once, so a second request (React runs effects twice in
  // development) would turn a confirmed email into an error on screen.
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const search = window.location.search;
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
        if (!response?.ok) {
          setError(EXPIRED);
          return;
        }
        storeLoginAndRedirect(await response.json(), search);
      })
      .catch(() => setError(CONNECTION_ERROR));
  }, []);

  if (!error) {
    return (
      <AuthCard title="Confirming your email">
        <div className="flex justify-center" role="status" aria-label="Confirming your email">
          <svg className="animate-spin h-6 w-6 text-gray-500" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Confirm your email">
      <p className="text-center text-gray-600">{error}</p>
      <p className="mt-6 text-center text-sm text-gray-600">
        <Link href="/login" className={AUTH_LINK_CLASS}>
          Go to log in
        </Link>
      </p>
    </AuthCard>
  );
}
