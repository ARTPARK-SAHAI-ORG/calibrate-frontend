import type { ReactNode } from "react";
import Link from "next/link";
import { SHARE_IMAGE, SITE_URL } from "@/lib/site";
import { WHATSAPP_INVITE_URL } from "@/constants/links";

/**
 * Everything the blog holds, newest first. Posts are written here rather than
 * fetched, because a post is added when someone edits this file, and writing
 * the body as markup keeps links and lists working without a reader for them.
 */
export type BlogPost = {
  /** The name in the address bar. Set once and left alone, so a shared link
   * survives a change of title. */
  slug: string;
  title: string;
  /** What the browser tab and the search result say, when that should differ
   * from the headline on the page. A headline can be short and sharp; this can
   * carry the words someone would actually type into a search. Falls back to
   * the headline. */
  seoTitle?: string;
  /** The day it went up, as year-month-day. */
  date: string;
  author: string;
  /** Where the author's name goes when clicked. Left out for an author with
   * nowhere to point at. */
  authorUrl?: string;
  /** One or two lines shown under the title on the list page, and given to
   * anyone who shares the link. */
  summary: string;
  /** Its own share picture, as a path from the site root. Falls back to
   * SHARE_IMAGE when a post has none. */
  image?: string;
  body: ReactNode;
};

/**
 * The facts about a post, in the shape Google reads: what it is, who wrote it,
 * when it went up. Without this a search result is a bare link; with it, it can
 * carry the date and the author's name.
 *
 * Addresses here are written out in full because this block is read on its own,
 * away from the page it sits in, so a path from the site root means nothing.
 */
