"use client";

import { useEffect, useState } from "react";
import { LandingHeader } from "@/components/LandingHeader";
import { LandingFooter } from "@/components/LandingFooter";
import { IntegrationLogoMarquee } from "@/components/landing/IntegrationLogoMarquee";
import { AboutMarketingSection } from "@/components/landing/AboutMarketingSection";
import Link from "next/link";

type LandingQuickStartStep = {
  key: string;
  headingBold: string;
  headingLight: string;
  image: string;
};

type LandingFeatureSection = {
  headingBold: string;
  headingLight: string;
  description: string;
  images: string[];
  /**
   * Step rows: large headline beside each image (Text agents).
   * When set, `images` should list the same paths in order (for any code that reads `images` only).
   */
  quickStart?: {
    steps: LandingQuickStartStep[];
    /** Optional centered banner below the step rows (matches section intro typography). */
    closingHeadline?: {
      headingBold: string;
      headingLight: string;
      /** Optional subtitle under the banner h2 (e.g. model-comparison context). */
      subheading?: string;
    };
    /** Optional second step ladder after `closingHeadline`; indicator `total` is `comparisonSteps.length` (1…n independently of `steps`). */
    comparisonSteps?: LandingQuickStartStep[];
  };
};

function LandingFeatureImageColumn(props: {
  section: LandingFeatureSection;
  getAlt: (imageIndex: number) => string;
}) {
  const { section, getAlt } = props;
  return (
    <div className="flex flex-col gap-6 md:gap-4">
      {section.images.map((src, idx) => (
        <div key={idx} className="rounded-xl overflow-hidden shadow-xl">
          <img src={src} alt={getAlt(idx)} className="w-full h-auto" />
        </div>
      ))}
    </div>
  );
}

