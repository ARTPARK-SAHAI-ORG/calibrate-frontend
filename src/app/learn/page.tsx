import type { ReactNode } from "react";
import Link from "next/link";
import { LandingHeader } from "@/components/LandingHeader";
import { LandingFooter } from "@/components/LandingFooter";
import { LearnTableOfContents } from "@/components/learn/LearnTableOfContents";
import { WEBINARS_URL } from "@/constants/links";

/** A link inside a summary. Declared above the lists because they use it as
 * soon as this file loads. */
const summaryLinkClass =
  "font-bold text-inherit underline-offset-2 decoration-gray-400 hover:text-gray-900 hover:decoration-gray-700 cursor-pointer";
/** Bullets inside a summary. */
const summaryListClass = "mt-3 list-disc space-y-2.5 pl-5";
/** The name a bullet leads with, above the line explaining it. */
const summaryTermClass = "block font-medium text-gray-900";

/**
 * One thing a reader can watch or read: either a session we ran, or a deck we
 * put together on its own. Both are written out in this file rather than
 * fetched, because the list changes when we run a session or finish a deck,
 * which is also when someone edits this file.
 */
type LearnItem = {
  /** Name in the address bar and in the list down the left. Set once and left
   * alone, so a shared link survives a change of title. */
  id: string;
  title: string;
  /** One or two lines on what it covered, shown under its title. */
  summary: ReactNode;
  /**
   * Address the recording plays at inside the page: YouTube's `/embed/…` or
   * Google Drive's `/preview`. The plain address a reader would copy does not
   * play inside another page, which is why both are listed. Left out for a
   * deck with no recording, and then the slides run the full width.
   */
  recordingEmbedUrl?: string;
  recordingUrl?: string;
  /**
   * Published Google Slides address, `/embed` rather than `/pub`. Left out for
   * a recording with no slides, and then the recording runs the full width.
   */
  slidesEmbedUrl?: string;
  slidesUrl?: string;
};

/**
 * Everything on the page, in the order a reader meets it. Move an entry here
 * to move it on the page, and add a new one wherever it should be read.
 */