export function articleJsonLd(post: BlogPost) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.summary,
    datePublished: post.date,
    image: `${SITE_URL}${post.image ?? SHARE_IMAGE}`,
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
    author: {
      "@type": "Person",
      name: post.author,
      ...(post.authorUrl ? { url: post.authorUrl } : {}),
    },
    publisher: {
      "@type": "Organization",
      name: "Calibrate",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.png` },
    },
  };
}

/** How a date reads on the page. UTC, so the day never shifts by timezone. */
export function formatPostDate(date: string): string {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** What the browser tab and the search result say. */
export function tabTitle(post: BlogPost): string {
  return `${post.seoTitle ?? post.title} | Calibrate`;
}

/** The date and who wrote it, shown the same way wherever a post appears. */
export function PostByline({
  post,
  className = "",
}: {
  post: BlogPost;
  className?: string;
}) {
  return (
    <p className={`text-sm text-gray-600 ${className}`}>
      <time dateTime={post.date}>{formatPostDate(post.date)}</time>
      <span className="mx-2">·</span>
      {post.authorUrl ? (
        <a
          href={post.authorUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 decoration-gray-300 hover:text-gray-900 hover:decoration-gray-600 transition-colors"
        >
          {post.author}
        </a>
      ) : (
        post.author
      )}
    </p>
  );
}

export function findPost(slug: string): BlogPost | undefined {
  return POSTS.find((post) => post.slug === slug);
}

export const POSTS: BlogPost[] = [
  {
    slug: "calibrate-at-indiafoss",
    title: "Calibrate will be at IndiaFOSS",
    seoTitle: "Calibrate at IndiaFOSS",
    date: "2026-08-18",
    author: "Aman Dalmia",
    authorUrl: "https://www.linkedin.com/in/aman-dalmia/",
    summary:
      "Our proposal to present Calibrate at IndiaFOSS, the biggest gathering of the open-source community in India, has been accepted.",
    body: (
      <>
        <p>
          Our proposal to present{" "}
          <Link
            href="/"
            className="font-medium text-gray-900 underline underline-offset-2 decoration-gray-400 hover:decoration-gray-700"
          >
            Calibrate
          </Link>{" "}
          at IndiaFOSS, the biggest gathering of the open-source community in
          India, has been accepted.
        </p>
        <p>
          If you want to learn about the challenges of evaluating agents, or you
          are struggling to make your own AI systems reliable, I would love to
          catch up with you there. I will share what we have been building and
          testing in partnership with several non-profits, to address the major
          gaps in all existing AI evaluation tools and to help domain experts
          take the lead in highly sensitive fields like health, education and
          agriculture.
        </p>
        <p>
          I am especially looking forward to meeting all the students who are
          eager to learn about and start their open-source journey. We have
          ample learning opportunities for those who want to know how AI is
          being used to solve genuinely useful problems, beyond the ones that
          get all the hype, and to build their skills by contributing.
        </p>
        <p>
          Come and say hello at the conference. If you cannot make it, our{" "}
          <a
            href={WHATSAPP_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-gray-900 underline underline-offset-2 decoration-gray-400 hover:decoration-gray-700"
          >
            community
          </a>{" "}
          is open to everyone.
        </p>
        <p>A longer version of roughly what we will present is here:</p>
        {/* Same treatment the recordings get on the learn page, so a video
            reads the same wherever it appears. */}
        <iframe
          src="https://www.youtube.com/embed/F1oR8QlCnmI"
          title="Recording of the Calibrate walkthrough"
          className="w-full aspect-video rounded-xl overflow-hidden shadow-xl"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
        <p>
          Every recording and set of slides we have published sits on the{" "}
          <Link
            href="/learn"
            className="font-medium text-gray-900 underline underline-offset-2 decoration-gray-400 hover:decoration-gray-700"
          >
            learn page
          </Link>
          .
        </p>
      </>
    ),
  },
  {
    slug: "evaluation-is-all-you-need",
    title: "Evaluation is all you need",
    seoTitle: "How to evaluate your AI agents",
    date: "2026-08-17",
    author: "Aman Dalmia",
    authorUrl: "https://www.linkedin.com/in/aman-dalmia/",
    summary:
      "Evaluation is the missing piece that translates model capability to real impact.",
    image: "/blog/evaluation-is-all-you-need.png",
    body: (
      <>
        <p>
          Adding AI to your product has become ridiculously easy today. But
          after helping many teams over the last 15 months evaluate their new AI
          products, one pattern is hard to miss: they hardly ask if it is
          working as rigorously as they must.
        </p>
        <p>
          Even though AI is all we seem to hear about today, most software
          engineers have deep expertise building deterministic systems: once you
          write the optimal SQL query or test that an API call works, it is
          guaranteed to work every time you call it. Even so, building reliable
          deterministic systems is incredibly difficult. What if the API you
          were calling crashed or someone changed the database table names
          without notifying you or a myriad of other systemic and human failure
          modes.
        </p>
        <p>
          AI is fundamentally non-deterministic. Consider something basic: the
          same input can give different outputs every time you ask. Yet, because
          it looks like just another API call, it creates the illusion that AI
          engineering is just a narrow extension of software engineering.
        </p>
        <p>
          Evaluation, a cornerstone of machine learning, is often ignored. It
          baffled me at first, until I noticed the missing mindset shift among
          those entering this new wave of AI. Partly because no one seems to
          talk about it. It is not surprising then that most AI experiments
          don&apos;t move beyond pilots. Even worse is rolling out despite
          negative results, simply to meet deployment targets.
        </p>
        <p>
          The social sector operates in high-stakes domains: agriculture,
          health, education, livelihoods, poverty, to name a few. A mistake can
          genuinely impact someone&apos;s life as they are often not well
          equipped to distinguish an AI-generated response from an
          expert&apos;s advice. I am often asked questions like &ldquo;whether
          the team should move to the latest model released last week&rdquo;,
          but hardly &ldquo;are we sure the AI is responding accurately for the
          most critical inputs we receive&rdquo;. My response is always the same
          boring one: &ldquo;only the evals can answer that&rdquo;. I don&apos;t
          hear back from them after that, until the next model release.
        </p>
        <p>
          My experiments (and evals) have convinced me that many frontier models
          are already capable enough to solve many problems in the social impact
          space. The model is no longer the problem.
        </p>
        <p>So, where are we lacking?</p>
        <p>
          For our deterministic software systems, we have an established process
          of thinking about potential bugs when building a new feature through
          PRDs. Writing test cases helps verify one&apos;s code is bug-free and
          prevents any future changes from re-introducing a bug. When a new bug
          surfaces, we add a new test for it.
        </p>
        <p>
          Are you thinking about the &ldquo;bugs&rdquo; in your AI system? Are
          you writing the &ldquo;tests&rdquo; to catch them and prevent
          regressions? Are you &ldquo;updating your tests&rdquo; when &ldquo;new
          bugs&rdquo; are caught?
        </p>
        <p>
          For a long time, software engineers dreaded writing tests. The same is
          happening again with AI. Removing the friction in AI evals is what{" "}
          <Link
            href="/"
            className="font-medium text-gray-900 underline underline-offset-2 decoration-gray-400 hover:decoration-gray-700"
          >
            Calibrate
          </Link>{" "}
          aims to do.
        </p>
        <p>Open-source. Free. Self-hostable.</p>
      </>
    ),
  },
];
