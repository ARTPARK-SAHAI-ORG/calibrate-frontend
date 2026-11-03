"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { SegmentedFilter } from "@/components/ui";
import { usePrefersReducedMotion } from "./IntegrationLogoMarquee";

const DOMAINS = ["Health", "Education", "Livelihoods", "Agriculture"] as const;
type Domain = (typeof DOMAINS)[number];
type DomainFilter = Domain | "All";

const FILTER_OPTIONS = (["All", ...DOMAINS] as DomainFilter[]).map((value) => ({
  value,
  label: value,
}));

/** Customer stories shown in the "Trusted by mission-driven teams" section. Logos live in /public/use-cases. */
const USE_CASES: {
  name: string;
  domains: Domain[];
  logo: string;
  whatTheyDo: string;
  /** A point is plain text, or text that links out to supporting material. */
  useCase: (string | { text: string; href: string })[];
  quote?: string;
  /** Who said the quote, shown under it. */
  quoteBy?: string;
  /** Where "Read the story" goes: a post on this site, or a page elsewhere. */
  storyHref?: string;
}[] = [
  {
    name: "Kabakoo",
    domains: ["Education", "Livelihoods"],
    logo: "/use-cases/kabakoo.png",
    whatTheyDo:
      "AI-powered WhatsApp mentoring enabling West African youth to develop the mindset and the skills to create productive livelihoods",
    useCase: [
      "Evaluating the quality and reliability of the Mentor AI responses",
      "Empowering non-engineers and domain experts to build and run evals",
      "Validating changes before deploying them at scale",
    ],
    quote:
      "Thanks to a tool like Calibrate, Content and Learning colleagues can write test cases. AI evaluation is not a private language reserved for engineers.",
    storyHref:
      "https://kabakoo.substack.com/p/the-ai-worked-did-it-work-for-the",
  },
  {
    name: "Noora Health",
    domains: ["Health"],
    logo: "/use-cases/noora-health.jpeg",
    whatTheyDo: "AI copilot for nurses to respond to caregiver questions",
    useCase: [
      "Align LLM judges with experts for continuously monitoring AI response quality",
      "Creating structured tests to evaluate all AI modules and preventing regressions when deploying changes",
      "Evaluating TTS model outputs across different languages",
      {
        text: "Running human labelling workshops with experts to gather evidence on user agency",
        href: "https://agency-fund.github.io/taf-nairobi-agency-measurement-slides/",
      },
    ],
    quote:
      "Calibrate was intuitive to use by an old professor who has trouble navigating Zoom.",
    quoteBy: "Zezhen Wu, The Agency Fund",
  },
  {
    name: "ARMMAN",
    domains: ["Health"],
    logo: "/use-cases/armman.png",
    whatTheyDo:
      "Voice agents to help mothers fill forms for maternal health programs",
    useCase: [
      "Evaluating the data extraction and response generation quality of LLMs",
      "Finding the best LLM and speech-to-text models with the best cost, quality and latency tradeoff",
      "Aligning LLM judges to humans to enable continuous monitoring of the agent's performance",
    ],
    storyHref: "/blog/evaluating-a-form-filling-voice-agent",
  },
  {
    name: "Raising The Village",
    domains: ["Livelihoods", "Agriculture"],
    logo: "/use-cases/raising-the-village.svg",
    whatTheyDo:
      "AI coach that generates tailored coaching messages for field agents supporting smallholder farmers in rural Uganda",
    useCase: [
      "Using an LLM judge to check that every part of a coaching message is grounded in the program guidelines",
      "Benchmarking different LLMs on coaching message quality to find the best tradeoff across accuracy and cost",
      "Collecting feedback from expert field agents, identifying and resolving disagreements, and aligning LLM judges to the experts",
    ],
    storyHref: "/blog/building-a-reliable-ai-coaching-assistant",
  },
  {
    name: "Maisha Meds",
    domains: ["Health"],
    logo: "/use-cases/maisha-meds.png",
    whatTheyDo:
      "Point-of-sale software serving private pharmacies and clinics across Africa",
    useCase: [
      "Sending patients AI-drafted instructions for their medicines",
      "Using LLM judges to track and monitor the quality of these messages over time",
      "Flagging messages that contradict a listed warning or describe its directions of use incorrectly",
    ],
  },
];

type UseCase = (typeof USE_CASES)[number];

/**
 * The "Read the story" link on a customer card. A story on this site opens in
 * the same tab, one written elsewhere opens in a new one.
 */
