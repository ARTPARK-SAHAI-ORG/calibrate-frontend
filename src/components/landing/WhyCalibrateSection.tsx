"use client";

import { Link } from "@/lib/nav";

/* Every picture below shares one 120x58 box: the drawing sits in the top 38
 * units and its words on the baseline at 54. The words are the point. A shape
 * on its own does not tell anyone what a mistake costs or who is blocked, so no
 * picture here ships without them. Grey is the ordinary state, emerald is what
 * works, red is what goes wrong.
 *
 * No invented numbers in the labels. A chat agent is also only one of the
 * things Calibrate evaluates, alongside tool calls, extracted data, speech to
 * text and text to speech, so the words never assume a conversation. */

const ART_BOX = "0 0 120 58";
const ART_CLASS = "h-[4.5rem] w-auto";

/** A word or two on the baseline, naming what the drawing above it shows. */
function ArtLabel(props: { x: number; children: string }) {
  return (
    <text
      x={props.x}
      y="54"
      textAnchor="middle"
      fontSize="9.5"
      fontWeight="600"
      className="fill-gray-400"
    >
      {props.children}
    </text>
  );
}

/** A person: head above shoulders, drawn once and reused. The shoulders are a
 * dome with a flat bottom rather than a rounded rectangle, which at this size
 * would just read as a second circle. */
function ArtPerson(props: { x: number; className: string }) {
  const { x } = props;
  return (
    <g className={props.className}>
      <circle cx={x} cy="10" r="7.5" />
      <path
        d={`M${x - 11} 36 L${x - 11} 29 a11 10 0 0 1 22 0 L${x + 11} 36 Z`}
      />
    </g>
  );
}

/** A bar with its name under it, for the "this against that" pictures. */
function ArtBar(props: {
  x: number;
  height: number;
  className: string;
  label: string;
}) {
  return (
    <>
      <rect
        x={props.x}
        y={38 - props.height}
        width="32"
        height={props.height}
        rx="4"
        className={props.className}
      />
      <ArtLabel x={props.x + 16}>{props.label}</ArtLabel>
    </>
  );
}

/** Everything one release produces, as a block of squares. `checked` is how
 * many of them anyone actually looks at. */
function ArtCheckGrid(props: { checked: number; label: string }) {
  return (
    <svg viewBox={ART_BOX} className={ART_CLASS} aria-hidden>
      {Array.from({ length: 36 }, (_, i) => (
        <rect
          key={i}
          x={2 + (i % 12) * 10}
          y={4 + Math.floor(i / 12) * 11}
          width="7"
          height="7"
          rx="1.5"
          className={i < props.checked ? "fill-emerald-500" : "fill-gray-200"}
        />
      ))}
      <ArtLabel x={60}>{props.label}</ArtLabel>
    </svg>
  );
}

/** One of the two results the same input produced. */
function ArtResultPill(props: {
  y: number;
  className: string;
  mark: string;
  label: string;
}) {
  return (
    <>
      <rect
        x="6"
        y={props.y}
        width="108"
        height="16"
        rx="5"
        className={props.className}
      />
      <path
        d={props.mark}
        className="stroke-white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <text
        x="72"
        y={props.y + 11.5}
        textAnchor="middle"
        fontSize="9.5"
        fontWeight="600"
        fill="white"
      >
        {props.label}
      </text>
    </>
  );
}

/** Four bars that keep growing, for the two pictures about scale and cost. */
function ArtGrowingBars(props: { redLast?: boolean }) {
  return (
    <>
      {[10, 17, 25, 34].map((height, i) => (
        <rect
          key={height}
          x={14 + i * 24}
          y={38 - height}
          width="16"
          height={height}
          rx="3"
          className={
            props.redLast && i === 3 ? "fill-red-400" : "fill-gray-200"
          }
        />
      ))}
    </>
  );
}

const problemArt = {
  differentResults: (
    <svg viewBox={ART_BOX} className={ART_CLASS} aria-hidden>
      <ArtResultPill
        y={2}
        className="fill-emerald-500"
        mark="M16 9 l4 4 l7 -8"
        label="first time"
      />
      <ArtResultPill
        y={21}
        className="fill-red-400"
        mark="M16 25 l9 8 M25 25 l-9 8"
        label="second time"
      />
      <ArtLabel x={60}>the same input</ArtLabel>
    </svg>
  ),
  weakestLanguage: (
    <svg viewBox={ART_BOX} className={ART_CLASS} aria-hidden>
      <ArtBar x={16} height={34} className="fill-gray-300" label="English" />
      <ArtBar x={72} height={11} className="fill-red-400" label="Kannada" />
    </svg>
  ),
  reachesAPerson: (
    <svg viewBox={ART_BOX} className={ART_CLASS} aria-hidden>
      {[18, 46, 74, 102].map((x, i) => (
        <ArtPerson
          key={x}
          x={x}
          className={i === 1 ? "fill-red-400" : "fill-gray-200"}
        />
      ))}
      <ArtLabel x={60}>it reaches a real person</ArtLabel>
    </svg>
  ),
  byHand: <ArtCheckGrid checked={3} label="a few checked, the rest not" />,
  landsOnEngineers: (
    <svg viewBox={ART_BOX} className={ART_CLASS} aria-hidden>
      <ArtPerson x={24} className="fill-emerald-500" />
      <rect
        x="56"
        y="0"
        width="8"
        height="38"
        rx="3"
        className="fill-red-400"
      />
      <ArtPerson x={96} className="fill-gray-300" />
      <ArtLabel x={24}>expert</ArtLabel>
      <ArtLabel x={96}>engineer</ArtLabel>
    </svg>
  ),
  perSeat: (
    <svg viewBox={ART_BOX} className={ART_CLASS} aria-hidden>
      <ArtGrowingBars redLast />
      <ArtLabel x={60}>cost per person added</ArtLabel>
    </svg>
  ),
};

