"use client";

import { useState } from "react";
import Link from "next/link";
import { getBackendUrl } from "@/lib/api";
import { nextForBackend, withCallback } from "@/lib/postLoginRedirect";
import {
  AUTH_BUTTON_CLASS,
  AUTH_ERROR_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_LINK_CLASS,
  AuthCard,
  ButtonLoading,
  CONNECTION_ERROR,
  useAuthSearch,
} from "./AuthCard";

export function ForgotPasswordForm() {
  const search = useAuthSearch();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    const address = email.trim();
    try {
      // The backend answers the same whether or not the account exists, so
      // the page never says which addresses have one.
      const response = await fetch(`${getBackendUrl()}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: address,
          next: nextForBackend(search),
        }),
      });
      if (!response.ok) {
        setError("Could not send the link. Please try again.");
        return;
      }
      setSentTo(address);
    } catch {
      setError(CONNECTION_ERROR);
    } finally {
      setIsLoading(false);
    }
  };

  const loginLink = (
    <p className="mt-6 text-center text-sm text-gray-600">
      <Link
        href={withCallback("/login", search)}
        className={AUTH_LINK_CLASS}
      >
        Back to sign in
      </Link>
    </p>
  );

  if (sentTo) {
    return (
      <AuthCard title="Check your email">
        <p className="text-center text-gray-600">
          If an account exists for {sentTo}, we sent a link to reset your
          password. The link works for 1 hour.
        </p>
        {loginLink}
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Forgot password">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <div className={AUTH_ERROR_CLASS}>{error}</div>}
        <div>
          <label htmlFor="email" className={AUTH_LABEL_CLASS}>
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            required
            className={AUTH_INPUT_CLASS}
          />
        </div>
        <button type="submit" disabled={isLoading} className={AUTH_BUTTON_CLASS}>
          {isLoading ? <ButtonLoading text="Sending..." /> : "Send reset link"}
        </button>
      </form>
      {loginLink}
    </AuthCard>
  );
}
