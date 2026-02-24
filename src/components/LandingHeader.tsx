"use client";

import Link from "next/link";

type LandingHeaderProps = {
  /** Whether the logo should link to / (for non-home pages) */
  showLogoLink?: boolean;
  /** The href for the Talk to us button - defaults to #join-community for same-page scroll */
  talkToUsHref?: string;
};

export function LandingHeader({
  showLogoLink = false,
  talkToUsHref = "#join-community",
}: LandingHeaderProps) {
  const LogoContent = (
    <>
      <img
        src="/logo.svg"
        alt="Calibrate Logo"
        className="w-7 h-7 md:w-8 md:h-8"
      />
      <span className="text-lg md:text-xl font-bold tracking-tight text-black">
        Calibrate
      </span>
    </>
  );

  return (
    <nav className="flex items-center justify-between gap-3 px-4 md:px-8 py-4 border-b border-gray-100">
      {showLogoLink ? (
        <Link href="/" className="flex items-center gap-2">
          {LogoContent}
        </Link>
      ) : (
        <div className="flex items-center gap-2">{LogoContent}</div>
      )}

      <div className="flex items-center gap-3">
        <a
          href={process.env.NEXT_PUBLIC_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:inline-block text-gray-600 text-sm md:text-base font-medium hover:text-gray-900 transition-colors cursor-pointer"
        >
          Documentation
        </a>
        <a
          href="https://github.com/artpark-sahai-org/calibrate"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 text-gray-600 hover:text-gray-900 transition-colors cursor-pointer"
          aria-label="GitHub"
        >
          <svg
            className="w-5 h-5 md:w-6 md:h-6"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
        </a>
        <a
          href={talkToUsHref}
          className="hidden sm:inline-block px-4 md:px-5 py-2 border border-gray-300 text-gray-900 text-sm md:text-base font-medium rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
        >
          Talk to us
        </a>
        <Link
          href="/login"
          className="px-4 md:px-5 py-2 bg-black text-white text-sm md:text-base font-medium rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
        >
          Login
        </Link>
      </div>
    </nav>
  );
}