const ENTRIES: LearnItem[] = [
  {
    id: "calibrate-demo",
    title: "Evaluating and improving AI agents with Calibrate",
    summary:
      "The main demo of Calibrate, showing how to evaluate an AI agent and improve it, from start to finish. Start here if you want to see the whole product in one go.",
    recordingEmbedUrl: "https://www.youtube.com/embed/F1oR8QlCnmI",
    recordingUrl: "https://youtu.be/F1oR8QlCnmI",
  },
  {
    id: "workshop-for-leaders",
    title: "Getting started with AI evals",
    summary: (
      <>
        Why AI systems need to be evaluated, what evaluation means, how to get
        started, creating a golden dataset, minimum viable evaluation, and how
        to keep improving your AI system. We also answer questions asked by the
        community during the live workshop, and we have written up a{" "}
        {/* The words in the link say where it goes, so it still makes sense
            to anyone who hears it out of the sentence around it. */}
        <a
          href="https://docs.google.com/document/d/e/2PACX-1vR9nJWvGTk0oisXlxAdjUZEANkLrnUjmmqxlE07BUxX3HVVkD5kcY_w65RJPJlONG9FEEQc5eL0A3Xv/pub"
          target="_blank"
          rel="noopener noreferrer"
          className={summaryLinkClass}
        >
          summary of the insights
        </a>
        .
      </>
    ),
    recordingEmbedUrl: "https://www.youtube.com/embed/Hsqm8lR1U8w",
    recordingUrl: "https://youtu.be/Hsqm8lR1U8w",
    slidesEmbedUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vTV6Fa34l5SF899zK4GUOQ2VwElkS4ShtiBz7_JkecfvY5CActCm30Dd7Gw0PuzYy368U-EHA-56uKD/embed?start=false&loop=false&delayms=3000",
    slidesUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vTV6Fa34l5SF899zK4GUOQ2VwElkS4ShtiBz7_JkecfvY5CActCm30Dd7Gw0PuzYy368U-EHA-56uKD/pub?start=false&loop=false&delayms=3000",
  },
  {
    id: "getting-started",
    title: "Getting started with Calibrate",
    summary:
      "A tutorial on how Calibrate helps evaluate AI agents using a form-filling voice agent as a case study. It explains the eval-driven approach to building agents, where evals are not considered an afterthought but closely inform what needs to be built and help ensure agent quality. We show how to convert each failure mode into a test case and comprehensively discuss how to evaluate open-ended responses using LLM judges. We also share best practices and the pitfalls to avoid.",
    recordingEmbedUrl:
      "https://drive.google.com/file/d/1wIxDXWDuthB3urpUoZKB2KcdxartonMT/preview",
    recordingUrl:
      "https://drive.google.com/file/d/1wIxDXWDuthB3urpUoZKB2KcdxartonMT/view?referrer=luma&pli=1",
    slidesEmbedUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vQYRP-s0ouc0fvSIZurEoZH7ie56OGGlxjW0bBju8J0_vCRqT5pqreIcSBHDlKPLJnjWa4OFceW3EtZ/embed?start=false&loop=false&delayms=3000&slide=id.p",
    slidesUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vQYRP-s0ouc0fvSIZurEoZH7ie56OGGlxjW0bBju8J0_vCRqT5pqreIcSBHDlKPLJnjWa4OFceW3EtZ/pub?start=false&loop=false&delayms=3000&slide=id.p",
  },
  {
    id: "intro-to-calibrate",
    title: "Calibrate feature walkthrough",
    summary:
      "For those already familiar with the basics of AI evaluation, this guide gives a walkthrough of all the core features on Calibrate using a form filling voice agent as a case study: evaluating LLMs using structured tests, finding the best model across latency, cost and quality, aligning LLM judges with human experts, continuously monitoring agent performance, evaluating speech-to-text and text-to-speech models, and running simulated conversations with agents to evaluate them end-to-end.",
    slidesEmbedUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vQWZdlG0I_pxmj6ZaZTayng4XsV11TQKprmOT11pZcA2o2aO44RNff7IxlOrBAephygfyp6tv61qAK2/embed?start=false&loop=false&delayms=3000",
    slidesUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vQWZdlG0I_pxmj6ZaZTayng4XsV11TQKprmOT11pZcA2o2aO44RNff7IxlOrBAephygfyp6tv61qAK2/pub?start=false&loop=false&delayms=3000",
  },
  {
    id: "connect-ai-tool-with-calibrate",
    title: "Connecting your AI tool with Calibrate",
    summary:
      "Using the Calibrate command line tool and skills, you can connect your preferred AI tool with Calibrate so that it can create the evals automatically for your use case, upload and run them on Calibrate, analyse what went wrong, and suggest fixes. It can also analyse where your LLM judges disagree with humans and iterate on the judge on its own until it is aligned, without requiring you to intervene at each step.",
    recordingEmbedUrl: "https://www.youtube.com/embed/Vx3oxYKbLVw",
    recordingUrl: "https://youtu.be/Vx3oxYKbLVw",
  },
  {
    id: "office-hours",
    title: "AI evals office hours",
    summary:
      "Office hours is a space for nonprofits to get their questions on AI evals answered. We covered how to evaluate when a team has few engineers, how domain experts can do the work without engineering help, how to write test cases that cover many situations, and how to watch quality over time. Teams asked about models that keep changing, splitting the work between engineers and domain experts, the cost of building and testing, building a trusted set of correct answers, and setting a baseline for correctness in public health and community health worker programmes.",
    recordingEmbedUrl:
      "https://drive.google.com/file/d/1H3gEug-l3AbDICblZ3y-OGjZMU3edufZ/preview",
    recordingUrl:
      "https://drive.google.com/file/d/1H3gEug-l3AbDICblZ3y-OGjZMU3edufZ/view?usp=sharing",
    slidesEmbedUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vTPza71y_OugQVvKUsOupP55fXiH_r8aJcNE27pKW-vHMe_lop6OrdlC6DmKdnomaBIiSSdy36suURG/embed?start=false&loop=false&delayms=3000",
    slidesUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vTPza71y_OugQVvKUsOupP55fXiH_r8aJcNE27pKW-vHMe_lop6OrdlC6DmKdnomaBIiSSdy36suURG/pub?start=false&loop=false&delayms=3000",
  },
  {
    id: "evaluating-gen-ai-social-sector",
    title: "Evaluating AI products in the social sector",
    summary: (
      <>
        A detailed walkthrough of the{" "}
        <a
          href="https://eval.playbook.org.ai/"
          target="_blank"
          rel="noopener noreferrer"
          className={summaryLinkClass}
        >
          4-level framework
        </a>{" "}
        for evaluating AI products in the social sector:
        <ul className={summaryListClass}>
          <li>
            <span className={summaryTermClass}>Level 1, model evaluation</span>
            Does the AI system perform as intended?
          </li>
          <li>
            <span className={summaryTermClass}>
              Level 2, product evaluation
            </span>
            Does the overall product engage and retain users?
          </li>
          <li>
            <span className={summaryTermClass}>Level 3, user evaluation</span>
            Does the product change users&apos; thoughts, feelings, knowledge
            and behaviour towards the development outcome?
          </li>
          <li>
            <span className={summaryTermClass}>Level 4, impact evaluation</span>
            Do users with access to the product improve development outcomes?
          </li>
        </ul>
      </>
    ),
    slidesEmbedUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vRWltXva8xMcfBDZ5TPrQH2hATDDaKdA-c0ZItHMRT_O1wWECKVdsvGbv7EIFf0qg/embed?start=false&loop=false&delayms=3000",
    slidesUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vRWltXva8xMcfBDZ5TPrQH2hATDDaKdA-c0ZItHMRT_O1wWECKVdsvGbv7EIFf0qg/pub?start=false&loop=false&delayms=3000",
  },

  {
    id: "ai-evaluation-guide",
    title: "Evaluating AI systems in non-profits using Calibrate",
    summary:
      "A longer version of the Calibrate feature walkthrough above, additionally covering: How LLMs work, why AI fails in social-sector contexts, how evaluation helps deploy AI responsibly.",
    slidesEmbedUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vSaOgSBTLQurLiDp9jSfJtfMyJQYxwPhS5t6drMeZr6mcGSN8y53XNSk9CIPjzpOAoQdV6T-Yv8T-5W/embed?start=false&loop=false&delayms=3000",
    slidesUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vSaOgSBTLQurLiDp9jSfJtfMyJQYxwPhS5t6drMeZr6mcGSN8y53XNSk9CIPjzpOAoQdV6T-Yv8T-5W/pub?start=false&loop=false&delayms=3000",
  },
];

