"use client";

import { useEffect, useState } from "react";

const SIMPLE_ICONS_CDN =
  "https://cdn.jsdelivr.net/npm/simple-icons/icons";

/** Mirrored raster logos — files live in `public/integrations/` (bundled). */
const CARTESIA_LOGO_URL = "/integrations/cartesia.jpg";
const COHERE_LOGO_URL = "/integrations/cohere.png";
const SMALLEST_AI_LOGO_URL = "/integrations/smallest-ai.jpg";
const SARVAM_LOGO_URL = "/integrations/sarvam.png";
const AI21_LOGO_URL = "/integrations/ai21.webp";
const GROQ_LOGO_URL = "/integrations/groq.png";

const INTEGRATION_BRANDS: ReadonlyArray<{
  readonly name: string;
  readonly slug: string | null;
  /** Raster/SVG hosted outside Simple Icons — takes precedence over slug */
  readonly logoUrl?: string;
}> = [
  { name: "Deepgram", slug: "deepgram" },
  { name: "ElevenLabs", slug: "elevenlabs" },
  { name: "OpenAI", slug: "openai" },
  { name: "Google", slug: "google" },
  { name: "Cartesia", slug: null, logoUrl: CARTESIA_LOGO_URL },
  { name: "Anthropic", slug: "anthropic" },
  { name: "Groq", slug: null, logoUrl: GROQ_LOGO_URL },
  { name: "DeepSeek", slug: "deepseek" },
  { name: "Smallest AI", slug: null, logoUrl: SMALLEST_AI_LOGO_URL },
  { name: "Claude", slug: "claude" },
  { name: "Gemini", slug: "googlegemini" },
  { name: "Qwen", slug: "alibabacloud" },
  { name: "Meta", slug: "meta" },
  { name: "Mistral", slug: "mistralai" },
  { name: "Cohere", slug: null, logoUrl: COHERE_LOGO_URL },
  { name: "Sarvam", slug: null, logoUrl: SARVAM_LOGO_URL },
  { name: "AI21", slug: null, logoUrl: AI21_LOGO_URL },
  { name: "Baidu", slug: "baidu" },
  { name: "NVIDIA", slug: "nvidia" },
  { name: "Amazon", slug: "amazonaws" },
];

const INTEGRATION_NAMES_LIST = INTEGRATION_BRANDS.map((b) => b.name).join(", ");

function brandInitials(name: string): string {
  const parts = name.split(/[\s/-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function iconSrc(slug: string): string {
  return `${SIMPLE_ICONS_CDN}/${slug}.svg`;
}

function brandImageSrc(slug: string | null, logoUrl?: string): string | null {
  if (logoUrl) return logoUrl;
  if (slug) return iconSrc(slug);
  return null;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

function BrandChip({
  name,
  slug,
  logoUrl,
}: {
  name: string;
  slug: string | null;
  logoUrl?: string;
}) {
  const src = brandImageSrc(slug, logoUrl);
  const [showFallback, setShowFallback] = useState(src === null);

  return (
    <div className="flex shrink-0 items-center gap-2.5 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {showFallback || !src ? (
        <div
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-200/80 text-[11px] font-semibold uppercase tracking-tight text-gray-700"
        >
          {brandInitials(name)}
        </div>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element -- external brand assets (SVG + raster CDNs) */
        <img
          src={src}
          alt=""
          width={32}
          height={32}
          className="h-8 w-8 shrink-0 object-contain"
          loading="lazy"
          decoding="async"
          onError={() => setShowFallback(true)}
        />
      )}
      <span className="text-sm font-medium tracking-tight text-gray-900 whitespace-nowrap">
        {name}
      </span>
    </div>
  );
}

export function IntegrationLogoMarquee() {
  const reducedMotion = usePrefersReducedMotion();

  if (reducedMotion) {
    return (
      <section
        aria-label="Supported integrations"
        className="mt-10 flex flex-wrap justify-center gap-x-3 gap-y-3 px-2 md:mt-14"
      >
        {INTEGRATION_BRANDS.map((b) => (
          <BrandChip
            key={b.name}
            name={b.name}
            slug={b.slug}
            logoUrl={b.logoUrl}
          />
        ))}
      </section>
    );
  }

  return (
    <>
      <p className="sr-only">{`Supports integrations including ${INTEGRATION_NAMES_LIST}.`}</p>
      <div
        aria-hidden
        className="relative mx-auto mt-10 w-full max-w-full overflow-hidden pb-1 md:mt-14"
        style={{
          WebkitMaskImage:
            "linear-gradient(90deg, transparent 0%, black 5%, black 95%, transparent 100%)",
          maskImage:
            "linear-gradient(90deg, transparent 0%, black 5%, black 95%, transparent 100%)",
        }}
      >
        <div className="integration-marquee-track flex w-max shrink-0 items-center gap-10 pr-10 md:gap-14 md:pr-14">
          {INTEGRATION_BRANDS.map((b) => (
            <BrandChip
              key={b.name}
              name={b.name}
              slug={b.slug}
              logoUrl={b.logoUrl}
            />
          ))}
          {INTEGRATION_BRANDS.map((b) => (
            <BrandChip
              key={`${b.name}-dup`}
              name={b.name}
              slug={b.slug}
              logoUrl={b.logoUrl}
            />
          ))}
        </div>
      </div>
    </>
  );
}
