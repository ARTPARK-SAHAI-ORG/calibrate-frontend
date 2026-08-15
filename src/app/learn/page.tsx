import Link from "next/link";
import { LandingHeader } from "@/components/LandingHeader";
import { LandingFooter } from "@/components/LandingFooter";
import { WEBINARS_URL } from "@/constants/links";

/**
 * Every session we have run on evaluating AI, with its recording and its
 * slides playing on the page. The list is written out here rather than
 * fetched: it changes when we run a new session, which is also when someone
 * edits this file.
 *
 * Oldest first, so a reader who watches straight down gets the general talk
 * before the tool walk through and the questions session.
 */
const TALKS: {
  title: string;
  /**
   * Address the recording plays at inside the page: YouTube's `/embed/…` or
   * Google Drive's `/preview`. The plain address a reader would copy does not
   * play inside another page, which is why both are listed.
   */
  recordingEmbedUrl: string;
  recordingUrl: string;
  /** Published Google Slides address, `/embed` rather than `/pub`. */
  slidesEmbedUrl: string;
  slidesUrl: string;
}[] = [
  {
    title: "AI evaluation workshop for leaders",
    recordingEmbedUrl: "https://www.youtube.com/embed/Hsqm8lR1U8w",
    recordingUrl: "https://youtu.be/Hsqm8lR1U8w",
    slidesEmbedUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vTV6Fa34l5SF899zK4GUOQ2VwElkS4ShtiBz7_JkecfvY5CActCm30Dd7Gw0PuzYy368U-EHA-56uKD/embed?start=false&loop=false&delayms=3000",
    slidesUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vTV6Fa34l5SF899zK4GUOQ2VwElkS4ShtiBz7_JkecfvY5CActCm30Dd7Gw0PuzYy368U-EHA-56uKD/pub?start=false&loop=false&delayms=3000",
  },
  {
    title: "Getting started with Calibrate",
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
    title: "AI evaluation office hours",
    recordingEmbedUrl:
      "https://drive.google.com/file/d/1H3gEug-l3AbDICblZ3y-OGjZMU3edufZ/preview",
    recordingUrl:
      "https://drive.google.com/file/d/1H3gEug-l3AbDICblZ3y-OGjZMU3edufZ/view?usp=sharing",
    slidesEmbedUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vTPza71y_OugQVvKUsOupP55fXiH_r8aJcNE27pKW-vHMe_lop6OrdlC6DmKdnomaBIiSSdy36suURG/embed?start=false&loop=false&delayms=3000",
    slidesUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vTPza71y_OugQVvKUsOupP55fXiH_r8aJcNE27pKW-vHMe_lop6OrdlC6DmKdnomaBIiSSdy36suURG/pub?start=false&loop=false&delayms=3000",
  },
];

const topLinkClass =
  "inline-flex items-center px-4 md:px-5 py-2 md:py-2.5 text-sm md:text-base font-medium border border-gray-300 rounded-lg text-gray-900 hover:bg-gray-50 transition-colors cursor-pointer";
const partLabelClass =
  "text-xs font-semibold uppercase tracking-[0.14em] text-gray-400 mb-3";
const frameClass =
  "w-full aspect-video rounded-xl border border-gray-200 shadow-sm";
const openLinkClass =
  "inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors cursor-pointer";

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
    <div className="min-h-screen bg-white">
      <LandingHeader showLogoLink talkToUsHref="/#join-community" />
      <main className="bg-white py-16 md:py-24 px-4 md:px-8 lg:px-12">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 mb-4 md:mb-6 leading-[1.1] tracking-[-0.02em]">
            Learn
          </h1>
          <p className="text-base md:text-xl text-gray-500 max-w-3xl">
            Recordings and slides from the sessions we run on evaluating AI.
            Everything is free to watch, in any order.
          </p>

          <div className="mt-6 flex flex-row flex-wrap items-center gap-x-6 gap-y-2">
            <a
              href={process.env.NEXT_PUBLIC_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={topLinkClass}
            >
              Documentation
            </a>
            <a
              href={WEBINARS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={topLinkClass}
            >
              Upcoming sessions
            </a>
            <Link href="/changelog" className={topLinkClass}>
              Changelog
            </Link>
          </div>

          <div className="mt-14 md:mt-20 flex flex-col gap-16 md:gap-24">
            {TALKS.map((talk) => (
              <section key={talk.title} aria-label={talk.title}>
                <h2 className="text-2xl md:text-3xl font-medium text-gray-900 mb-6 md:mb-8 leading-[1.15] tracking-[-0.02em]">
                  {talk.title}
                </h2>

                <div className="mb-10 md:mb-12">
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

                <div>
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
              </section>
            ))}
          </div>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
