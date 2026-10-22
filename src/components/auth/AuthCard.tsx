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
export const AUTH_LINK_CLASS =
  "font-medium text-emerald-600 hover:text-emerald-700 transition-colors";

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
  children,
}: {
  title: string;
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
