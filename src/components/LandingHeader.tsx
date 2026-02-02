"use client";

type LandingHeaderProps = {
  /** Whether the logo should link to /login (for non-login pages) */
  showLogoLink?: boolean;
  /** The href for the Join button - defaults to #join-community for same-page scroll */
  joinHref?: string;
};

export function LandingHeader({
  showLogoLink = false,
  joinHref = "#join-community",
}: LandingHeaderProps) {
  const handleBookDemo = () => {
    window.open("https://cal.com/amandalmia/30min", "_blank");
  };

  const LogoContent = (
    <>
      <img src="/logo.svg" alt="Calibrate Logo" className="w-8 h-8" />
      <span className="text-xl font-bold tracking-tight text-black">
        Calibrate
      </span>
    </>
  );

  return (
    <nav className="flex items-center justify-between px-8 py-4 border-b border-gray-100">
      {showLogoLink ? (
        <a href="/login" className="flex items-center gap-2">
          {LogoContent}
        </a>
      ) : (
        <div className="flex items-center gap-2">{LogoContent}</div>
      )}

      <div className="flex items-center gap-4">
        <a
          href={process.env.NEXT_PUBLIC_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-600 font-medium hover:text-gray-900 transition-colors"
        >
          Documentation
        </a>
        <a
          href={joinHref}
          className="px-5 py-2.5 border border-gray-300 text-gray-900 font-medium rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
        >
          Join
        </a>
        <button
          onClick={handleBookDemo}
          className="px-5 py-2.5 bg-black text-white font-medium rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
        >
          Book a demo
        </button>
      </div>
    </nav>
  );
}
