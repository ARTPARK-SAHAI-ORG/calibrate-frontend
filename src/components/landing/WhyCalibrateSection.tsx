"use client";

import { Link } from "@/lib/nav";

/** The six reasons a social sector team has no dependable way to know whether
 * its AI works. Ordered as a narrative: what teams do today, why the AI itself
 * defeats it, why the stakes are higher here, and why neither more people nor
 * the existing tools fix it. Every point comes from the evaluation sessions we
 * run with partner teams, so do not add one we have not actually heard. */
const PROBLEMS: { title: string; description: string }[] = [
  {
    title:
      "Checking a few answers by hand is the standard, and it works on day one",
    description:
      "Most teams read a handful of replies before a release and ship if they look fine. Then fixing one complaint quietly breaks an answer that was already right, the list of cases to try by hand only grows, and the same mistake returns because the last fix was never written down.",
  },
  {
    title: "Ask the same question twice and you can get two different answers",
    description:
      "AI does not work like the rest of your software. It predicts the words most likely to come next rather than looking anything up, so the same question can be answered well one time and badly the next. One good answer tells you nothing about the next thousand.",
  },
  {
    title: "The models are weakest where your users are",
    description:
      "Most of what these models learned from is English text from the internet. Hindi is the fourth most spoken language in the world and barely appears. Answers get worse in the languages your users actually speak, and the model knows nothing about your programme, your guidelines, or what is true on the ground this month.",
  },
  {
    title: "A wrong answer costs more in your work than in most",
    description:
      "A shopping assistant that gets it wrong loses an order. A maternal health line that gets it wrong reaches a mother who has nobody else to ask. The people your AI serves are usually the least able to absorb a mistake and the least likely to report one.",
  },
  {
    title:
      "The people who know what a good answer looks like cannot check it themselves",
    description:
      "Your nurses, teachers and counsellors are the only ones who can say whether a reply is right. Today that means writing cases into a spreadsheet, waiting for an engineer to run them, and reading results that were not written for them. Most engineers have not done this kind of evaluation either, so it lands on one person and stalls.",
  },
  {
    title: "The tools that exist are not built for you",
    description:
      "They charge for every person you add, so bringing in the domain experts who most need to be there is what makes them expensive. They assume an engineering team to set them up. And they assume your data can sit on someone else's servers, which for health and child protection records it often cannot.",
  },
];

/** What teams should be able to expect instead. This is the vision Calibrate is
 * built towards, so every point maps to something the product does today or is
 * being built to do. */
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
      "The people who know the programme write the cases, set what a good answer is, and read the results without waiting on an engineer.",
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
    title: "Your data stays where you need it",
    description:
      "Calibrate is open source and can run on your own infrastructure, with no charge per person you add.",
  },
];

/**
 * The case for Calibrate, made before the reader meets any feature: the six
 * reasons knowing whether your AI works is hard today, then what it should look
 * like instead.
 */
export function WhyCalibrateSection() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="text-center mb-12 md:mb-16">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 mb-4 md:mb-6 leading-[1.1] tracking-[-0.02em] text-balance">
          Why AI evaluation is broken today
        </h2>
        <p className="text-base md:text-xl text-gray-500 text-pretty leading-relaxed max-w-3xl mx-auto">
          Almost no team building AI for a social programme has a dependable way
          to know whether it works. MIT studied 300 AI deployments in companies
          and found that 95 percent produced no measurable result, and the
          models themselves were rarely the reason. These are the reasons.
        </p>
      </div>

      <ol className="space-y-8 md:space-y-10">
        {PROBLEMS.map((problem, index) => (
          <li
            key={problem.title}
            className="grid grid-cols-1 md:grid-cols-[3.5rem_1fr] gap-2 md:gap-6 border-t border-gray-200 pt-6 md:pt-8"
          >
            {/* Tailwind's reset drops the marker an <ol> would normally give
                each row, so this number is the only one a reader gets. It is
                content, not decoration, and stays out of aria-hidden. */}
            <span className="font-mono text-sm font-semibold tabular-nums tracking-wider text-emerald-700">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <h3 className="text-xl md:text-2xl font-semibold text-gray-900 leading-[1.2] tracking-[-0.02em] text-balance">
                {problem.title}
              </h3>
              <p className="mt-3 text-base md:text-lg text-gray-500 leading-relaxed text-pretty">
                {problem.description}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="text-center mt-16 md:mt-24 mb-10 md:mb-14">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 leading-[1.1] tracking-[-0.02em] text-balance">
          What good AI evaluation looks like
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {GOALS.map((goal) => (
          <div
            key={goal.title}
            className="rounded-2xl border border-gray-200 bg-white p-5 md:p-7 text-left shadow-sm"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {goal.title}
            </h3>
            <p className="text-sm md:text-[15px] text-gray-500 leading-relaxed">
              {goal.description}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-12 md:mt-16 flex flex-col items-center gap-4 text-center">
        <p className="text-base md:text-lg text-gray-500 text-pretty max-w-2xl">
          New to this? We run a session for leaders on why AI evaluation matters
          and where to start.
        </p>
        <Link
          href="/learn#workshop-for-leaders"
          className="inline-flex items-center gap-2 px-5 md:px-6 py-2.5 md:py-3 text-sm md:text-base font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
        >
          See the session for leaders
        </Link>
      </div>
    </div>
  );
}
