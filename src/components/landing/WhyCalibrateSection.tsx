"use client";

import { Link } from "@/lib/nav";

/** Why checking answers by hand stops working once a product has real users. */
const MANUAL_LIMITS: { title: string; description: string }[] = [
  {
    title: "Fixing one thing breaks another",
    description:
      "You change the instructions to fix one complaint, and an answer that was already right quietly turns wrong. Nobody notices until a user does.",
  },
  {
    title: "There is more to read than anyone can read",
    description:
      "One person reviewing answers cannot keep up with the questions real users send every day.",
  },
  {
    title: "Every change costs a day",
    description:
      "The list of cases to try only grows, and every change means going through all of them again by hand.",
  },
  {
    title: "The same mistake comes back",
    description:
      "A fix that lives in someone's head is written down nowhere, so the next change makes it again.",
  },
];

/** What teams should be able to expect from their evaluation process. This is
 * the vision Calibrate is built towards, so every point maps to something the
 * product does today or is being built to do. */
const GOALS: { title: string; description: string }[] = [
  {
    title: "A repeatable way to find mistakes",
    description:
      "The same steps every time, so what gets caught does not depend on who is looking that day.",
  },
  {
    title: "Deploy without breaking what worked",
    description:
      "Every change is checked against everything your agent already got right.",
  },
  {
    title: "Your domain experts lead",
    description:
      "The people who know the programme decide what a good answer is.",
  },
  {
    title: "It holds as you grow",
    description: "The same process works whether you have 20 cases or 2,000.",
  },
  {
    title: "See failures before a user complains",
    description:
      "Live conversations are checked as they happen, so you hear about a problem from Calibrate and not from the people you serve.",
  },
  {
    title: "Spend your time on the product",
    description:
      "Calibrate is the evaluation setup, so your team does not have to build and maintain one.",
  },
];

function PointCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-7 text-left shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm md:text-[15px] text-gray-500 leading-relaxed">
        {description}
      </p>
    </div>
  );
}

/**
 * The case for Calibrate, made before the reader meets any feature: why
 * checking answers by hand stops working, what good evaluation looks like
 * instead, and why the domain expert has to be the one leading it.
 */
export function WhyCalibrateSection() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="max-w-4xl mx-auto text-center mb-10 md:mb-14">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 mb-4 md:mb-6 leading-[1.1] tracking-[-0.02em] text-balance">
          Checking your AI by hand stops working
        </h2>
        <p className="text-base md:text-xl text-gray-500 text-pretty leading-relaxed">
          Most teams building AI today read a few answers, decide they look
          fine, and ship. It is enough to launch. It is not enough to keep a
          product working once real people are using it.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {MANUAL_LIMITS.map((point) => (
          <PointCard key={point.title} {...point} />
        ))}
      </div>

      <div className="max-w-4xl mx-auto text-center mt-16 md:mt-24 mb-10 md:mb-14">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 leading-[1.1] tracking-[-0.02em] text-balance">
          What good AI evaluation looks like
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {GOALS.map((goal) => (
          <PointCard key={goal.title} {...goal} />
        ))}
      </div>

      <div className="mt-12 md:mt-16 rounded-2xl border border-gray-200 bg-white p-6 md:p-10 text-left shadow-sm">
        <h3 className="text-2xl md:text-3xl font-medium text-gray-900 mb-4 leading-[1.15] tracking-[-0.02em] text-balance">
          Your domain experts should be leading this
        </h3>
        <p className="text-base md:text-lg text-gray-500 leading-relaxed text-pretty">
          Whether an answer is good depends on the programme, the language and
          the person on the other side. Engineers rarely have that knowledge,
          and most have not done AI evaluation in this setting before, so the
          people best placed to judge quality end up left out of it. Calibrate
          is built so a domain expert can write the cases, set what a good
          answer looks like, and read the results without waiting on an
          engineer.
        </p>
        <Link
          href="/learn#workshop-for-leaders"
          className="mt-6 inline-flex items-center gap-2 px-5 md:px-6 py-2.5 md:py-3 text-sm md:text-base font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
        >
          See the session for leaders
        </Link>
      </div>
    </div>
  );
}
