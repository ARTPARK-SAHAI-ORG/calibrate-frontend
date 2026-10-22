"use client";

import { useMemo, useState } from "react";

type PasswordStrength = "weak" | "fair" | "good" | "strong";

function getPasswordStrength(password: string): {
  strength: PasswordStrength;
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  if (password.length === 0) {
    return { strength: "weak", score: 0, feedback: [] };
  }

  // Length checks
  if (password.length >= 8) score += 1;
  else feedback.push("At least 8 characters");

  if (password.length >= 12) score += 1;

  // Character type checks
  if (/[a-z]/.test(password)) score += 1;
  else feedback.push("Lowercase letter");

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push("Uppercase letter");

  if (/[0-9]/.test(password)) score += 1;
  else feedback.push("Number");

  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  else feedback.push("Special character (!@#$%^&*)");

  let strength: PasswordStrength;
  if (score <= 2) strength = "weak";
  else if (score <= 3) strength = "fair";
  else if (score <= 4) strength = "good";
  else strength = "strong";

  return { strength, score, feedback };
}

const strengthColors: Record<PasswordStrength, string> = {
  weak: "bg-red-500",
  fair: "bg-orange-500",
  good: "bg-yellow-500",
  strong: "bg-emerald-500",
};

const strengthTextColors: Record<PasswordStrength, string> = {
  weak: "text-red-600",
  fair: "text-orange-600",
  good: "text-yellow-600",
  strong: "text-emerald-600",
};

const strengthLabels: Record<PasswordStrength, string> = {
  weak: "Weak",
  fair: "Fair",
  good: "Good",
  strong: "Strong",
};

/** A password box with the eye button that shows or hides what is typed. */
export function PasswordInput(
  props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">,
) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={shown ? "text" : "password"} />
      <button
        type="button"
        onClick={() => setShown(!shown)}
        aria-label={shown ? "Hide password" : "Show password"}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
      >
        {shown ? (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
            />
          </svg>
        ) : (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        )}
      </button>
    </div>
  );
}

/**
 * The signup page's two boxes for choosing a password: the password with its
 * strength bar, then the same password again. Signup and reset both use these.
 */
export function NewPasswordFields({
  password,
  onPasswordChange,
  confirmPassword,
  onConfirmPasswordChange,
}: {
  password: string;
  onPasswordChange: (value: string) => void;
  confirmPassword: string;
  onConfirmPasswordChange: (value: string) => void;
}) {
  const [showPasswordRequirements, setShowPasswordRequirements] =
    useState(false);
  const passwordAnalysis = useMemo(
    () => getPasswordStrength(password),
    [password],
  );
  const passwordsMatch = password === confirmPassword;

  return (
    <>
      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          Password
        </label>
        <PasswordInput
          id="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          onFocus={() => setShowPasswordRequirements(true)}
          placeholder="Create a strong password"
          required
          className="w-full px-4 py-2.5 pr-12 rounded-xl border border-gray-300 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200"
        />

        {/* Password Strength Indicator */}
        {password && (
          <div className="mt-2">
            <div className="flex items-center gap-2 mb-1">
              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${strengthColors[passwordAnalysis.strength]}`}
                  style={{
                    width: `${(passwordAnalysis.score / 6) * 100}%`,
                  }}
                />
              </div>
              <span
                className={`text-xs font-medium ${strengthTextColors[passwordAnalysis.strength]}`}
              >
                {strengthLabels[passwordAnalysis.strength]}
              </span>
            </div>

            {showPasswordRequirements &&
              passwordAnalysis.feedback.length > 0 && (
                <div className="text-xs text-gray-500 mt-1">
                  <span className="font-medium">Missing: </span>
                  {passwordAnalysis.feedback.join(", ")}
                </div>
              )}
          </div>
        )}
      </div>

      <div>
        <label
          htmlFor="confirmPassword"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          Confirm password
        </label>
        <PasswordInput
          id="confirmPassword"
          value={confirmPassword}
          onChange={(e) => onConfirmPasswordChange(e.target.value)}
          placeholder="Confirm your password"
          required
          className={`w-full px-4 py-2.5 pr-12 rounded-xl border text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all duration-200 ${
            confirmPassword && !passwordsMatch
              ? "border-red-300 bg-red-50"
              : "border-gray-300"
          }`}
        />
        {confirmPassword && !passwordsMatch && (
          <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
        )}
      </div>
    </>
  );
}
