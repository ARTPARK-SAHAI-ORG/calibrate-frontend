"use client";

import { useState } from "react";
import Link from "next/link";

type LandingHeaderProps = {
  /** Whether the logo should link to / (for non-home pages) */
  showLogoLink?: boolean;
  /** The href for the Talk to us button - defaults to #join-community for same-page scroll */
  talkToUsHref?: string;
};

type NavLink = { label: string; href?: string; external?: boolean };

export function LandingHeader({
  showLogoLink = false,
  talkToUsHref = "#join-community",
}: LandingHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks: NavLink[] = [
    { label: "Open source", href: "/#open-source" },
    { label: "Integrations", href: "/#integrations" },
    { label: "Case studies", href: "/#use-cases" },
    { label: "Documentation", href: process.env.NEXT_PUBLIC_DOCS_URL, external: true },
  ];

  const renderNavLink = (link: NavLink, className: string, onClick?: () => void) =>
    link.external ? (
      <a
        key={link.label}
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        onClick={onClick}
      >
        {link.label}
      </a>
    ) : (
      <Link
        key={link.label}
        href={link.href ?? "/"}
        className={className}
        onClick={onClick}
      >
        {link.label}
      </Link>
    );

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

  const desktopLinkClass =
    "text-gray-600 text-sm md:text-base font-medium hover:text-gray-900 transition-colors cursor-pointer";
  const mobileLinkClass =
    "block py-2 text-gray-700 text-base font-medium hover:text-gray-900 transition-colors cursor-pointer";

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between gap-3 px-4 md:px-8 py-4 border-b border-gray-100 bg-white">
      {showLogoLink ? (
        <Link href="/" className="flex items-center gap-2">
          {LogoContent}
        </Link>
      ) : (
        <div className="flex items-center gap-2">{LogoContent}</div>
      )}

      <div className="flex items-center gap-3 md:gap-4">
        <div className="hidden md:flex items-center gap-6 lg:gap-8 md:mr-2">
          {navLinks.map((link) => renderNavLink(link, desktopLinkClass))}
        </div>
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
          Get started
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Menu"
          aria-expanded={menuOpen}
          className="md:hidden p-2 -mr-2 text-gray-700 hover:text-gray-900 transition-colors cursor-pointer"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
            />
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 border-b border-gray-100 bg-white shadow-sm px-4 py-2">
          {navLinks.map((link) =>
            renderNavLink(link, mobileLinkClass, () => setMenuOpen(false)),
          )}
          <a
            href={talkToUsHref}
            onClick={() => setMenuOpen(false)}
            className="sm:hidden block py-2 text-gray-700 text-base font-medium hover:text-gray-900 transition-colors cursor-pointer"
          >
            Talk to us
          </a>
        </div>
      )}
    </nav>
  );
}