function UseCaseStoryLink(props: {
  href: string;
  className?: string;
  tabIndex?: number;
}) {
  const { href, className = "", tabIndex } = props;
  const style = `${className} inline-flex items-center px-4 py-2.5 text-sm font-medium bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 transition-colors cursor-pointer`;

  if (href.startsWith("/")) {
    return (
      <Link href={href} className={style} tabIndex={tabIndex}>
        Read the story
      </Link>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={style}
      tabIndex={tabIndex}
    >
      Read the story
    </a>
  );
}

/**
 * One customer card. `isLoopCopy` marks the second copy the moving row needs:
 * it can still be clicked, but screen readers and the Tab key skip it so
 * nothing is read twice, and it does not exist on a phone.
 */
function UseCaseCard(props: { useCase: UseCase; isLoopCopy?: boolean }) {
  const { useCase, isLoopCopy = false } = props;
  const tabIndex = isLoopCopy ? -1 : undefined;
  return (
    <div
      aria-hidden={isLoopCopy || undefined}
      className={`${isLoopCopy ? "hidden md:flex" : "flex"} flex-col rounded-2xl border border-gray-200 bg-white p-6 md:p-7 shadow-sm text-left md:w-[20rem] md:shrink-0 md:snap-start`}
    >
      <img
        src={useCase.logo}
        alt={`${useCase.name} logo`}
        className="h-16 md:h-20 w-auto max-w-[200px] object-contain object-left mb-5 md:mb-6"
      />
      <h3 className="text-xl md:text-2xl font-semibold text-gray-900 mb-5">
        {useCase.name}
      </h3>
      <p className="text-sm font-semibold text-gray-400 mb-1.5">What they do</p>
      <p className="text-sm md:text-[15px] text-gray-600 leading-relaxed mb-5">
        {useCase.whatTheyDo}
      </p>
      <p className="text-sm font-semibold text-gray-400 mb-2">Use case</p>
      <ul className="space-y-2">
        {useCase.useCase.map((point) => {
          const text = typeof point === "string" ? point : point.text;
          return (
            <li
              key={text}
              className="flex gap-2.5 text-sm md:text-[15px] text-gray-600 leading-relaxed"
            >
              <span
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300"
                aria-hidden
              />
              <span>
                {typeof point === "string" ? (
                  text
                ) : (
                  <a
                    href={point.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    tabIndex={tabIndex}
                    className="font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800 transition-colors cursor-pointer"
                  >
                    {text}
                  </a>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {(useCase.quote || useCase.storyHref) && (
        <div className="mt-6 pt-5 border-t border-gray-100">
          {useCase.quote && (
            <blockquote className="text-sm md:text-[15px] italic text-gray-700 leading-relaxed">
              &ldquo;{useCase.quote}&rdquo;
            </blockquote>
          )}
          {useCase.quoteBy && (
            <p className="mt-2 text-sm font-medium text-gray-500">
              {useCase.quoteBy}
            </p>
          )}
          {useCase.storyHref && (
            <UseCaseStoryLink
              href={useCase.storyHref}
              className={useCase.quote ? "mt-4" : ""}
              tabIndex={tabIndex}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** The row takes this long to pass one copy of its cards. Matches globals.css. */
const LOOP_MS = 60000;
/** How far one arrow click moves the row: one of the five cards. */
const ONE_CARD_MS = LOOP_MS / 5;

const ARROW_BUTTON_CLASS =
  "h-8 w-8 inline-flex items-center justify-center rounded-md border border-border bg-background hover:bg-muted cursor-pointer transition-colors";

/**
 * The "Trusted by mission-driven teams" section. With All picked the cards loop
 * on a desktop, stop under the mouse, and step one card at a time with the arrows. Picking a domain stops the row and
 * centres the partners in it, since one to three cards cannot fill the loop.
 * Phones always get one stacked column.
 */
export function UseCasesSection() {
  const [filter, setFilter] = useState<DomainFilter>("All");
  const reducedMotion = usePrefersReducedMotion();
  const looping = filter === "All" && !reducedMotion;
  const trackRef = useRef<HTMLDivElement>(null);

  /** Moves the row by one card, in either direction, and it carries on from there. */
  const moveByOneCard = (direction: 1 | -1) => {
    const animation = trackRef.current?.getAnimations()[0];
    if (!animation) return;
    const time = Number(animation.currentTime) + direction * ONE_CARD_MS;
    animation.currentTime = time < 0 ? time + LOOP_MS : time;
  };

  const shown =
    filter === "All"
      ? USE_CASES
      : USE_CASES.filter((useCase) => useCase.domains.includes(filter));

  return (
    <div
      id="use-cases"
      className="bg-white py-16 md:py-24 px-4 md:px-8 lg:px-12 scroll-mt-20"
    >
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8 md:mb-10">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 mb-4 md:mb-6 leading-[1.1] tracking-[-0.02em]">
            Trusted by mission-driven teams
          </h2>
          <p className="text-base md:text-xl text-gray-500 max-w-2xl mx-auto">
            How non-profits use Calibrate to build AI products responsibly
          </p>
        </div>
        <div className="relative hidden md:block mb-8">
          <SegmentedFilter
            value={filter}
            onChange={setFilter}
            options={FILTER_OPTIONS}
            ariaLabel="Filter partners by domain"
            className="w-fit mx-auto"
          />
          {looping && (
            <div className="absolute right-0 top-0 flex items-center gap-1">
              <button
                type="button"
                onClick={() => moveByOneCard(-1)}
                aria-label="Show the previous partner"
                className={ARROW_BUTTON_CLASS}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => moveByOneCard(1)}
                aria-label="Show the next partner"
                className={ARROW_BUTTON_CLASS}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
        {looping ? (
          <div
            // Tabbing to a link makes the browser scroll this row to show it.
            // Put it back, or the end of the loop would run out of cards.
            onBlur={(e) => e.currentTarget.scrollTo({ left: 0 })}
            className="use-cases-marquee overflow-hidden md:pb-4"
          >
            <div
              ref={trackRef}
              className="use-cases-marquee-track flex flex-col gap-4 md:w-max md:flex-row md:gap-6 md:pr-6"
            >
              {shown.map((useCase) => (
                <UseCaseCard key={useCase.name} useCase={useCase} />
              ))}
              {shown.map((useCase) => (
                <UseCaseCard
                  key={`${useCase.name}-copy`}
                  useCase={useCase}
                  isLoopCopy
                />
              ))}
            </div>
          </div>
        ) : (
          <div
            className={`flex flex-col gap-4 md:flex-row md:gap-6 md:pb-4 ${
              filter === "All"
                ? "md:overflow-x-auto md:snap-x md:snap-mandatory"
                : "md:flex-wrap md:justify-center"
            }`}
          >
            {shown.map((useCase) => (
              <UseCaseCard key={useCase.name} useCase={useCase} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
