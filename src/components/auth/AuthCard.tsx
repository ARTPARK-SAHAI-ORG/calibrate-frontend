"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { getBackendUrl } from "@/lib/api";
import { nextForBackend } from "@/lib/postLoginRedirect";
import { SpinnerIcon } from "@/components/icons";

// The same classes the login and signup pages use, so the account pages
// opened from an email read as part of the same set.
export const AUTH_INPUT_CLASS =
  "w-full px-4 py-3 rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200";
export const AUTH_LABEL_CLASS = "block text-sm font-medium text-gray-700 mb-2";
export const AUTH_BUTTON_CLASS =
  "w-full py-3 px-4 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
// The login page's "Continue with Google" button, for the second action on a card
export const AUTH_SECONDARY_BUTTON_CLASS =
  "w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 cursor-pointer";
// A link that does a card's main action, drawn as the main button
export const AUTH_BUTTON_LINK_CLASS = `${AUTH_BUTTON_CLASS} block text-center`;

export const CONNECTION_ERROR =
  "Unable to connect to server. Please try again later.";
const RESEND_FAILED = "Could not send a new link. Please try again.";

const noSubscribe = () => () => {};

/**
 * The query string of the page, empty while drawn on the server so the
 * server and the browser start from the same thing. Carries callbackUrl along.
 */
export function useAuthSearch(): string {
  return useSyncExternalStore(
    noSubscribe,
    () => window.location.search,
    () => "",
  );
}

/**
 * The page frame every account page shares: logo bar, then one card just under
 * it. `below` sits under the card, such as the "Sign up" line on login.
 */
export function AuthCard({
  title,
  subtitle,
  icon,
  wide,
  below,
  children,
}: {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  wide?: boolean;
  below?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 flex flex-col"
      style={{
        fontFamily: "var(--font-dm-sans), system-ui, -apple-system, sans-serif",
      }}
    >
      <nav className="flex items-center justify-between px-6 md:px-8 py-4">
        <Link href="/" className="flex items-center gap-2">
          <img
            src="/logo.svg"
            alt="Calibrate Logo"
            className="w-7 h-7 md:w-8 md:h-8"
          />
          <span className="text-lg md:text-xl font-bold tracking-tight text-gray-900">
            Calibrate
          </span>
        </Link>
      </nav>

      <div className="flex-1 flex items-start justify-center px-4 pb-8">
        <div className={`w-full ${wide ? "max-w-lg" : "max-w-md"}`}>
          <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-8 md:p-10">
            {title && (
              <div className="text-center mb-8">
                {icon && <div className="flex justify-center mb-4">{icon}</div>}
                <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-2">
                  {title}
                </h1>
                {subtitle && <p className="text-gray-500">{subtitle}</p>}
              </div>
            )}
            {children}
          </div>
          {below}
        </div>
      </div>
    </div>
  );
}

/** A card that only says something is being asked, with a spinner */
export function AuthCardLoading({ title, label }: { title: string; label: string }) {
  return (
    <AuthCard title={title}>
      <div className="flex justify-center" role="status" aria-label={label}>
        <SpinnerIcon className="animate-spin h-6 w-6 text-gray-500" />
      </div>
    </AuthCard>
  );
}

/** A button's loading state: spinner and text */
export function ButtonLoading({ text }: { text: string }) {
  return (
    <span className="flex items-center justify-center gap-2">
      <SpinnerIcon className="animate-spin h-5 w-5" />
      {text}
    </span>
  );
}

/**
 * Asks the backend for a new link from an expired one. The link's token is all
 * it needs: the backend works out the account and answers with its address.
 */
export function useSendNewLink(path: string) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");

  /** Resolves to the backend's reason when it refuses, so a page can act on it */
  const send = async (token: string, search: string) => {
    setError("");
    setSending(true);
    try {
      const response = await fetch(`${getBackendUrl()}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, next: nextForBackend(search) }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setSentTo(data.email);
        return undefined;
      }
      setError(RESEND_FAILED);
      return data.detail as string | undefined;
    } catch {
      setError(CONNECTION_ERROR);
    } finally {
      setSending(false);
    }
  };

  return { send, sending, error, sentTo };
}

/** The card shown once a new link went out */
export function LinkSentCard({
  title,
  text,
  email,
}: {
  title: string;
  text: string;
  email: string;
}) {
  return (
    <AuthCard title={title} icon={<SentTick />}>
      <p className="text-gray-600">
        <TextWithEmail text={text} email={email} />
      </p>
    </AuthCard>
  );
}

/** A green tick, shown above a card that says an email went out */
function SentTick() {
  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
      <svg className="h-6 w-6 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    </span>
  );
}

/**
 * A sentence with an email address in it. The address may break at any point,
 * so a long one wraps with the sentence instead of jumping to a line of its own.
 */
export function TextWithEmail({ text, email }: { text: string; email: string }) {
  const at = email ? text.indexOf(email) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <span className="break-all">{email}</span>
      {text.slice(at + email.length)}
    </>
  );
}
