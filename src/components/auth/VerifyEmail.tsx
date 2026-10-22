"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getBackendUrl } from "@/lib/api";
import {
  nextForBackend,
  storeLoginAndRedirect,
  withCallback,
} from "@/lib/postLoginRedirect";
import {
  AUTH_BUTTON_CLASS,
  AUTH_BUTTON_LINK_CLASS,
  AUTH_ERROR_CLASS,
  AuthCard,
  ButtonLoading,
  CONNECTION_ERROR,
  SentTick,
} from "./AuthCard";

type State =
  | { kind: "verifying" }
  // Too old, used, or replaced by a newer link: it can ask for a new one
  | { kind: "expired" }
  | { kind: "verified" }
  | { kind: "failed"; message: string }
  | { kind: "sent"; email: string };

const EXPIRED = "This link has expired. Request a new verification link.";
const FAILED = "Could not verify your email. Please open the link again.";

export function VerifyEmail() {
  const [state, setState] = useState<State>({ kind: "verifying" });
  // Kept so the sign in button and a new link still lead back to an invite
  const [search, setSearch] = useState("");
  // The address the link was sent to, which a new link is sent to
  const [email, setEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState("");
  // The link works once, so a second request (React runs effects twice in
  // development) would turn a verified email into an error on screen.
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const search = window.location.search;
    setSearch(search);
    const params = new URLSearchParams(search);
    const token = params.get("token");
    const address = params.get("email") ?? "";
    setEmail(address);
    if (!token) {
      setState({ kind: "expired" });
      return;
    }
    fetch(`${getBackendUrl()}/auth/verify-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(address ? { token, email: address } : { token }),
    })
      .then(async (response) => {
        if (response.ok) {
          storeLoginAndRedirect(await response.json(), search);
          return;
        }
        if (response.status !== 400) {
          setState({ kind: "failed", message: FAILED });
          return;
        }
        const data = await response.json().catch(() => ({}));
        setState({ kind: data.detail === "already_verified" ? "verified" : "expired" });
      })
      .catch(() => setState({ kind: "failed", message: CONNECTION_ERROR }));
  }, []);

  const resend = async () => {
    setResendError("");
    setResending(true);
    try {
      const response = await fetch(`${getBackendUrl()}/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, next: nextForBackend(search) }),
      });
      if (!response.ok) {
        setResendError("Could not send a new link. Please try again.");
      } else {
        setState({ kind: "sent", email: (await response.json()).email });
      }
    } catch {
      setResendError(CONNECTION_ERROR);
    } finally {
      setResending(false);
    }
  };

  const signIn = (
    <Link href={withCallback("/login", search)} className={AUTH_BUTTON_LINK_CLASS}>
      Sign in
    </Link>
  );

  if (state.kind === "verifying") {
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

  if (state.kind === "sent") {
    return (
      <AuthCard title="Verification email sent" icon={<SentTick />}>
        <p className="text-center text-gray-600">
          We sent a new link to {state.email}. Click it to verify your email,
          then you can sign in.
        </p>
      </AuthCard>
    );
  }

  // A link sent before links carried the address cannot ask for a new one;
  // signing in with the password sends one instead.
  if (state.kind === "expired" && email) {
    return (
      <AuthCard title="Verify your email">
        <div className="space-y-6">
          <p className="text-center text-gray-600">{EXPIRED}</p>
          {resendError && <div className={AUTH_ERROR_CLASS}>{resendError}</div>}
          <button
            type="button"
            onClick={resend}
            disabled={resending}
            className={AUTH_BUTTON_CLASS}
          >
            {resending ? <ButtonLoading text="Sending..." /> : "Send verification email"}
          </button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Verify your email">
      <div className="space-y-6">
        <p className="text-center text-gray-600">
          {state.kind === "verified"
            ? "Your email is already verified."
            : state.kind === "expired"
              ? "This link has expired. Sign in to get a new verification link."
              : state.message}
        </p>
        {signIn}
      </div>
    </AuthCard>
  );
}
