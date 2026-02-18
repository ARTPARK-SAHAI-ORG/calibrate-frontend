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
          href={talkToUsHref}
          className="px-4 md:px-5 py-2 border border-gray-300 text-gray-900 text-sm md:text-base font-medium rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
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
