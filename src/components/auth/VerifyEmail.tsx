"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getBackendUrl } from "@/lib/api";
import { ErrorNote } from "@/components/ui";
import { storeLoginAndRedirect, withCallback } from "@/lib/postLoginRedirect";
import {
  AUTH_BUTTON_CLASS,
  AUTH_BUTTON_LINK_CLASS,
  AuthCard,
  AuthCardLoading,
  ButtonLoading,
  CONNECTION_ERROR,
  LinkSentCard,
  useAuthSearch,
  useSendNewLink,
} from "./AuthCard";

type State =
  | { kind: "verifying" }
  // Too old, used, or replaced by a newer link: it can ask for a new one
  | { kind: "expired" }
  | { kind: "verified" }
  | { kind: "failed"; message: string };

export const VERIFY_EXPIRED = "This link has expired. Request a new verification link.";
const FAILED = "Could not verify your email. Please open the link again.";

export function VerifyEmail() {
  const [state, setState] = useState<State>({ kind: "verifying" });
  // Kept so the sign in button and a new link still lead back to an invite
  const search = useAuthSearch();
  const token = new URLSearchParams(search).get("token");
  const newLink = useSendNewLink("/auth/resend-verification");
  // The link works once, so a second request (React runs effects twice in
  // development) would turn a verified email into an error on screen.
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const token = new URLSearchParams(window.location.search).get("token");
    const answer = token
      ? fetch(`${getBackendUrl()}/auth/verify-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })
      : Promise.resolve(null);
    answer
      .then(async (response) => {
        if (!response) {
          setState({ kind: "expired" });
          return;
        }
        if (response.ok) {
          storeLoginAndRedirect(await response.json(), window.location.search);
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
    if ((await newLink.send(token ?? "", search)) === "already_verified") {
      setState({ kind: "verified" });
    }
  };

  if (state.kind === "verifying") {
    return <AuthCardLoading title="Verifying your email" label="Verifying your email" />;
  }

  if (newLink.sentTo) {
    return (
      <LinkSentCard
        title="Verification email sent"
        text={`We sent a new link to ${newLink.sentTo}. Click it to verify your email, then you can sign in.`}
        email={newLink.sentTo}
      />
    );
  }

  if (state.kind === "expired") {
    return (
      <AuthCard title="Verify your email">
        <div className="space-y-6">
          <p className="text-gray-600">{VERIFY_EXPIRED}</p>
          {newLink.error && <ErrorNote>{newLink.error}</ErrorNote>}
          <button
            type="button"
            onClick={resend}
            disabled={newLink.sending}
            className={AUTH_BUTTON_CLASS}
          >
            {newLink.sending ? <ButtonLoading text="Sending..." /> : "Send verification email"}
          </button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Verify your email">
      <div className="space-y-6">
        <p className="text-gray-600">
          {state.kind === "verified" ? "Your email is already verified." : state.message}
        </p>
        <Link href={withCallback("/login", search)} className={AUTH_BUTTON_LINK_CLASS}>
          Sign in
        </Link>
      </div>
    </AuthCard>
  );
}
