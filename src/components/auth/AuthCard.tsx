"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";

// The same classes the login and signup pages use, so the account pages
// opened from an email read as part of the same set.
export const AUTH_INPUT_CLASS =
  "w-full px-4 py-3 rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200";
export const AUTH_LABEL_CLASS = "block text-sm font-medium text-gray-700 mb-2";
export const AUTH_BUTTON_CLASS =
  "w-full py-3 px-4 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
export const AUTH_ERROR_CLASS =
  "p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm";
// The login page's "Continue with Google" button, for the second action on a card
export const AUTH_SECONDARY_BUTTON_CLASS =
  "w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 cursor-pointer";
// A link that does a card's main action, drawn as the main button
export const AUTH_BUTTON_LINK_CLASS = `${AUTH_BUTTON_CLASS} block text-center`;

export const CONNECTION_ERROR =
  "Unable to connect to server. Please try again later.";

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

/** The page frame of the login page: logo bar, then one centred card. */
export function AuthCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
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

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 p-8 md:p-10">
            <div className="text-center mb-8">
              {icon && <div className="flex justify-center mb-4">{icon}</div>}
              <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-2">
                {title}
              </h1>
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The login button's loading state: spinner and text, copied from the login page */
export function ButtonLoading({ text }: { text: string }) {
  return (
    <span className="flex items-center justify-center gap-2">
      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      {text}
    </span>
  );
}

/** A green tick, shown above a card that says an email went out */
export function SentTick() {
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
