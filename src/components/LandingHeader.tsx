"use client";

import { useState } from "react";
import { Link } from "@/lib/nav";

type LandingHeaderProps = {
  /** Whether the logo should link to / (for non-home pages) */
  showLogoLink?: boolean;
  /** The href for the Talk to us button - defaults to #join-community for same-page scroll */
  talkToUsHref?: string;
};

type NavLink = {
  label: string;
  href?: string;
  external?: boolean;
  /** Small pill after the label, for a section worth pointing at. */
  badge?: string;
};

export function LandingHeader({
  showLogoLink = false,
  talkToUsHref = "#join-community",
}: LandingHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks: NavLink[] = [
    { label: "Partners", href: "/#use-cases" },
    { label: "How it works", href: "/#how-it-works" },
    { label: "Use with AI tools", href: "/#coding-agents", badge: "New" },
    { label: "Open source", href: "/#open-source" },
    { label: "Integrations", href: "/#integrations" },
    // Scrolls to the footer, which holds the documentation, changelog, privacy
    // and terms links. No leading slash, so it stays on whichever page the
    // reader is on: every page with this header has the footer too.
    { label: "Resources", href: "#resources" },
  ];

  const badgeClass =
    "rounded border border-emerald-200/90 bg-emerald-50/90 px-1 py-px text-[9px] font-semibold uppercase tracking-wider text-emerald-950";

  const renderNavLabel = (link: NavLink, badgeVisibility: string) =>
    link.badge ? (
      <span className="inline-flex items-center gap-1.5">
        {link.label}
        <span className={`${badgeVisibility} ${badgeClass}`}>{link.badge}</span>
      </span>
    ) : (
      link.label
    );

  const renderNavLink = (
    link: NavLink,
    className: string,
    onClick?: () => void,
    // In the row of links the pill only appears from xl: any narrower and the
    // extra width pushes the links into the logo. The menu has room for it.
    badgeVisibility = "hidden xl:inline-block",
  ) =>
    link.external ? (
      <a
        key={link.label}
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        onClick={onClick}
      >
        {renderNavLabel(link, badgeVisibility)}
      </a>
    ) : (
      <Link
        key={link.label}
        href={link.href ?? "/"}
        className={className}
        onClick={onClick}
      >
        {renderNavLabel(link, badgeVisibility)}
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

  // Six links plus two buttons do not fit beside the logo until 1024px, and
  // below that they wrap and run into it. So the row appears at lg and the
  // hamburger menu covers every width under that.
  const desktopLinkClass =
    "whitespace-nowrap text-gray-600 text-sm xl:text-base font-medium hover:text-gray-900 transition-colors cursor-pointer";
  const mobileLinkClass =
    "block py-2 text-gray-700 text-base font-medium hover:text-gray-900 transition-colors cursor-pointer";

  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between gap-3 px-4 md:px-8 lg:px-5 xl:px-8 py-4 border-b border-gray-100 bg-white">
      {showLogoLink ? (
        <Link href="/" className="flex items-center gap-2">
          {LogoContent}
        </Link>
      ) : (
        <div className="flex items-center gap-2">{LogoContent}</div>
      )}

      <div className="flex items-center gap-3 md:gap-4">
        <div className="hidden lg:flex items-center gap-3 xl:gap-8 xl:mr-2">
          {navLinks.map((link) => renderNavLink(link, desktopLinkClass))}
        </div>
        <a
          href={talkToUsHref}
          className="hidden sm:inline-block whitespace-nowrap px-4 md:px-5 py-2 border border-gray-300 text-gray-900 text-sm md:text-base font-medium rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
        >
          Talk to us
        </a>
        <Link
          href="/login"
          className="whitespace-nowrap px-4 md:px-5 py-2 bg-black text-white text-sm md:text-base font-medium rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
        >
          Get started
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Menu"
          aria-expanded={menuOpen}
          className="lg:hidden p-2 -mr-2 text-gray-700 hover:text-gray-900 transition-colors cursor-pointer"
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
        <div className="lg:hidden absolute top-full left-0 right-0 border-b border-gray-100 bg-white shadow-sm px-4 py-2">
          {navLinks.map((link) =>
            renderNavLink(
              link,
              mobileLinkClass,
              () => setMenuOpen(false),
              "inline-block",
            ),
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