const topLinkClass =
  "inline-flex items-center gap-2 px-4 md:px-5 py-2 md:py-2.5 text-sm md:text-base font-medium border border-gray-300 rounded-lg text-gray-900 hover:bg-gray-50 transition-colors cursor-pointer";
/** The emerald eyebrow pill the landing page uses above a block of content. */
const partLabelClass =
  "mb-3 inline-block rounded-md border border-emerald-200/90 bg-emerald-50/90 px-1.5 py-0.5 text-[10px] md:text-[11px] font-semibold uppercase tracking-wider text-emerald-950 shadow-[0_1px_0_rgba(0,0,0,0.04)]";
/** Same treatment the landing page gives its screenshots. */
const frameClass = "w-full aspect-video rounded-xl overflow-hidden shadow-xl";
const openLinkClass =
  "inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors cursor-pointer";

/** Shapes for the icon on each of the three links above the sessions. */
const TOP_LINK_ICONS = {
  documentation:
    "M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25",
  calendar:
    "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
  changelog: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
} as const;

function TopLinkIcon({ d }: { d: string }) {
  return (
    <svg
      className="h-4 w-4 md:h-[18px] md:w-[18px] text-gray-400"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

/** Marks a link that leaves the page, in place of a bare arrow. */
function OpensInNewTabIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
      />
    </svg>
  );
}

