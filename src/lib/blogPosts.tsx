import type { ReactNode } from "react";
import Link from "next/link";

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
  /** The day it went up, as year-month-day. */
  date: string;
  author: string;
  /** One or two lines shown under the title on the list page, and given to
   * anyone who shares the link. */
  summary: string;
  body: ReactNode;
};

/** How a date reads on the page. UTC, so the day never shifts by timezone. */
export function formatPostDate(date: string): string {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function findPost(slug: string): BlogPost | undefined {
  return POSTS.find((post) => post.slug === slug);
}

export const POSTS: BlogPost[] = [
  {
    slug: "evaluation-is-all-you-need",
    title: "Evaluation is all you need",
    date: "2026-08-17",
    author: "Aman Dalmia",
    summary:
      "Teams are shipping AI faster than ever and hardly asking whether it works. What is missing is not a better model. It is evaluation.",
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