/** Progress chip for Text agents quick-start rows (matches landing emerald accent language). */
function QuickStartStepIndicator(props: { index: number; total: number }) {
  const { index, total } = props;
  return (
    <div
      className="mb-5 md:mb-3 inline-flex items-center gap-2.5 rounded-full border border-emerald-200/80 bg-gradient-to-br from-emerald-50/95 via-white to-white px-3.5 py-2 shadow-[0_1px_2px_rgba(16,185,129,0.07),0_1px_0_rgba(0,0,0,0.03)]"
      aria-label={`Step ${index + 1} of ${total}`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-800/75">
        Step
      </span>
      <span
        className="flex h-7 min-w-[3.25rem] items-center justify-center gap-1 rounded-md bg-white/90 px-1.5 tabular-nums shadow-inner ring-1 ring-emerald-900/[0.06]"
        aria-hidden
      >
        <span className="text-lg font-semibold leading-none text-emerald-950">
          {index + 1}
        </span>
        <span className="pb-0.5 text-sm font-light text-emerald-300">/</span>
        <span className="text-sm font-semibold text-gray-500">{total}</span>
      </span>
    </div>
  );
}

function LandingQuickStartDesktopStepStack(props: {
  steps: LandingQuickStartStep[];
  secIdx: number;
  activeSectionsLen: number;
  tabLabel: string | undefined;
  stepHeadlineClass: string;
}) {
  const { steps, secIdx, activeSectionsLen, tabLabel, stepHeadlineClass } =
    props;
  const stepTotal = steps.length;
  const labelPrefix = tabLabel ?? "Feature";
  return (
    <div className="flex flex-col gap-14 md:gap-16 lg:gap-20">
      {steps.map((step, idx) => (
        <div
          key={step.key}
          className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6 md:gap-8 items-center"
        >
          <div className="text-left">
            <QuickStartStepIndicator index={idx} total={stepTotal} />
            <h3 className={stepHeadlineClass}>
              <span className="font-semibold text-gray-900">
                {step.headingBold}
              </span>{" "}
              <span className="font-light text-gray-500">
                {step.headingLight}
              </span>
            </h3>
          </div>
          <div className="rounded-xl overflow-hidden shadow-xl">
            <img
              src={step.image}
              alt={
                activeSectionsLen > 1
                  ? `${labelPrefix} ${step.key} preview ${secIdx + 1}-${idx + 1}`
                  : `Feature ${step.key} preview ${idx + 1}`
              }
              className="w-full h-auto"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function LandingQuickStartMobileStepStack(props: {
  steps: LandingQuickStartStep[];
  secIdx: number;
  tabLabel: string;
  stepHeadlineClass: string;
}) {
  const { steps, secIdx, tabLabel, stepHeadlineClass } = props;
  const stepTotal = steps.length;
  return (
    <div className="flex flex-col gap-20">
      {steps.map((step, idx) => (
        <div key={step.key} className="flex flex-col gap-9">
          <div className="text-left w-full min-w-0">
            <QuickStartStepIndicator index={idx} total={stepTotal} />
            <h3 className={stepHeadlineClass}>
              <span className="font-semibold text-gray-900">
                {step.headingBold}
              </span>{" "}
              <span className="font-light text-gray-500">
                {step.headingLight}
              </span>
            </h3>
          </div>
          <div className="rounded-xl overflow-hidden shadow-xl">
            <img
              src={step.image}
              alt={`${tabLabel} ${step.key} preview ${secIdx + 1}-${idx + 1}`}
              className="w-full h-auto"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

type LandingTab = {
  id: string;
  label: string;
  /** Short copy for the horizontal product-area nav only (no in-section rail) */
  navDescription: string;
  sections: LandingFeatureSection[];
};

const tabs: LandingTab[] = [
  {
    id: "llm",
    label: "Text agents",
    navDescription:
      "Create tests, define custom evaluators, and find the best LLM for your agent",
    sections: [
      {
        headingBold: "Evaluate the quality",
        headingLight: "of your AI responses",
        description:
          "Define edge cases and evaluate the agent's response against custom criteria",
        quickStart: {
          steps: [
            {
              key: "llm-input",
              headingBold: "Add the conversation history",
              headingLight: "as input to the agent",
              image: "/llm-input.png",
            },
            {
              key: "llm-evaluator",
              headingBold:
                "Define custom criteria to evaluate the agent's response",
              headingLight: "given the conversation history",
              image: "/llm-evaluator.png",
            },
            {
              key: "llm-output",
              headingBold: "Run the test and see whether",
              headingLight: "the agent response passed the evaluation criteria",
              image: "/llm-output.png",
            },
          ],
          closingHeadline: {
            headingBold: "Find the best LLM",
            headingLight: "for your agent",
            subheading:
              "Compare different models on your tests to find the best one for your agent",
          },
          comparisonSteps: [
            {
              key: "llm-multi-input",
              headingBold: "Pick the models to compare",
              headingLight: "and run benchmarking on all tests",
              image: "/llm-multi-input.png",
            },
            {
              key: "llm-multi-output",
              headingBold: "Get a leaderboard",
              headingLight: "across models and evaluators to pick the best LLM",
              image: "/llm-multi-output.png",
            },
          ],
        },
        images: [
          "/llm-input.png",
          "/llm-evaluator.png",
          "/llm-output.png",
          "/llm-multi-input.png",
          "/llm-multi-output.png",
        ],
      },
    ],
  },
  {
    id: "voice",
    label: "Voice agents",
    navDescription:
      "Benchmark speech-to-text and text-to-speech models using metrics suited for agents",
    sections: [
      {
        headingBold: "Benchmark providers",
        headingLight: "to find the best fit for your use case",
        description:
          "Go beyond simplistic rule-based metrics towards accurate evaluations by comparing the meaning of the transcriptions with the reference texts",
        images: ["/stt-leaderboard.png", "/stt-output.png"],
      },
      {
        headingBold: "Select the perfect voice",
        headingLight: "for your agent",
        description:
          "Automated evaluations using models that compare the reference texts with the generated audio samples without an intermediate transcription step help you select the right provider",
        images: ["/tts-leaderboard.png", "/tts-output.png"],
      },
    ],
  },
  {
    id: "simulations",
    label: "Simulations",
    navDescription:
      "Use personas and scenarios to simulate conversations before deploying to real users",
    sections: [
      {
        headingBold: "Simulate realistic conversations",
        headingLight: "to catch bugs before deployment",
        description:
          "Define user personas and scenarios your agent should handle to run simulated conversations with automated evaluations based on metrics defined by you",
        images: ["/simulation-run.png"],
      },
    ],
  },
];

import { ARTPARK_WEBSITE_URL, WHATSAPP_INVITE_URL } from "@/constants/links";

const GITHUB_REPO_URL = "https://github.com/artpark-sahai-org/calibrate";

export default function HomePage() {
  const [activeFeatureSectionId, setActiveFeatureSectionId] =
    useState<string>("llm");
  const [getStartedTab, setGetStartedTab] = useState<"evaluate" | "learn">(
    "evaluate",
  );

  // Set page title
  useEffect(() => {
    document.title = "Calibrate | AI evaluation platform for NGOs";
  }, []);

  useEffect(() => {
    const measureActiveSection = () => {
      const centerY = window.innerHeight * 0.5;
      let activeId = tabs[0].id;
      for (const tab of tabs) {
        const el = document.getElementById(`landing-${tab.id}`);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= centerY) {
          activeId = tab.id;
        }
      }
      setActiveFeatureSectionId((prev) =>
        prev === activeId ? prev : activeId,
      );
    };

    measureActiveSection();
    window.addEventListener("scroll", measureActiveSection, { passive: true });
    window.addEventListener("resize", measureActiveSection);
    return () => {
      window.removeEventListener("scroll", measureActiveSection);
      window.removeEventListener("resize", measureActiveSection);
    };
  }, []);

  const scrollToLandingSection = (tabId: string) => {
    document
      .getElementById(`landing-${tabId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveFeatureSectionId(tabId);
  };

  /** Section-level split headlines (quick-start intro & closing, Voice/Sim columns, section rail) */
  const landingBannerHeadlineClass =
    "text-3xl sm:text-4xl md:text-[2.25rem] lg:text-5xl xl:text-[3rem] leading-[1.08] tracking-[-0.035em] w-full md:text-balance";

  /** Per-step titles — same weight treatment, smaller scale than `landingBannerHeadlineClass` */
  const landingStepHeadlineClass =
    "text-xl sm:text-2xl md:text-2xl lg:text-3xl xl:text-[2.125rem] leading-[1.12] tracking-[-0.03em] w-full md:text-balance";

  /** Body copy directly under `landingBannerHeadlineClass` intros — scales with large headlines */
  const landingBannerIntroDescriptionClass =
    "text-base md:text-lg lg:text-xl text-gray-500 leading-relaxed text-pretty";

  /** Horizontal product-area nav: shared “active” affordance (scroll-driven) */
  const landingNavIsActive = (tabId: string) =>
    activeFeatureSectionId === tabId;

  const renderLandingProductNavButton = (tab: LandingTab, index: number) => {
    const active = landingNavIsActive(tab.id);
    return (
      <button
        type="button"
        onClick={() => scrollToLandingSection(tab.id)}
        className={`group w-full min-w-0 rounded-2xl border px-4 py-3.5 text-left transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 md:max-w-[20rem] md:min-w-[260px] md:w-auto md:shrink-0 lg:min-w-[280px] ${
          active
            ? "border-emerald-200/90 bg-gradient-to-br from-white via-emerald-50 to-white shadow-[0_8px_30px_-12px_rgba(16,185,129,0.35)] ring-1 ring-emerald-900/[0.06]"
            : "border-gray-100/90 bg-gray-50 hover:border-gray-200 hover:bg-white hover:shadow-sm"
        }`}
        aria-current={active ? "location" : undefined}
      >
        <span
          className={`mb-1 flex items-baseline gap-2 font-mono text-[10px] font-semibold tabular-nums tracking-wider ${
            active ? "text-emerald-700" : "text-gray-400"
          }`}
          aria-hidden
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <span
          className={`block text-[15px] font-semibold leading-snug tracking-[-0.02em] ${
            active
              ? "text-emerald-950"
              : "text-gray-800 group-hover:text-gray-950"
          }`}
        >
          {tab.label}
        </span>
        <span
          className={`mt-2 block text-[12px] leading-relaxed ${
            active ? "text-gray-600" : "text-gray-500"
          }`}
        >
          {tab.navDescription}
        </span>
      </button>
    );
  };

  const renderFeatureSection = (
    sec: LandingFeatureSection,
    secIdx: number,
    tab: LandingTab,
  ) => {
    const activeSectionsLen = tab.sections.length;
    const tabLabel = tab.label;

    if (sec.quickStart) {
      return (
        <div key={`${tab.id}-sec-${secIdx}`} className="w-full">
          <div className="hidden md:block max-w-7xl mx-auto w-full">
            <div className="mx-auto mb-10 max-w-4xl text-center md:mb-14">
              <h2 className={`${landingBannerHeadlineClass} mb-3 md:mb-4`}>
                <span className="font-semibold text-gray-900">
                  {sec.headingBold}
                </span>{" "}
                <span className="font-light text-gray-500">
                  {sec.headingLight}
                </span>
              </h2>
              <p className={landingBannerIntroDescriptionClass}>
                {sec.description}
              </p>
            </div>
            <LandingQuickStartDesktopStepStack
              steps={sec.quickStart.steps}
              secIdx={secIdx}
              activeSectionsLen={activeSectionsLen}
              tabLabel={tabLabel}
              stepHeadlineClass={landingStepHeadlineClass}
            />
            {sec.quickStart.closingHeadline ? (
              <div className="mx-auto mt-14 max-w-4xl text-center md:mt-16 lg:mt-20">
                <h2
                  className={`${landingBannerHeadlineClass}${
                    sec.quickStart.closingHeadline.subheading
                      ? " mb-3 md:mb-4"
                      : ""
                  }`}
                >
                  <span className="font-semibold text-gray-900">
                    {sec.quickStart.closingHeadline.headingBold}
                  </span>{" "}
                  <span className="font-light text-gray-500">
                    {sec.quickStart.closingHeadline.headingLight}
                  </span>
                </h2>
                {sec.quickStart.closingHeadline.subheading ? (
                  <p className={landingBannerIntroDescriptionClass}>
                    {sec.quickStart.closingHeadline.subheading}
                  </p>
                ) : null}
              </div>
            ) : null}
            {sec.quickStart.comparisonSteps?.length ? (
              <div className="mt-14 md:mt-16 lg:mt-20">
                <LandingQuickStartDesktopStepStack
                  steps={sec.quickStart.comparisonSteps}
                  secIdx={secIdx}
                  activeSectionsLen={activeSectionsLen}
                  tabLabel={tabLabel}
                  stepHeadlineClass={landingStepHeadlineClass}
                />
              </div>
            ) : null}
          </div>

          <div className="md:hidden space-y-12">
            <div className="mx-auto max-w-4xl w-full space-y-5 text-center">
              <h2 className={`${landingBannerHeadlineClass} mb-1`}>
                <span className="font-semibold text-gray-900">
                  {sec.headingBold}
                </span>{" "}
                <span className="font-light text-gray-500">
                  {sec.headingLight}
                </span>
              </h2>
              <p className={landingBannerIntroDescriptionClass}>
                {sec.description}
              </p>
            </div>
            <LandingQuickStartMobileStepStack
              steps={sec.quickStart.steps}
              secIdx={secIdx}
              tabLabel={tabLabel}
              stepHeadlineClass={landingStepHeadlineClass}
            />
            {sec.quickStart.closingHeadline ? (
              <div className="mx-auto mt-20 max-w-4xl text-center md:mt-16 lg:mt-20">
                <h2
                  className={`${landingBannerHeadlineClass}${
                    sec.quickStart.closingHeadline.subheading
                      ? " mb-3 md:mb-4"
                      : ""
                  }`}
                >
                  <span className="font-semibold text-gray-900">
                    {sec.quickStart.closingHeadline.headingBold}
                  </span>{" "}
                  <span className="font-light text-gray-500">
                    {sec.quickStart.closingHeadline.headingLight}
                  </span>
                </h2>
                {sec.quickStart.closingHeadline.subheading ? (
                  <p className={landingBannerIntroDescriptionClass}>
                    {sec.quickStart.closingHeadline.subheading}
                  </p>
                ) : null}
              </div>
            ) : null}
            {sec.quickStart.comparisonSteps?.length ? (
              <div className="mt-20 md:mt-16 lg:mt-20">
                <LandingQuickStartMobileStepStack
                  steps={sec.quickStart.comparisonSteps}
                  secIdx={secIdx}
                  tabLabel={tabLabel}
                  stepHeadlineClass={landingStepHeadlineClass}
                />
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    return (
      <div
        key={`${tab.id}-sec-${secIdx}`}
        className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-10 md:gap-8 items-start"
      >
        <div className="text-left lg:sticky lg:top-40">
          <h2 className={`${landingBannerHeadlineClass} mb-4 md:mb-6`}>
            <span className="font-semibold text-gray-900">
              {sec.headingBold}
            </span>{" "}
            <span className="font-light text-gray-500">{sec.headingLight}</span>
          </h2>
          <p className={landingBannerIntroDescriptionClass}>
            {sec.description}
          </p>
        </div>
        <LandingFeatureImageColumn
          section={sec}
          getAlt={(idx) =>
            activeSectionsLen > 1
              ? `${tabLabel} preview ${secIdx + 1}-${idx + 1}`
              : `Feature preview ${idx + 1}`
          }
        />
      </div>
    );
  };

  return (
    <div
      className="min-h-screen bg-white"
      style={{
        fontFamily: "var(--font-dm-sans), system-ui, -apple-system, sans-serif",
      }}
    >
      <LandingHeader />

      {/* Hero — md+: nearly full viewport below header; mobile: shorter band (lower min-h + inner py) */}
      <div className="relative flex min-h-[56dvh] flex-col justify-center overflow-hidden md:min-h-[calc(100dvh-5.25rem)]">
        {/* Background Pattern */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.03]">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern
                id="grid"
                width="60"
                height="60"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 60 0 L 0 0 0 60"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {/* Decorative circles */}
        <div className="pointer-events-none absolute top-20 left-1/4 h-64 w-64 rounded-full bg-emerald-100 opacity-40 blur-3xl"></div>
        <div className="pointer-events-none absolute top-40 right-1/4 h-48 w-48 rounded-full bg-blue-100 opacity-40 blur-3xl"></div>

        <div className="relative z-10 mx-auto w-full max-w-4xl px-4 py-8 text-center md:px-8 md:py-20 lg:py-24">
          <div className="mb-4 flex justify-center md:mb-6">
            <span className="inline-block rounded-md border border-emerald-200/90 bg-emerald-50/90 px-1.5 py-0.5 text-[10px] md:text-[11px] font-semibold uppercase tracking-wider text-emerald-950 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
              Open source
            </span>
          </div>
          <h1 className="mb-4 text-4xl font-medium tracking-[-0.02em] text-gray-900 leading-[1.1] md:mb-7 md:text-6xl">
            AI evaluation platform
            <br />
            for non-profits
          </h1>

          <p className="mx-auto max-w-2xl text-base text-gray-500 md:text-xl">
            Built by ML researchers with decades of experience to help teams
            evaluate AI agents with best practices baked into every step
          </p>

          <p className="mx-auto mt-5 max-w-2xl text-balance text-center text-[11px] font-medium leading-snug tracking-wide text-gray-500 md:mt-14 md:text-[13px]">
            <span className="font-normal text-gray-400">BUILT BY</span>{" "}
            <a
              href={ARTPARK_WEBSITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mx-0.5 inline cursor-pointer text-inherit underline-offset-[3px] decoration-gray-400/80 transition-colors hover:text-gray-700 hover:decoration-gray-600"
            >
              <span className="whitespace-nowrap">ARTPARK</span>
              <img
                src="/artpark-mark.webp"
                alt=""
                width={32}
                height={32}
                className="ml-1 inline-block h-[1.05em] w-[1.05em] max-h-[14px] max-w-[14px] object-contain align-[-0.2em] md:max-h-4 md:max-w-4"
              />
            </a>{" "}
            @ IISc ·{" "}
            <span className="font-normal text-gray-400">FUNDED BY</span>{" "}
            <span className="font-semibold tracking-wide text-gray-800">
              GOVERNMENT OF KARNATAKA
            </span>
          </p>

          {/* Launch Video */}
          {/* <div className="mt-8 md:mt-12 w-full max-w-3xl mx-auto">
            <div
              className="relative w-full"
              style={{ paddingBottom: "56.25%" }}
            >
              <iframe
                className="absolute top-0 left-0 w-full h-full rounded-xl shadow-lg"
                src="https://www.youtube.com/embed/_VS8KQbBxKs?autoplay=1&mute=1"
                title="Calibrate Launch Video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div> */}
        </div>
      </div>

      {/* Feature sections — md+: sticky nav row then sections; mobile: each section’s button directly above its content */}
      <div className="px-6 pb-20 pt-8 md:px-8 md:pb-20 md:pt-12 lg:px-12 lg:pt-14">
        <div className="mx-auto flex max-w-7xl flex-col">
          <nav
            aria-label="Product areas"
            className="sticky top-0 z-40 -mx-6 mb-8 hidden justify-center bg-white px-6 py-2 md:mx-0 md:mb-10 md:flex md:overflow-x-auto md:scroll-smooth md:px-0 md:py-3 lg:mb-12 hide-scrollbar"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            <div className="flex w-max max-w-full flex-row flex-nowrap gap-3">
              {tabs.map((tab, index) => (
                <div key={tab.id}>{renderLandingProductNavButton(tab, index)}</div>
              ))}
            </div>
          </nav>

          <div className="flex min-w-0 flex-col gap-24 md:gap-24 lg:gap-28">
            {tabs.map((tab, tabIndex) => (
              <div
                key={tab.id}
                className="flex flex-col gap-10 md:gap-0"
              >
                <div className="md:hidden">
                  {renderLandingProductNavButton(tab, tabIndex)}
                </div>
                <section
                  id={`landing-${tab.id}`}
                  data-landing-tab={tab.id}
                  className="scroll-mt-8 md:scroll-mt-40"
                >
                  <div className="flex flex-col gap-20 md:gap-16">
                    {tab.sections.map((sec, secIdx) =>
                      renderFeatureSection(sec, secIdx, tab),
                    )}
                  </div>
                </section>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Open source — procurement & trust */}
      <div className="bg-gray-50 py-16 md:py-24 px-4 md:px-8 lg:px-12 border-y border-gray-100">
        <div className="max-w-5xl mx-auto text-center mb-10 md:mb-14">
          <h2 className="text-3xl md:text-4xl lg:text-[2.5rem] font-medium text-gray-900 mb-3 md:mb-4 leading-[1.15] tracking-[-0.02em] text-balance">
            Proudly open source
          </h2>
          <p className="text-base md:text-lg text-gray-500 max-w-4xl mx-auto text-pretty leading-relaxed">
            What we open-source is what we use ourselves. Nothing hidden behind
            a paywall.
          </p>
        </div>

        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-7 text-left shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-800 mb-4">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3V6a3 3 0 013-3h13.5a3 3 0 013 3v5.25m-19.5 0a3 3 0 003 3h13.5a3 3 0 003-3m-16.5 0V9.75A2.25 2.25 0 016.75 12h.008v.008H6.75V12zm0 0h.008v.008h-.008V12zm0 0h.008v.008h-.008V12zm0 0h.008v.008h-.008V12zM17.25 12v.008h-.008V12h.008zm0 0v.008h.008V12h-.008zm0 0v.008h.008V12h-.008zm0 0v.008h.008V12h-.008zM6.75 19.5v-2.25m10.5 0v2.25"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Self-hosting
            </h3>
            <p className="text-sm md:text-[15px] text-gray-500 leading-relaxed">
              We can help you run Calibrate on your infrastructure to ensure
              sensitive data stays in environments you control
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-7 text-left shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-800 mb-4">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M18 18.72a9.09 9.09 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No per-seat pricing. Ever.
            </h3>
            <p className="text-sm md:text-[15px] text-gray-500 leading-relaxed">
              No per-user fees. Add staff, partners, and consultants as your
              team grows
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-7 text-left shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-800 mb-4">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 6h.008v.008H6V6z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Auditable, end to end
            </h3>
            <p className="text-sm md:text-[15px] text-gray-500 leading-relaxed">
              The full codebase is on GitHub for pre-deploy review and real
              diligence
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-7 text-left shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-800 mb-4">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No vendor lock-in
            </h3>
            <p className="text-sm md:text-[15px] text-gray-500 leading-relaxed">
              Fork, adapt, and make changes as you wish
            </p>
          </div>
        </div>

        <div className="max-w-5xl mx-auto mt-10 md:mt-12 flex justify-center">
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 md:gap-3 px-4 md:px-6 py-3 md:py-4 bg-gray-900 border border-gray-900 rounded-xl hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <svg
              className="w-6 h-6 md:w-8 md:h-8 text-white shrink-0"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-white text-sm md:text-base font-medium">
              artpark-sahai-org/calibrate
            </span>
            <span className="text-gray-400" aria-hidden>
              ★
            </span>
          </a>
        </div>
      </div>

      {/* Integrations Section */}
      <div className="bg-white py-16 md:py-24 px-4 md:px-8 lg:px-12">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 mb-4 md:mb-6 leading-[1.1] tracking-[-0.02em]">
            Works with any AI agent stack
          </h2>
          <p className="text-base md:text-xl text-gray-500 max-w-2xl mx-auto">
            Supports all major models with more coming soon
          </p>
        </div>

        <IntegrationLogoMarquee />

        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-4 mt-8 md:mt-10 px-4 text-center">
          <a
            href={`${process.env.NEXT_PUBLIC_DOCS_URL}/integrations`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 md:px-6 py-2.5 md:py-3 text-sm md:text-base font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
          >
            See all integrations
            <span>→</span>
          </a>
          {/* <a
            href="https://forms.gle/AoGE6DMs7N4DNAK2A"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 md:px-6 py-2.5 md:py-3 text-sm md:text-base font-medium border border-gray-300 rounded-lg text-gray-900 hover:bg-gray-50 transition-colors"
          >
            Request an integration
            <span>→</span>
          </a> */}
        </div>
      </div>

      {/* Join the Community Section */}
      <div
        id="join-community"
        className="bg-gray-50 py-16 md:py-24 px-4 md:px-8 lg:px-12 scroll-mt-20"
      >
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 mb-4 md:mb-6 leading-[1.1] tracking-[-0.02em]">
            Join the community
          </h2>
          <p className="text-base md:text-xl text-gray-500 mb-8 md:mb-10">
            Talk to the team building Calibrate to get your questions answered
            and shape our roadmap
          </p>
          <div className="flex flex-row flex-wrap items-center justify-center gap-3 md:gap-4">
            <a
              href={WHATSAPP_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 md:px-6 py-2.5 md:py-3 text-sm md:text-base border border-gray-300 rounded-lg text-gray-900 hover:bg-gray-50 transition-colors"
            >
              <svg
                className="w-5 h-5 text-green-500"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              WhatsApp
            </a>
            <a
              href="https://cal.com/amandalmia/30min"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 md:px-6 py-2.5 md:py-3 text-sm md:text-base bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              Let's talk
            </a>
          </div>
        </div>
      </div>

      {/* Team */}
      <div
        id="about-calibrate"
        className="bg-white py-16 md:py-24 px-4 md:px-8 lg:px-12 scroll-mt-20"
      >
        <div className="max-w-5xl mx-auto">
          <AboutMarketingSection />
        </div>
      </div>

      {/* Get Started Section */}
      <div className="bg-gray-50 py-16 md:py-20 px-4 md:px-8 lg:px-12">
        <div className="max-w-6xl mx-auto text-center mb-10 md:mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 mb-3 md:mb-4 tracking-[-0.02em]">
            Start Calibrating today
          </h2>
          <p className="text-base md:text-xl text-gray-500">
            Choose your path to start building reliable AI agents
          </p>
        </div>

        {/* Mobile: Segmented tabs */}
        <div className="md:hidden flex justify-center mb-6 max-w-6xl mx-auto">
          <div className="inline-flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
            <button
              onClick={() => setGetStartedTab("evaluate")}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer whitespace-nowrap ${
                getStartedTab === "evaluate"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Evaluate your agent
            </button>
            <button
              onClick={() => setGetStartedTab("learn")}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer whitespace-nowrap ${
                getStartedTab === "learn"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Learn more
            </button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {/* Left Column - Evaluate */}
          <div
            className={`bg-gray-50 rounded-2xl p-4 md:p-8 border border-gray-200 ${
              getStartedTab === "learn" ? "hidden md:block" : ""
            }`}
          >
            <h3 className="text-lg md:text-xl font-semibold text-gray-900 mb-4 md:mb-6">
              Evaluate your agent
            </h3>
            <div className="space-y-3 md:space-y-4">
              <a
                href={`${process.env.NEXT_PUBLIC_DOCS_URL}/quickstart/speech-to-text`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
              >
                <div className="text-gray-400 mt-1">
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
                      d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    Speech to Text
                  </div>
                  <div className="text-sm text-gray-500">
                    Compare accuracy across providers on your dataset
                  </div>
                </div>
                <div className="text-gray-400 group-hover:text-gray-900 transition-colors">
                  →
                </div>
              </a>

              <a
                href={`${process.env.NEXT_PUBLIC_DOCS_URL}/quickstart/text-to-text`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
              >
                <div className="text-gray-400 mt-1">
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
                      d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">LLM Tests</div>
                  <div className="text-sm text-gray-500">
                    Test tool calling and response quality across models
                  </div>
                </div>
                <div className="text-gray-400 group-hover:text-gray-900 transition-colors">
                  →
                </div>
              </a>

              <a
                href={`${process.env.NEXT_PUBLIC_DOCS_URL}/quickstart/text-to-speech`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
              >
                <div className="text-gray-400 mt-1">
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
                      d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    Text to Speech
                  </div>
                  <div className="text-sm text-gray-500">
                    Automatically evaluate generated voices across providers
                  </div>
                </div>
                <div className="text-gray-400 group-hover:text-gray-900 transition-colors">
                  →
                </div>
              </a>

              <a
                href={`${process.env.NEXT_PUBLIC_DOCS_URL}/quickstart/simulations`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
              >
                <div className="text-gray-400 mt-1">
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
                      d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    Run simulations
                  </div>
                  <div className="text-sm text-gray-500">
                    Simulate conversations with user personas and scenarios
                  </div>
                </div>
                <div className="text-gray-400 group-hover:text-gray-900 transition-colors">
                  →
                </div>
              </a>
            </div>
          </div>

          {/* Right Column - Learn More */}
          <div
            className={`bg-gray-50 rounded-2xl p-4 md:p-8 border border-gray-200 ${
              getStartedTab === "evaluate" ? "hidden md:block" : ""
            }`}
          >
            <h3 className="text-lg md:text-xl font-semibold text-gray-900 mb-4 md:mb-6">
              Learn more
            </h3>
            <div className="space-y-3 md:space-y-4">
              <a
                href="#"
                className="flex items-start gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
              >
                <div className="text-gray-400 mt-1">
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
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    Watch the demo
                  </div>
                  <div className="text-sm text-gray-500">
                    See Calibrate in action with a guided walkthrough
                  </div>
                </div>
                <div className="text-gray-400 group-hover:text-gray-900 transition-colors">
                  →
                </div>
              </a>

              <a
                href={`${process.env.NEXT_PUBLIC_DOCS_URL}/core-concepts`}
                className="flex items-start gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
              >
                <div className="text-gray-400 mt-1">
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
                      d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    Read documentation
                  </div>
                  <div className="text-sm text-gray-500">
                    Understand the core concepts underpinning Calibrate
                  </div>
                </div>
                <div className="text-gray-400 group-hover:text-gray-900 transition-colors">
                  →
                </div>
              </a>

              <a
                href="https://cal.com/amandalmia/30min"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
              >
                <div className="text-gray-400 mt-1">
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
                      d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">Book a demo</div>
                  <div className="text-sm text-gray-500">
                    Get a personalized walkthrough with our team
                  </div>
                </div>
                <div className="text-gray-400 group-hover:text-gray-900 transition-colors">
                  →
                </div>
              </a>

              <a
                href="https://voiceaiandvoiceagents.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
              >
                <div className="text-gray-400 mt-1">
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
                      d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    Guide to voice agents
                  </div>
                  <div className="text-sm text-gray-500">
                    Learn to build production-ready voice AI applications
                  </div>
                </div>
                <div className="text-gray-400 group-hover:text-gray-900 transition-colors">
                  →
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Final CTA Section */}
      <div className="bg-gray-900 py-16 md:py-24 px-4 md:px-8 lg:px-12">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-white mb-4 md:mb-6 leading-[1.1] tracking-[-0.02em]">
            Ready to get started?
          </h2>
          <p className="text-base md:text-xl text-gray-400 mb-8 md:mb-10">
            Become a team that ships trustworthy AI agents beyond vibe checks
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 md:gap-3 px-6 md:px-8 py-3 md:py-4 bg-white hover:bg-gray-100 text-gray-800 text-sm md:text-base font-medium rounded-xl transition-all duration-200 cursor-pointer"
          >
            Get started free
            <span>→</span>
          </Link>
        </div>
      </div>

      <LandingFooter />
    </div>
  );
}