export default function LearnPage() {
  return (
    <div className="min-h-screen bg-white landing-page">
      <LandingHeader showLogoLink talkToUsHref="/#join-community" />
      <main className="bg-white py-16 md:py-24 px-4 md:px-8 lg:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-5xl mx-auto text-center">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 mb-4 md:mb-6 leading-[1.1] tracking-[-0.02em]">
              Learning resources
            </h1>
            <p className="text-base md:text-xl text-gray-500 max-w-4xl mx-auto text-pretty">
              Guidance and best practices for AI evals, plus tutorials on
              Calibrate
            </p>
          </div>

          <div className="mt-8 md:mt-10 flex flex-row flex-wrap items-center justify-center gap-2 md:gap-3">
            <a
              href={process.env.NEXT_PUBLIC_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={topLinkClass}
            >
              <TopLinkIcon d={TOP_LINK_ICONS.documentation} />
              Documentation
            </a>
            <a
              href={WEBINARS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={topLinkClass}
            >
              <TopLinkIcon d={TOP_LINK_ICONS.calendar} />
              Upcoming sessions
            </a>
            <Link href="/changelog" className={topLinkClass}>
              <TopLinkIcon d={TOP_LINK_ICONS.changelog} />
              Changelog
            </Link>
          </div>

          <div className="mt-14 md:mt-20 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
            <LearnTableOfContents
              sections={ENTRIES.map(({ id, title }) => ({ id, title }))}
            />

            <div className="flex min-w-0 flex-col gap-16 md:gap-24">
              {ENTRIES.map((talk) => (
                <section
                  key={talk.id}
                  id={talk.id}
                  aria-label={talk.title}
                  className="scroll-mt-24"
                >
                  <h2 className="mb-3 text-xl sm:text-2xl lg:text-3xl font-semibold text-gray-900 leading-[1.12] tracking-[-0.03em] text-balance">
                    {talk.title}
                  </h2>
                  {/* A div rather than a p: a summary can hold bullets,
                            which are not allowed inside a paragraph. */}
                  <div className="mb-8 md:mb-10 text-base md:text-lg font-light text-gray-500 leading-relaxed text-pretty">
                    {talk.summary}
                  </div>

                  <div
                    className={`grid grid-cols-1 gap-10 lg:gap-6 ${
                      talk.recordingEmbedUrl && talk.slidesEmbedUrl
                        ? "lg:grid-cols-2"
                        : "lg:max-w-3xl"
                    }`}
                  >
                    {talk.recordingEmbedUrl && talk.recordingUrl && (
                      <div className="min-w-0">
                        <p className={partLabelClass}>Recording</p>
                        <iframe
                          src={talk.recordingEmbedUrl}
                          title={`Recording of ${talk.title}`}
                          className={frameClass}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                        <a
                          href={talk.recordingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open the recording of ${talk.title} in a new tab`}
                          className={openLinkClass}
                        >
                          Open the recording in a new tab
                          <OpensInNewTabIcon />
                        </a>
                      </div>
                    )}

                    {talk.slidesEmbedUrl && talk.slidesUrl && (
                      <div className="min-w-0">
                        <p className={partLabelClass}>Slides</p>
                        <iframe
                          src={talk.slidesEmbedUrl}
                          title={`Slides from ${talk.title}`}
                          className={frameClass}
                          allowFullScreen
                        />
                        <a
                          href={talk.slidesUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open the slides from ${talk.title} in a new tab`}
                          className={openLinkClass}
                        >
                          Open the slides in a new tab
                          <OpensInNewTabIcon />
                        </a>
                      </div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
