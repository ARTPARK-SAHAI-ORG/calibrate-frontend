"use client";

import { useEffect, useState } from "react";
import { getBackendUrl } from "@/lib/api";
import { ErrorNote } from "@/components/ui";
import { storeLoginAndRedirect } from "@/lib/postLoginRedirect";
import {
  AUTH_BUTTON_CLASS,
  AuthCard,
  AuthCardLoading,
  ButtonLoading,
  CONNECTION_ERROR,
  LinkSentCard,
  useAuthSearch,
  useSendNewLink,
} from "./AuthCard";
import { NewPasswordFields } from "./PasswordFields";

export const RESET_EXPIRED =
  "This link has expired. Request a new password verification link.";

export function ResetPasswordForm() {
  const search = useAuthSearch();
  const token = new URLSearchParams(search).get("token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  // Whether the link still works is asked before the boxes are shown
  const [checking, setChecking] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const newLink = useSendNewLink("/auth/resend-reset");

  useEffect(() => {
    // Read from the address itself: on the first pass `search` is still empty
    const token = new URLSearchParams(window.location.search).get("token");
    // No token at all reads the same as an expired link
    const isExpired = token
      ? fetch(`${getBackendUrl()}/auth/check-reset-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })
          .then((response) => response.status === 400)
          // Could not ask: show the boxes, and saving says what went wrong
          .catch(() => false)
      : Promise.resolve(true);
    isExpired.then((value) => {
      setExpired(value);
      setChecking(false);
    });
  }, []);

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
    return <AuthCardLoading title="Reset password" label="Checking the link" />;
  }

  if (newLink.sentTo) {
    return (
      <LinkSentCard
        title="Reset email sent"
        text={`We sent a new link to ${newLink.sentTo}. Click it to choose a new password.`}
        email={newLink.sentTo}
      />
    );
  }

  if (expired) {
    return (
      <AuthCard title="Reset password">
        <div className="space-y-6">
          <p className="text-gray-600">{RESET_EXPIRED}</p>
          {newLink.error && <ErrorNote>{newLink.error}</ErrorNote>}
          <button
            type="button"
            onClick={() => newLink.send(token ?? "", search)}
            disabled={newLink.sending}
            className={AUTH_BUTTON_CLASS}
          >
            {newLink.sending ? <ButtonLoading text="Sending..." /> : "Send reset link"}
          </button>
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