/** The answers. Where a goal undoes a problem its picture mirrors that
 * problem's: the block that was mostly unchecked is now all emerald, and the
 * wall between the expert and the engineer is gone. */
const goalArt = {
  repeatable: (
    <svg viewBox={ART_BOX} className={ART_CLASS} aria-hidden>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect
            x={6 + i * 42}
            y="8"
            width="26"
            height="24"
            rx="5"
            className="fill-emerald-500"
          />
          {i < 2 ? (
            <path
              d={`M${35 + i * 42} 20 H${43 + i * 42} M${39 + i * 42} 16 L${44 + i * 42} 20 L${39 + i * 42} 24`}
              className="stroke-gray-300"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ) : null}
        </g>
      ))}
      <ArtLabel x={60}>the same steps, every time</ArtLabel>
    </svg>
  ),
  nothingBreaks: <ArtCheckGrid checked={36} label="all of them checked" />,
  expertsLead: (
    <svg viewBox={ART_BOX} className={ART_CLASS} aria-hidden>
      <rect
        x="38"
        y="24"
        width="44"
        height="6"
        rx="3"
        className="fill-gray-200"
      />
      <ArtPerson x={24} className="fill-emerald-500" />
      <ArtPerson x={96} className="fill-gray-300" />
      <ArtLabel x={24}>expert</ArtLabel>
      <ArtLabel x={96}>engineer</ArtLabel>
    </svg>
  ),
  holdsAsYouGrow: (
    <svg viewBox={ART_BOX} className={ART_CLASS} aria-hidden>
      <ArtGrowingBars />
      <line
        x1="8"
        y1="4"
        x2="112"
        y2="4"
        className="stroke-emerald-500"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <ArtLabel x={60}>your effort stays flat</ArtLabel>
    </svg>
  ),
  caughtEarly: (
    <svg viewBox={ART_BOX} className={ART_CLASS} aria-hidden>
      {[12, 36, 60, 84, 108].map((cx, i) => (
        <circle
          key={cx}
          cx={cx}
          cy="20"
          r="7"
          className={i === 2 ? "fill-red-400" : "fill-gray-200"}
        />
      ))}
      <circle
        cx="60"
        cy="20"
        r="14"
        fill="none"
        className="stroke-emerald-500"
        strokeWidth="3.5"
      />
      <ArtLabel x={60}>found before users do</ArtLabel>
    </svg>
  ),
  timeOnTheAi: (
    <svg viewBox={ART_BOX} className={ART_CLASS} aria-hidden>
      <rect
        x="2"
        y="6"
        width="84"
        height="28"
        rx="6"
        className="fill-emerald-500"
      />
      <rect
        x="92"
        y="6"
        width="26"
        height="28"
        rx="6"
        className="fill-gray-200"
      />
      <ArtLabel x={44}>improving your AI</ArtLabel>
      <ArtLabel x={105}>setup</ArtLabel>
    </svg>
  ),
};

type Point = {
  key: string;
  art: React.ReactNode;
  title: string;
  description: string;
};

/** The argument runs in two halves and the headings carry it: the AI fails
 * where you cannot see it, and then nothing a team has today catches that.
 * Every point comes from the evaluation sessions we run with partner teams, so
 * do not add one we have not actually heard. */
const FAILS_UNSEEN: Point[] = [
  {
    key: "different-results",
    art: problemArt.differentResults,
    title: "Unpredictable responses for the same input",
    description:
      "AI systems make educated guesses. For the same input, the guess can change every time, leaving room for errors.",
  },
  {
    key: "weakest-language",
    art: problemArt.weakestLanguage,
    title: "Weakest in the language your users speak",
    description:
      "These models are trained on data from the internet which is dominated by a few languages, and they know nothing about your programme or your guidelines.",
  },
  {
    key: "reaches-a-person",
    art: problemArt.reachesAPerson,
    title: "A mistake reaches a person, not an order",
    description:
      "A shopping assistant that gets it wrong loses a sale. A health line that gets it wrong reaches someone with nobody else to ask.",
  },
];

