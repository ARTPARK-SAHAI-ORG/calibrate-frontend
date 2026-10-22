"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getBackendUrl } from "@/lib/api";
import { ErrorNote } from "@/components/ui";
import {
  nextForBackend,
  storeLoginAndRedirect,
  withCallback,
} from "@/lib/postLoginRedirect";
import {
  AUTH_BUTTON_CLASS,
  AUTH_BUTTON_LINK_CLASS,
  AuthCard,
  ButtonLoading,
  CONNECTION_ERROR,
  SentTick,
  TextWithEmail,
  useAuthSearch,
} from "./AuthCard";
import { NewPasswordFields } from "./PasswordFields";

export function ResetPasswordForm() {
  const search = useAuthSearch();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  // Whether the link still works is asked before the boxes are shown
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setExpired(true);
      setChecking(false);
      return;
    }
    fetch(`${getBackendUrl()}/auth/check-reset-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((response) => {
        if (response.status === 400) setExpired(true);
      })
      // Could not ask: show the boxes, and saving says what went wrong
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);
  const [isLoading, setIsLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState("");
  const [sentTo, setSentTo] = useState("");

  const resend = async (email: string) => {
    setResendError("");
    setResending(true);
    try {
      const response = await fetch(`${getBackendUrl()}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, next: nextForBackend(search) }),
      });
      if (response.ok) setSentTo(email);
      else setResendError("Could not send a new link. Please try again.");
    } catch {
      setResendError(CONNECTION_ERROR);
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    // Same rules as the signup page
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    // The box itself already says the two do not match
    if (password !== confirmPassword) return;
    const token = new URLSearchParams(search).get("token");
    if (!token) {
      setExpired(true);
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`${getBackendUrl()}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (response.status === 400) {
        setExpired(true);
      } else if (response.status === 422) {
        setError("Password must be at least 6 characters");
      } else if (!response.ok) {
        setError("Could not save the new password. Please try again.");
      } else {
        // Stays in its loading state while the page moves on
        storeLoginAndRedirect(await response.json(), search);
        return;
      }
    } catch {
      setError(CONNECTION_ERROR);
    }
    setIsLoading(false);
  };

  if (checking) {
    return (
      <AuthCard title="Reset password">
        <div className="flex justify-center" role="status" aria-label="Checking the link">
          <svg className="animate-spin h-6 w-6 text-gray-500" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </AuthCard>
    );
  }

  if (sentTo) {
    return (
      <AuthCard title="Reset email sent" icon={<SentTick />}>
        <p className="text-gray-600">
          <TextWithEmail
            text={`We sent a new link to ${sentTo}. Click it to choose a new password.`}
            email={sentTo}
          />
        </p>
      </AuthCard>
    );
  }

  if (expired) {
    // A link carries its address, so a new one is sent without typing it
    const email = new URLSearchParams(search).get("email");
    return (
      <AuthCard title="Reset password">
        <div className="space-y-6">
          <p className="text-gray-600">
            This link has expired. Request a new password verification link.
          </p>
          {resendError && <ErrorNote>{resendError}</ErrorNote>}
          {email ? (
            <button
              type="button"
              onClick={() => resend(email)}
              disabled={resending}
              className={AUTH_BUTTON_CLASS}
            >
              {resending ? <ButtonLoading text="Sending..." /> : "Send reset link"}
            </button>
          ) : (
            <Link
              href={withCallback("/forgot-password", search)}
              className={AUTH_BUTTON_LINK_CLASS}
            >
              Send reset link
            </Link>
          )}
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset password">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <ErrorNote>{error}</ErrorNote>}
        <NewPasswordFields
          password={password}
          onPasswordChange={setPassword}
          confirmPassword={confirmPassword}
          onConfirmPasswordChange={setConfirmPassword}
        />
        <button type="submit" disabled={isLoading} className={AUTH_BUTTON_CLASS}>
          {isLoading ? <ButtonLoading text="Saving..." /> : "Save new password"}
        </button>
      </form>
    </AuthCard>
  );
}
