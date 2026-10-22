"use client";

import { useState } from "react";
import Link from "next/link";
import { getBackendUrl } from "@/lib/api";
import { storeLoginAndRedirect, withCallback } from "@/lib/postLoginRedirect";
import {
  AUTH_BUTTON_CLASS,
  AUTH_ERROR_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_BUTTON_LINK_CLASS,
  AuthCard,
  ButtonLoading,
  CONNECTION_ERROR,
  useAuthSearch,
} from "./AuthCard";

export function ResetPasswordForm() {
  const search = useAuthSearch();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    // Same rules as the signup page
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
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

  if (expired) {
    return (
      <AuthCard title="Reset password">
        <div className="space-y-6">
          <p className="text-center text-gray-600">
            This link has expired or was already used.
          </p>
          <Link
            href={withCallback("/forgot-password", search)}
            className={AUTH_BUTTON_LINK_CLASS}
          >
            Get a new reset link
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset password">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <div className={AUTH_ERROR_CLASS}>{error}</div>}
        <div>
          <label htmlFor="password" className={AUTH_LABEL_CLASS}>
            New password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            required
            className={AUTH_INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className={AUTH_LABEL_CLASS}>
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Type the new password again"
            required
            className={AUTH_INPUT_CLASS}
          />
        </div>
        <button type="submit" disabled={isLoading} className={AUTH_BUTTON_CLASS}>
          {isLoading ? <ButtonLoading text="Saving..." /> : "Save new password"}
        </button>
      </form>
    </AuthCard>
  );
}