const NOTHING_CATCHES_IT: Point[] = [
  {
    key: "by-hand",
    art: problemArt.byHand,
    title: "Checking a few by hand is all anyone does",
    description:
      "Someone looks over a few answers before a release and goes ahead if they look fine. That works on day one, not once real users arrive.",
  },
  {
    key: "lands-on-engineers",
    art: problemArt.landsOnEngineers,
    title: "It lands on engineers who do not know your domain",
    description:
      "Engineers cannot say whether an answer is right for your programme, and the people who can are left out of the work.",
  },
  {
    key: "per-seat",
    art: problemArt.perSeat,
    title: "The tools that exist charge for every person you add",
    description:
      "AI evaluation tools are priced per person, so inviting the experts who most need to take part is what makes them unaffordable.",
  },
];

/** What teams should be able to expect instead, one for one with the goals we
 * set out in the sessions. Self-hosting and pricing are deliberately NOT here:
 * they belong to the open source section further down the page. */
const GOALS: Point[] = [
  {
    key: "repeatable",
    art: goalArt.repeatable,
    title: "One repeatable way to find mistakes",
    description: "The same steps every time, whoever is looking.",
  },
  {
    key: "nothing-breaks",
    art: goalArt.nothingBreaks,
    title: "Release changes without breaking what worked",
    description:
      "Every change is checked against everything the AI already got right.",
  },
  {
    key: "experts-lead",
    art: goalArt.expertsLead,
    title: "Your domain experts lead",
    description:
      "The people who know the work decide what good looks like, and check it themselves.",
  },
  {
    key: "holds",
    art: goalArt.holdsAsYouGrow,
    title: "More to check does not mean more work",
    description:
      "The effort on your side stays the same as the amount to check grows.",
  },
  {
    key: "caught-early",
    art: goalArt.caughtEarly,
    title: "Catch failures before users do",
    description: "What your AI does once it is live is checked as it happens.",
  },
  {
    key: "time-on-the-ai",
    art: goalArt.timeOnTheAi,
    title: "Spend your time on the AI",
    description:
      "Your team improves the AI instead of building the evaluation setup around it.",
  },
];

function PointCard(props: {
  art: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 md:p-6 text-left shadow-sm">
      <div className="mb-4 flex h-[4.5rem] items-center">{props.art}</div>
      <h4 className="text-lg font-semibold text-gray-900 mb-2 text-balance">
        {props.title}
      </h4>
      <p className="text-sm md:text-[15px] text-gray-500 leading-relaxed">
        {props.description}
      </p>
    </div>
  );
}

function PointGrid(props: { points: Point[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
      {props.points.map((point) => (
        <PointCard
          key={point.key}
          art={point.art}
          title={point.title}
          description={point.description}
        />
      ))}
    </div>
  );
}

const groupHeadingClass =
  "text-center text-2xl md:text-3xl font-medium text-gray-900 leading-[1.15] tracking-[-0.02em] text-balance mb-6 md:mb-8";

/**
 * The case for Calibrate, made before the reader meets any feature. It runs as
 * an argument in three beats: the AI fails where nobody can see it, nothing a
 * team has today catches that, and here is what should exist instead.
 */
export function WhyCalibrateSection() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-10 md:mb-14">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 mb-4 md:mb-5 leading-[1.1] tracking-[-0.02em] text-balance">
          Why AI evaluation is broken today
        </h2>
        <p className="text-base md:text-xl text-gray-500 text-pretty max-w-2xl mx-auto">
          As AI becomes more capable, the risks of misuse and harm increase too.
          More teams are using AI, but often without the checks needed to deploy
          it responsibly.
        </p>
      </div>

      <h3 className={groupHeadingClass}>Why this matters</h3>
      <PointGrid points={FAILS_UNSEEN} />

      <h3 className={`${groupHeadingClass} mt-14 md:mt-20`}>
        And nothing you have today catches it
      </h3>
      <PointGrid points={NOTHING_CATCHES_IT} />

      <div className="text-center mt-16 md:mt-24 mb-8 md:mb-12">
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 leading-[1.1] tracking-[-0.02em] text-balance">
          What good AI evaluation looks like
        </h2>
      </div>
      <PointGrid points={GOALS} />

      {/* Two sessions on /learn, in the order a newcomer needs them: why
          evaluation matters at all, then how Calibrate does it. */}
      <div className="mt-10 md:mt-14 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 md:gap-4">
        <Link
          href="/learn#workshop-for-leaders"
          className="inline-flex items-center justify-center gap-2 px-5 md:px-6 py-2.5 md:py-3 text-sm md:text-base font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
        >
          Watch AI Evals 101
        </Link>
        <Link
          href="/learn#getting-started"
          className="inline-flex items-center justify-center gap-2 px-5 md:px-6 py-2.5 md:py-3 text-sm md:text-base font-medium border border-gray-300 text-gray-900 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
        >
          Watch Calibrate 101
        </Link>
      </div>
    </div>
  );
}
