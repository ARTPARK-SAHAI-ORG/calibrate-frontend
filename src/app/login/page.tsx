"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { ErrorNote } from "@/components/ui";
import Link from "next/link";
import { getBackendUrl } from "@/lib/api";
import {
  nextForBackend,
  postLoginPath,
  storeLoginAndRedirect,
  withCallback,
} from "@/lib/postLoginRedirect";
import { PasswordInput } from "@/components/auth/PasswordFields";
import {
  AUTH_BUTTON_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_SECONDARY_BUTTON_CLASS,
  AuthCard,
  ButtonLoading,
  CONNECTION_ERROR,
  TextWithEmail,
} from "@/components/auth/AuthCard";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // The page a shared link pointed at, kept on the URL by the middleware
  const [authSearch, setAuthSearch] = useState("");

  useEffect(() => {
    document.title = "Login | Calibrate";

    // A failed Google sign-in lands back here with ?error=. Show a message and
    // drop the param so a reload does not keep it on screen.
    const params = new URLSearchParams(window.location.search);
    if (params.has("error")) {
      setError("Sign in with Google did not complete. Please try again.");
      params.delete("error");
      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}`,
      );
    }

    setAuthSearch(window.location.search);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Client-side validation matching backend requirements
    if (email.trim().length < 3) {
      setError("Email must be at least 3 characters");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${getBackendUrl()}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
          next: nextForBackend(window.location.search),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));

        // Handle specific HTTP status codes
        if (response.status === 401) {
          throw new Error("Invalid email or password");
        }
        // The password was right; the backend has just sent a new link
        if (response.status === 403 && data.detail === "email_not_verified") {
          throw new Error(
            `Your email is not verified yet. We sent a verification link to ${email.trim()}. Verify to sign in!`,
          );
        }
        if (response.status === 422) {
          // Validation error from backend
          const detail = data.detail;
          if (Array.isArray(detail)) {
            const messages = detail
              .map((err: { msg?: string }) => err.msg || "Validation error")
              .join(", ");
            throw new Error(messages);
          }
          throw new Error(data.detail || "Invalid input");
        }

        throw new Error(data.detail || data.message || "Login failed");
      }

      storeLoginAndRedirect(await response.json(), window.location.search);
    } catch (err) {
      if (err instanceof TypeError && err.message === "Failed to fetch") {
        setError(CONNECTION_ERROR);
      } else {
        setError(err instanceof Error ? err.message : "Login failed");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    signIn("google", { callbackUrl: postLoginPath(window.location.search) });
  };

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to continue to Calibrate"
      below={
        <p className="mt-4 text-center text-sm text-gray-600">
          Don&apos;t have an account?{" "}
          <Link
            href={withCallback("/signup", authSearch)}
            className="font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            Sign up
          </Link>
        </p>
      }
    >
      {/* Google Sign In */}
      <button
        onClick={handleGoogleSignIn}
        className={AUTH_SECONDARY_BUTTON_CLASS}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Continue with Google
      </button>

      {/* Divider */}
      <div className="relative my-8">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-white text-gray-500">
            or continue with email
          </span>
        </div>
      </div>

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <ErrorNote>
            <TextWithEmail text={error} email={email.trim()} />
          </ErrorNote>
        )}

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

        <div>
          <label htmlFor="password" className={AUTH_LABEL_CLASS}>
            Password
          </label>
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
          />
          <div className="mt-2 text-right text-sm">
            <Link
              href={withCallback("/forgot-password", authSearch)}
              className="font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className={AUTH_BUTTON_CLASS}
        >
          {isLoading ? <ButtonLoading text="Signing in..." /> : "Sign in"}
        </button>
      </form>

      {/* Terms */}
      <p className="mt-8 text-center text-xs text-gray-500">
        By signing in, you agree to our{" "}
        <Link
          href="https://docs.google.com/document/d/e/2PACX-1vR6h4w6CrrucGhf1LKrQZGQx6IzmoOTYgAlOvqFuaObeDtStMy5UC0kNT8z2efNEQ/pub"
          className="text-emerald-600 hover:text-emerald-700 underline"
        >
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link
          href="https://docs.google.com/document/d/e/2PACX-1vScdz5QUGyo_q4fBSAymagmoi55K8Ss77t2AcnsDYriYXp0LyM8GQ1Pnj3EDjrCUg/pub"
          className="text-emerald-600 hover:text-emerald-700 underline"
        >
          Privacy Policy
        </Link>
      </p>
    </AuthCard>
  );
}
