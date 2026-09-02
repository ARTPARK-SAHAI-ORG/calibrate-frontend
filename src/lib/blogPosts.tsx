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
  /** What kind of post this is, shown as a pill on the list of posts. Left out
   * for an ordinary post. */
  kind?: string;
  /** One or two lines shown under the title on the list page, and given to
   * anyone who shares the link. */
  summary: string;
  /** Its own share picture, as a path from the site root. Falls back to
   * SHARE_IMAGE when a post has none. */
  image?: string;
  /** Whether that picture is also shown at the top of the post. A picture that
   * only works as a thumbnail beside a shared link sets this to false. */
  showImageOnPage?: boolean;
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

/** What kind of post this is, shown as a pill on the list of posts. */
export function PostKind({
  post,
  className = "",
}: {
  post: BlogPost;
  className?: string;
}) {
  if (!post.kind) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full border border-emerald-200/90 bg-emerald-50/90 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-900 ${className}`}
    >
      {post.kind}
    </span>
  );
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

/** How a link reads inside a post. */
const POST_LINK_CLASS =
  "font-medium text-gray-900 underline underline-offset-2 decoration-gray-400 hover:decoration-gray-700";

/** A link in a post to somewhere else on the web, which opens in a new tab. */
function PostLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={POST_LINK_CLASS}
    >
      {children}
    </a>
  );
}

/** The three heading sizes a post can use, largest first. */
function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="pt-6 text-2xl md:text-3xl font-medium text-gray-900 leading-tight tracking-[-0.02em]">
      {children}
    </h2>
  );
}

function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="pt-4 text-xl md:text-2xl font-medium text-gray-900 leading-tight tracking-[-0.01em]">
      {children}
    </h3>
  );
}

function H4({ children }: { children: ReactNode }) {
  return (
    <h4 className="pt-2 text-lg md:text-xl font-semibold text-gray-900">
      {children}
    </h4>
  );
}

/**
 * A picture in a post, with the line that explains it. The width and height
 * are the real ones, so the page does not jump as the pictures arrive. The
 * picture itself carries no words of its own because the line underneath it
 * already says what it shows.
 */
function Figure({
  src,
  width,
  height,
  caption,
}: {
  src: string;
  width: number;
  height: number;
  caption: ReactNode;
}) {
  return (
    <figure>
      <img
        src={src}
        alt=""
        width={width}
        height={height}
        loading="lazy"
        className="w-full rounded-xl border border-gray-200"
      />
      <figcaption className="mt-3 text-sm md:text-base text-gray-500 leading-relaxed">
        {caption}
      </figcaption>
    </figure>
  );
}

/**
 * A video from YouTube. A video with no address shows nothing at all, so a
 * recording that has not been uploaded yet leaves no empty box on the page.
 */
function PostVideo({ id, title }: { id: string; title: string }) {
  if (!id) return null;
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl border border-gray-200">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}`}
        title={title}
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
        className="h-full w-full"
      />
    </div>
  );
}

/** A note set to one side of the post. */
function Aside({ children }: { children: ReactNode }) {
  return (
    <blockquote className="border-l-2 border-gray-200 pl-5 text-gray-600">
      {children}
    </blockquote>
  );
}

/** The two screen recordings in the case study below, as YouTube video ids. */
const WEIGHTS_VIDEO_ID = "9j8Y142PWe4";
const REPLY_WEIGHTS_VIDEO_ID = "gMhKkaRJn10";

export function findPost(slug: string): BlogPost | undefined {
  return POSTS.find((post) => post.slug === slug);
}

export const POSTS: BlogPost[] = [
  {
    slug: "evaluating-a-form-filling-voice-agent",
    title:
      "Evaluating a form-filling voice agent that enrols mothers over a phone call",
    kind: "Case study",
    seoTitle: "How we evaluated a form-filling voice agent",
    date: "2026-09-02",
    author: "Aman Dalmia",
    authorUrl: "https://www.linkedin.com/in/aman-dalmia/",
    summary:
      "Our evaluation design for a voice agent that fills a form over a phone call, built on simulated calls, and what the first results say about the models we can deploy.",
    image: "/blog/evaluating-a-form-filling-voice-agent.png",
    // The picture is figure 9 from inside the post, so it is the thumbnail a
    // shared link shows but is not repeated at the top of the page.
    showImageOnPage: false,
    body: (
      <>
        <p>
          In India, almost every social benefit starts with a form, yet the
          people who need these benefits most are often unable to read or write.
          Someone needs to talk to them and fill the form on their behalf. Today
          that work falls to frontline health workers who enrol beneficiaries
          one at a time, a poor use of their stretched capacity. To solve this
          problem, we built{" "}
          <PostLink href="https://formbharo.artpark.ai/">FormBharo</PostLink>{" "}
          (&ldquo;fill the form&rdquo; in Hindi), a voice agent that fills a
          structured form over a phone call under tight latency and cost
          budgets. It is being piloted with{" "}
          <PostLink href="https://armman.org/">ARMMAN</PostLink>, to enrol
          low-income, Hindi-speaking mothers in antenatal and postnatal care.
          Watch a demo call below:
        </p>

        <PostVideo id="60cSy_doksc" title="A demo call with FormBharo" />

        <p>
          One of the most common questions I get is &ldquo;how do we build an
          evaluation dataset?&rdquo;. In this post, I aim to answer that by
          walking you through the evaluation design for FormBharo, as a case
          study. Even though your use case is different, the process and
          approach are transferable.
        </p>

        <H2>TL;DR</H2>

        <ul className="list-disc space-y-3 pl-6">
          <li>
            We explain why it is hard to perform this task reliably: calls often
            contain background noise; users alternate between Hindi and Hinglish
            and spell values in diverse ways, sometimes with pauses in between;
            they might not know the answer or refuse to answer; and the agent
            must reply quickly to feel like a real call, while staying cheap
            enough to run at scale.
          </li>
          <li>
            Under the hood, the agent listens to the caller, converts their
            speech to text, uses an LLM to extract the answer for each question
            on the form, validates it, decides which question to ask next, uses
            another LLM to generate the reply which is spoken back to the user.
          </li>
          <li>
            To evaluate this agent, we generated 960 simulated phone calls:
            LLM-generated user personas that mimic real users from our pilot and
            multiple realistic conversations for each one covering the most
            common scenarios; annotators matching our target user demographics
            record themselves speaking those conversations aloud, under
            different acoustic conditions (background noise, mic distance,
            speaking pace) to mimic real call environments.
          </li>
          <li>
            We used these simulated calls to test each component of the system
            separately:
            <ul className="list-disc space-y-3 pl-6">
              <li>
                <em>how accurate is the transcription?</em>
              </li>
              <li>
                <em>does the LLM extract the correct form values? </em>
              </li>
              <li>
                <em>does the LLM ask the right next question? </em>
              </li>
              <li>
                <em>does it end the call at the right time?</em>
              </li>
            </ul>
            But this does not capture how the agent performs end-to-end. So, we
            feed the output of one component as the input to the next one. This
            mimics what happens in a real call and helps us capture the impact
            of errors in one component on the components downstream.
          </li>
          <li>
            Some of our key findings:
            <ul className="list-disc space-y-3 pl-6">
              <li>
                Frontier models perform almost perfectly when transcription is
                perfect. But, once real transcripts are used, their performance
                degrades, worse for weaker models.
              </li>
              <li>
                Mistakes in data extraction per turn compound into significant
                performance drops at the overall form completion and even
                changes which models are the best performing. This is why
                end-to-end evaluation cannot be skipped.
              </li>
              <li>
                Good system design can make smaller, cheaper models viable by
                recovering some of their mistakes. This is critical for meeting
                our cost and latency needs.
              </li>
              <li>
                No single model is the best at cost, accuracy and latency at
                once. We share a simple method for finding the right model to
                deploy that trades off these 3 dimensions.
              </li>
            </ul>
          </li>
          <li>
            Even though your use case is different, the same process can be
            applied for your evaluation too: public benchmarks can inspire but
            not replace use-case specific benchmarks, start by thinking through
            the evaluation design carefully as outlined in this post, use
            synthetic data to build your first evaluation set before you deploy
            your AI solution to real users, and evaluate every component of your
            agent along with the agent end-to-end.
          </li>
        </ul>

        <H2>Setting up the problem</H2>

        <p>
          Before we discuss the evaluation design, we need to understand why
          filling forms is hard, how FormBharo does it and why it needs to be
          evaluated.
        </p>

        <Figure
          src="/blog/evaluating-a-form-filling-voice-agent/figure-1.png"
          width={1668}
          height={2008}
          caption={
            <>
              Figure 1: Call flow of the enrolment form being tested. The agent
              speaks first and asks one question at a time, in the order shown.
              The answers to the conditional questions (&ldquo;are you
              pregnant&rdquo;) decide which questions are asked next. Invalid
              answers either cause the flow to skip to the next question or end
              the call prematurely. Aadhaar is India&rsquo;s national ID.{" "}
            </>
          }
        />

        <p>
          <strong>Figure 1</strong> illustrates the intended flow for how the
          form must be filled. It highlights the diversity a single form can
          contain: &ldquo;name&rdquo; is an open-ended field, district is
          restricted to a fixed set of values, answers to conditional questions
          (like, whether the user is pregnant) dictate which questions come
          next, the child&rsquo;s date of birth must be a valid date in the
          past, the WhatsApp number must be 10 digits, and incorrect values
          could end the call prematurely.
        </p>

        <Figure
          src="/blog/evaluating-a-form-filling-voice-agent/figure-2.png"
          width={2010}
          height={937}
          caption={
            <>
              Figure 2: How FormBharo works. EXTRACT LLM extracts the form
              values from the transcribed text. A rule-based layer validates the
              extracted values, updates the form, and selects which question to
              ask next. REPLY LLM phrases that question to be spoken back to the
              user through a TTS model. The &ldquo;Anganwadi name&rdquo; is the
              public clinic&rsquo;s name.
            </>
          }
        />

        <p>
          <strong>Figure 2 </strong>shows how FormBharo works<strong>:</strong>{" "}
          A speech-to-text (STT) model transcribes the caller&rsquo;s speech. An
          LLM (called EXTRACT), extracts the relevant form values. A few rules
          are applied to validate the extracted value (for example,{" "}
          <em>is the phone number 10 digits?</em>{" "}
          <em>is the child&rsquo;s date of birth a valid past date?</em>). Valid
          values are stored in the form. A different set of rules picks the next
          question to ask, given the current state of the form. A second LLM,
          REPLY, phrases the question naturally, which a text-to-speech (TTS)
          model speaks back to the caller. If all the fields have been answered,
          the LLM decides to end the call instead.
        </p>

        <p>A lot of things can go wrong here:</p>

        <ul className="list-disc space-y-3 pl-6">
          <li>
            Users often call from areas with background noises of various kinds.
            The trickiest one being multiple background speakers, which makes it
            hard to understand which user&rsquo;s speech is relevant for the
            call.
          </li>
          <li>
            Many calls have background music with lyrics, which get transcribed
            too. Sometimes the noise is static but so loud that the user&rsquo;s
            speech is inaudible even for us.
          </li>
          <li>
            Users speak in colloquial terms to answer questions and often
            alternate between Hindi and Hinglish.
          </li>
          <li>
            Speech-to-text models are known to perform poorly on accurately
            capturing proper nouns.
          </li>
          <li>
            For certain fields, they might answer instantly (for example,
            whether they are pregnant) but for other questions (like phone
            numbers or ID) they might have to look it up first and the agent
            needs to wait.
          </li>
          <li>
            Numbers could be spelled out in groups of 2-3 letters/numbers with
            pauses in the middle, instead of saying it in one go (for example,
            &ldquo;2-3-4 4-2 4-2-3 3-9&rdquo;). This is challenging because the
            agent needs to distinguish when a pause indicates that the user is
            done speaking from a pause that indicates there is more to come to
            ensure it can respond quickly for the former while wait for a bit
            longer for the latter.
          </li>
          <li>
            The agent also needs to maintain the language it has been instructed
            to speak throughout the conversation without switching to english,
            which the users won&rsquo;t understand.
          </li>
          <li>
            If a user indicates they don&rsquo;t know the answer, the agent
            needs to correctly decide when to prompt them to re-answer with a
            helpful nudge or skip the question entirely or end the call if the
            question is mandatory.
          </li>
        </ul>

        <p>
          The agent needs to navigate these complexities while still being
          perceived as responding in real-time, which realistically gives a
          buffer of 1-2 seconds for responding. Coupled with this, given the
          scale of India and that India is a cost-sensitive market, every call
          should cost no more than Rs 2 per call at scale.
        </p>

        <H2>Evaluation design</H2>

        <p>
          Every potential error described above can be attributed to a specific
          component: the STT model, the extraction LLM or the reply LLM. We
          found several TTS models that sound good enough and so, exclude it
          from our first phase of evaluation.
        </p>

        <p>
          We evaluate our agent at two levels. <em>Unit tests</em> score each{" "}
          <strong>component in isolation</strong>: predicted transcripts against
          reference transcripts, extracted form data against the expected
          values, quality of the agent&rsquo;s response to the user and the
          ability to end the call at the right time. <em>End-to-end tests</em>{" "}
          chain the components to measure the{" "}
          <strong>end-to-end performance</strong> of the agent, mimicking how a
          real user interacts with it.
        </p>

        <H3>Dataset creation</H3>

        <p>
          We begin by defining 5{" "}
          <em>simulated user profiles (&ldquo;personas&rdquo;)</em>, each with
          fixed personal details, corresponding to the fields we intend to
          capture.
        </p>

        <H4>Synthetically generating calls using an LLM</H4>

        <p>
          For each <em>persona, </em>we generate several <em>simulated</em>{" "}
          <em>calls</em> with the agent. The expected flow for a call is the
          agent asking one question from the form at a time and the user
          providing the corresponding answer. Since the form has several
          conditional questions, it creates multiple branches that a user might
          traverse.
        </p>

        <Aside>
          <p>
            <em>
              For example: &ldquo;is pregnant → for 8 months&rdquo;, or
              &ldquo;is not pregnant → child&rsquo;s name is Ram → child&rsquo;s
              date of birth is 12 Feb 2026&rdquo;
            </em>
          </p>
        </Aside>

        <p>
          The user&rsquo;s past answers decide which branch it follows. Each
          simulated call follows one branch. For example, the same simulated
          user produces one call in which she is pregnant and another in which
          she is not. In total, that produces <strong>2×3×4×2=48</strong>{" "}
          distinct paths through the form, one call per path: two pregnancy
          branches (<em>pregnant or not</em>), three branches for whether the
          calling number is linked to the clinic (
          <em>
            linked, not linked and correct value provided, or not linked but not
            able to remember the linked number
          </em>
          ), four choices for whether the WhatsApp number is the same as the
          calling number (
          <em>
            same, not same and answered, not same but unable to recall the
            WhatsApp number, cannot recall if they are the same
          </em>
          ), and two branches for the Aadhaar digits (
          <em>answered or not known</em>).
        </p>

        <p>
          Across the 5 personas, this gives <strong>5×48=240 calls</strong>.
        </p>

        <p>
          We also account for 3 <em>acoustic variations</em> to ensure our
          dataset mimics the conditions in a public clinic:{" "}
          <strong>background noise</strong> (ambient chatter and nearby
          speakers), <strong>microphone distance</strong> (close or far, chosen
          at random), and <strong>speaking pace</strong> (fast or slow, chosen
          at random). Each call uses a single acoustic condition throughout
          (e.g. noisy environment or speaking slowly), since a caller&rsquo;s
          environment does not change mid-call. Each of the 240 calls are
          recorded in environments with each of the 3 acoustic variations, in
          addition to the ideal acoustic environment. This yields a total of{" "}
          <strong>240×4=960</strong> calls in our dataset.
        </p>

        <Figure
          src="/blog/evaluating-a-form-filling-voice-agent/figure-3.png"
          width={3000}
          height={1482}
          caption={
            <>Figure 3: Summary of how the simulated calls are generated</>
          }
        />

        <Figure
          src="/blog/evaluating-a-form-filling-voice-agent/figure-4.png"
          width={1994}
          height={666}
          caption={
            <>
              Figure 4: Representation for each user response in every turn. In
              the third row, the <strong>Value</strong> column captures the
              actual value of <strong>Number linked</strong> for the persona but{" "}
              <strong>Reference transcript</strong> captures what the user said
              in the simulated call.
            </>
          }
        />

        <p>
          The <em>value</em> is generated once for each persona whereas the{" "}
          <em>transcript </em>is generated for each call with <em>value </em>as
          a reference under field-specific constraints defined with ARMMAN. For
          example, names and district names with phonetically hard spellings, a
          user unable to recall their phone number, etc. Both generations use
          GPT 5.5.
        </p>

        <H4>Audio dataset</H4>

        <p>
          The <em>transcripts</em> generated for all 960 calls are deduplicated
          to get 380 unique transcripts that need to be recorded since there is
          a significant amount of duplication across the calls for each persona.
          Each unique transcript is spoken by an annotator to produce a
          recording.
        </p>

        <p>
          Five native Hindi speakers were selected to match the target
          demographic: all female, aged 18–35, drawn from two states (Uttar
          Pradesh and Maharashtra) to cover differences in accent and
          colloquialisms. Annotators were trained with sample recordings and
          recorded each answer under specific directives. For example, &ldquo;
          <em>
            record in a noisy environment, or keep the mic at least 25 cm away,
            or speak slowly
          </em>
          &rdquo;. A separate set of human supervisors listened to every clip to
          ensure the recordings met the requirements.
        </p>

        <p>This gave us 380 audio recordings.</p>

        <H3>Unit Tests</H3>

        <H4>Speech-to-Text</H4>

        <p>
          Word Error Rate (WER) is commonly used for comparing STT models.
          However, it is a poor metric for transcription quality on Indic
          languages and for agents: it counts every surface difference as an
          error (&ldquo;nine&rdquo; vs &ldquo;9&rdquo;), even when the meaning
          is unchanged.
        </p>

        <Figure
          src="/blog/evaluating-a-form-filling-voice-agent/figure-5.png"
          width={1310}
          height={368}
          caption={
            <>
              Figure 5: WER fails to capture semantic equivalence leading to
              unreliable transcription quality measurement (
              <PostLink href="https://www.sarvam.ai/blogs/evaluating-indian-language-asr">
                source
              </PostLink>
              ){" "}
            </>
          }
        />

        <p>
          So, we use{" "}
          <PostLink href="https://www.sarvam.ai/blogs/evaluating-indian-language-asr">
            LLM-WER
          </PostLink>{" "}
          instead: an LLM judge reviews every mismatch flagged by WER and
          classifies whether they are semantically equivalent or phonetically
          similar. The WER is then recomputed over the genuine errors.
        </p>

        <H4>Data extraction accuracy</H4>

        <p>
          To evaluate data extraction quality, we prepare unit tests at the{" "}
          <em>turn level</em> from every call, since every mistake happens at
          the turn level. Each test case contains the latest user response and
          the preceding conversation history as <em>input</em> the expected form
          values as the <em>ground truth</em>.
        </p>

        <Figure
          src="/blog/evaluating-a-form-filling-voice-agent/figure-6.png"
          width={2812}
          height={710}
          caption={
            <>
              Figure 6: Example of one test case for measuring the extraction
              accuracy. The right hand side shows a portion of the conversation
              history sent as input to the agent at the given turn and the left
              hand side shows the expected form value that should have been
              extracted (the &ldquo;ground truth&rdquo;). Translation of the
              last user message: &ldquo;No, for now I am not pregnant&rdquo;
            </>
          }
        />

        <p>
          The form values extracted by the agent are compared with the expected
          form values to compute the <em>extraction accuracy</em> for that test
          case as shown below.
        </p>

        <Figure
          src="/blog/evaluating-a-form-filling-voice-agent/figure-7.png"
          width={1048}
          height={686}
          caption={
            <>
              Figure 7: The agent&rsquo;s extracted form values are compared
              with the expected form values for the given turn
            </>
          }
        />

        <p>
          Fields like numbers, dates, and booleans are compared exactly with the
          expected values. But open-ended fields like names are harder to judge
          since the expected value can have many phonetic forms (
          <em>&ldquo;Lakshmi&rdquo;</em> versus <em>&ldquo;Laxmi&rdquo;</em>).
          So, we use a binary LLM judge instead to evaluate the extraction as
          shown below.
        </p>

        <Figure
          src="/blog/evaluating-a-form-filling-voice-agent/figure-8.png"
          width={2210}
          height={920}
          caption={
            <>
              Figure 8: Example of an LLM judge being used for evaluating
              open-ended fields like &ldquo;name&rdquo;. Translation of the last
              user message: &ldquo;My full name is Mrinmayee Kshirsagar&rdquo;
            </>
          }
        />

        <p>
          The LLM judge compares the agent&rsquo;s extracted value against the
          criteria given to it and evaluates whether the response passed the
          criteria or failed.
        </p>

        <p>
          To align the LLM judge, we{" "}
          <PostLink href="https://calibrate.artpark.ai/#human-alignment">
            compared its judgements with our review
          </PostLink>{" "}
          and iterated on the prompt until it was completely aligned with us.
          The accuracy of the LLM judge is validated on a separate unseen test
          set to avoid overfitting. Since the evaluation task for the LLM judge
          is narrow, achieving 100% alignment was possible.
        </p>

        <p>
          A conversation can have many turns. Each turn is converted into a test
          case. To ensure that every error can be attributed to the
          agent&rsquo;s mistake in that turn, the agent is assumed to respond
          perfectly to all previous turns in that test case. So, if a test case
          has 10 turns, 5 messages from the user and 5 responses from the agent,
          only the last response of the agent is evaluated, while the previous 4
          responses are kept 100% accurate. Deduplicating tests with identical
          inputs across all 960 calls yields 1,880 unit tests. We report the
          mean <em>extraction accuracy</em> over all of them.
        </p>

        <Figure
          src="/blog/evaluating-a-form-filling-voice-agent/figure-9.png"
          width={3000}
          height={1452}
          caption={
            <>
              Figure 9: An overview of how the turn-level unit tests are
              generated from the simulated calls
            </>
          }
        />

        <H4>Response quality</H4>

        <p>
          Similarly, we prepare unit tests from the calls to measure response
          quality, with two key differences. If you recall, the architecture of
          FormBharo has a rule-based layer in between the extraction and reply
          generation steps (Figure 2) which decides which question to ask next.
          Each test case additionally receives a tool call carrying the decision
          of the rule-based layer as an input too. So, if the rule-based layer
          decides that the &ldquo;district&rdquo; must be asked then, that
          decision is sent as input to the REPLY LLM, along with the
          conversation history. Figure 10 shows one example corresponding to the
          example for extraction accuracy shown in Figure 6.
        </p>

        <Figure
          src="/blog/evaluating-a-form-filling-voice-agent/figure-10.png"
          width={1276}
          height={940}
          caption={
            <>
              Figure 10: Example of a test case for measuring the response
              quality, for the same turn as the example used for extraction
              accuracy in Figure 6 above. Along with the conversation history,
              the decision from the rule-based layer of FormBharo is passed as
              an input to this LLM too, which says it needs to ask the
              child&rsquo;s name next.
            </>
          }
        />

        <p>
          Secondly, REPLY LLM either generates the next question or ends the
          call given the form state. The decision to end the call is recorded as
          a tool call and evaluated using exact match as shown below.
        </p>

        <Figure
          src="/blog/evaluating-a-form-filling-voice-agent/figure-11.png"
          width={1380}
          height={980}
          caption={
            <>
              Figure 11: Once all the form values have been captured, the agent
              decides to ends the call by invoking the &ldquo;end_call&rdquo;
              tool. Translation of the last user message: &ldquo;The last 4
              digits of my Aadhaar are 9367&rdquo;.
            </>
          }
        />

        <p>
          For every other case, we need to evaluate the generated reply. We use
          binary LLM judges to do that.
        </p>

        <p>Each reply is graded across 6 independent dimensions:</p>

        <p>
          <em>Correctness</em>: Does the response contain the right question?
        </p>

        <p>
          <em>Hindi adherence</em>: Is the response in Hindi?
        </p>

        <p>
          <em>Conciseness</em>: Is the response just one line?
        </p>

        <p>
          <em>No acknowledgment</em>: Does the response exclude any
          acknowledgements (like, &ldquo;Got it&rdquo;)? No acknowledgements in
          the response is considered a success.
        </p>

        <p>
          <em>No Value Echo</em>: Does the response echo the user&rsquo;s answer
          back to them?
        </p>

        <p>
          <em>Script Fidelity</em>: Does the response phrase the question
          correctly?
        </p>

        <p>
          We define an LLM judge for each dimension, which independently
          evaluates whether the agent&rsquo;s response passed or failed the
          criteria for that dimension.
        </p>

        <Figure
          src="/blog/evaluating-a-form-filling-voice-agent/figure-12.png"
          width={2260}
          height={1230}
          caption={
            <>
              Figure 12: Example of a response being rated by various
              independent LLM judges. Translation of the agent&rsquo;s response:
              &ldquo;Tell the name of your district&rdquo;
            </>
          }
        />

        <p>
          Using separate LLM judges for evaluating different dimensions
          independently helps us easily inspect where a mistake is, instead of
          having to read the reasoning for each test case to figure it out, as
          shown below.
        </p>

        <Figure
          src="/blog/evaluating-a-form-filling-voice-agent/figure-13.png"
          width={2258}
          height={1240}
          caption={
            <>
              Figure 13: Example of a failed test case where the response
              didn&rsquo;t pass the judgement for one of the LLM judges. Using
              independent LLM judges helps easily identify the source of
              mistakes. Translation of the last user message: &ldquo;Please tell
              your WhatsApp number&rdquo;.
            </>
          }
        />

        <p>
          Each of the LLM judges was calibrated by comparing our labels on a
          subset of the data. The figure below shows one example of how we
          improved the agreement of the LLM judges iteratively.
        </p>

        <Figure
          src="/blog/evaluating-a-form-filling-voice-agent/figure-14.png"
          width={1022}
          height={272}
          caption={
            <>
              Figure 14: Example of one LLM judge calibration. The first version
              of the LLM judge was only 67% aligned with our review. We iterated
              on the prompt until we reached 100% agreement.{" "}
            </>
          }
        />

        <p>
          An accurate response either passes all the LLM judgments or ends the
          call at the right time. We report the mean <em>response accuracy</em>.
          Similar to extraction accuracy, deduplicating the tests across the 960
          simulated calls, each call producing many tests, yields 1,880 unit
          tests: 920 require a reply, while the remaining 960 check whether the
          call is ended correctly.
        </p>

        <H3>End-to-end testing</H3>

        <p>
          Testing components in isolation is not enough. For the unit tests
          above, we assume that their inputs were perfect. For extraction
          accuracy, that means assuming the transcription was perfect. For
          response accuracy, we additionally assume the extraction was perfect
          as well.
        </p>

        <p>
          In practice, an end-to-end agent chains the components together, so
          the output of one feeds into the next. This means that errors
          propagate across components too. An incorrect transcription affects
          extraction accuracy. Also, we care about how the agent performs on the
          overall task of form completion, not just a single turn.
        </p>

        <p>We make the following changes to test our agent end-to-end:</p>

        <ul className="list-disc space-y-3 pl-6">
          <li>
            We replace the reference transcripts in the unit-test inputs (which
            assumes perfect transcription) with transcripts produced by the STT
            models. Thus, transcription errors propagate to the LLMs.
          </li>
        </ul>

        <Figure
          src="/blog/evaluating-a-form-filling-voice-agent/figure-15.png"
          width={2140}
          height={492}
          caption={
            <>
              Figure 15: An example comparing a unit test where the input
              assumes perfect transcription with an end-to-end test where
              transcription errors are propagated to the LLM{" "}
            </>
          }
        />

        <ul className="list-disc space-y-3 pl-6">
          <li>
            We compute <em>form completion accuracy</em> to measure the overall
            task performance using the mapping for every simulated call to its
            corresponding unit tests at each turn. For each call, starting from
            an empty form state, we accumulate the values extracted for each
            turn&rsquo;s unit test on top of each other sequentially. This gives
            us the predicted form at the end of each call. Comparing this
            against the expected values gives the{" "}
            <em>form-completion accuracy</em>: the fraction of form fields
            captured correctly at the end of the call.
          </li>
        </ul>

        <Figure
          src="/blog/evaluating-a-form-filling-voice-agent/figure-16.png"
          width={2748}
          height={934}
          caption={
            <>
              Figure 16: An example demonstration of how extractions for the
              unit tests at each turn of a call are rolled into the predicted
              form values and used to compute form-completion accuracy
            </>
          }
        />

        <p>
          To quantify the impact of this error propagation, we compute all the
          metrics using both the reference transcripts as input (perfect
          transcription) and the transcripts produced by each STT model.
        </p>

        <H3>Dataset summary</H3>

        <p>
          This gives us our final benchmark dataset of 380 audio recordings,
          3,760 multi-turn conversation tests across 960 simulated calls, which
          we call <strong>FormVoiceAgentBench</strong>.
        </p>

        <H2>Findings</H2>

        <H3>Transcription quality</H3>

        <p>
          The table below shows the comparison across 5 STT models. For all the
          columns, lower values are better.
        </p>

        <Figure
          src="/blog/evaluating-a-form-filling-voice-agent/table-1.png"
          width={892}
          height={334}
          caption={<>Table 1: Comparison of STT models</>}
        />

        <p>
          It shows that WER and LLM-WER disagree: <em>Nova-3 </em>(Deepgram) has
          the best WER yet the second-worst LLM-WER. This is even more
          pronounced because our reference transcripts are in Romanized Hindi
          whereas the predictions are in Devanagari. Following our reasoning
          before, we rank models by LLM-WER, which is robust to the script
          differences. <em>Chirp 3 </em>(Google) has the best LLM-WER but costs
          at least twice as much as any other model, while <em>Scribe v2</em>{" "}
          performs close to <em>Chirp 3</em> at a fraction of the cost.{" "}
          <em>GPT-4o-transcribe </em>(OpenAI) is the least accurate.{" "}
          <em>Scribe v2 </em>(ElevenLabs) and <em>Saaras v3</em> (Sarvam) are
          close to each other, both in terms of quality and cost. A detailed
          analysis of the transcription mistakes will be done in a separate post
          but you can see the full evaluation results along with the audio
          samples{" "}
          <PostLink href="https://calibrate.artpark.ai/public/stt/9d25da9f-2727-42ee-931d-422858017383">
            here
          </PostLink>
          .
        </p>

        <Aside>
          <p>
            <em>
              <PostLink href="https://calibrate.artpark.ai/">
                Calibrate
              </PostLink>{" "}
              is an open-source AI agent evaluation platform built for domain
              experts and non-profits. We built it because none of the existing
              evaluation platforms sufficiently addressed our evaluation needs
              and were often too hard to use, without an explicit focus on
              evaluation. All the evaluations covered in this blog post were run
              on Calibrate.
            </em>
          </p>
        </Aside>

        <H3>Turn-level extraction accuracy</H3>

        <Figure
          src="/blog/evaluating-a-form-filling-voice-agent/table-2.png"
          width={1044}
          height={566}
          caption={
            <>Table 2: Comparison of LLMs for turn-level extraction accuracy</>
          }
        />

        <Figure
          src="/blog/evaluating-a-form-filling-voice-agent/table-3.png"
          width={828}
          height={284}
          caption={
            <>
              Table 3: Drop in extraction accuracy and form completion accuracy
              when real transcripts are used
            </>
          }
        />

        <p>
          Table 2 compares various LLMs on per-turn extraction accuracy. Our
          observations:
        </p>

        <ul className="list-disc space-y-3 pl-6">
          <li>
            When <strong>perfect transcription is assumed</strong> (the{" "}
            <strong>Reference</strong> column), frontier models achieve{" "}
            <strong>almost perfect accuracy</strong>: GPT-5.5 leads at 99.79%,
            with Gemini 3.5 Flash (99.36%) and the two Claude models (99.15%)
            just behind.
          </li>
          <li>
            <strong>
              When real transcripts from STT models are used, we notice a
              performance drop
            </strong>
            . For transcripts generated by the STT model of ElevenLabs, the
            median drop in performance is modest (0.42 percentage points [pp]).
            But for the STT models by Sarvam and Deepgram, the drop is more
            significant (3.14 points). Weaker models degrade much more: GLM-5.1
            collapses by 35 points with Scribe v2 transcripts.
          </li>
          <li>
            <strong>Using real transcripts also changes the leaderboard</strong>
            . The best extraction accuracy drops to 98.94%, achieved by Gemini
            3.5 Flash and Claude Sonnet 4.6, with ElevenLabs STT, compared to
            99.79% by GPT 5.5 when perfect transcription is assumed.
          </li>
        </ul>

        <H3>End-to-end form completion</H3>

        <Figure
          src="/blog/evaluating-a-form-filling-voice-agent/table-4.png"
          width={1078}
          height={582}
          caption={
            <>Table 4: Comparison of LLMs for form completion accuracy</>
          }
        />

        <p>
          Similar to extraction accuracy, Table 4 shows the form-completion
          accuracy across all the LLMs being tested. A few interesting
          observations:
        </p>

        <ul className="list-disc space-y-3 pl-6">
          <li>
            <strong>
              The best model end-to-end differs from the best model per-turn
            </strong>
            : Under perfect transcription, GPT-5.5 leads extraction accuracy
            (99.79%), whereas Gemini 3 Flash and Gemini 3.5 Flash tie for the
            highest form-completion accuracy at 100%.
          </li>
          <li>
            <strong>
              The harness recovered the turn-level extraction errors
            </strong>
            : Gemini 3 Flash was #8 on the per-turn <strong>Reference</strong>{" "}
            leaderboard (Table 2) but became #1 on the form-completion
            leaderboard. Per-turn extraction accuracy evaluates the raw output
            produced by the LLM, whereas form-completion evaluates the values
            ultimately stored in the form after the rule-based layer (Figure 2)
            processes it. All the extraction errors for this model arise from a
            type mismatch: a numeric field being returned as a string by the
            LLM. The rule-based layer normalizes it before storing the value,
            preserving 100% form-completion accuracy.{" "}
            <strong>
              The agent harness around the LLM enabled a smaller model to
              perform better end-to-end even if its per-turn inference was not
              perfect
            </strong>
            .
          </li>
          <li>
            <strong>
              Form completion accuracy degrades significantly with real
              transcripts
            </strong>
            : median form-completion accuracy drops by 7.67 percentage points
            with Saaras v3, 7.38 points with Scribe v2, and 13.56 points with
            Nova-3 (Table 3), compared with median per-turn extraction drops of
            only 0.42–3.14 points. So, although the rule-based layer recovers
            some extraction errors, uncorrected errors can accumulate across
            turns to produce a larger degradation end-to-end.
          </li>
        </ul>

        <H3>Response quality</H3>

        <Figure
          src="/blog/evaluating-a-form-filling-voice-agent/table-5.png"
          width={710}
          height={320}
          caption={<>Table 5: Comparison of LLMs for response quality</>}
        />

        <p>
          Similar to the previous sections, we saw almost perfect performance by
          frontier models when transcription errors are ignored but some
          degradation when real transcripts are used and errors are propagated
          across the components.
        </p>

        <H2>Selecting which models to deploy</H2>

        <p>
          We need to choose 3 models for deployment: the STT model, the LLM that
          extracts form values and the LLM that generates the reply for the
          user. From Table 3, since Scribe v2 causes the least degradation in
          performance, we select it for deployment.
        </p>

        <p>
          For selecting the extraction LLM, we compare the form completion
          accuracy on the Scribe v2 transcripts. First, we discard the models
          that fail to meet our deployment constraints: latency below 5 seconds
          and form-completion accuracy above 90%. This leaves behind six
          candidates, all of which are on the{" "}
          <PostLink href="https://www.sciencedirect.com/topics/engineering/pareto-frontier">
            Pareto frontier
          </PostLink>
          : meaning, none of the remaining models is worse than every other
          model on all 3 dimensions at once: cost, latency or accuracy.
        </p>

        <p>
          So, we rank the models instead by assigning weights to cost, latency
          and accuracy such that it reflects their relative importance for our
          use case. Changing the weights gives the best model accordingly.
        </p>

        <p>
          You can view the full comparison of the extraction LLMs on the Scribe
          v2 transcripts{" "}
          <PostLink href="https://calibrate.artpark.ai/public/benchmark/4431ba9d-0ca2-457b-b924-e194d5414b1c">
            here
          </PostLink>
          . You can see the output of every LLM we tested across all the tests
          cases from the <strong>Results</strong> tab by following the link, as
          shown below.
        </p>

        <Figure
          src="/blog/evaluating-a-form-filling-voice-agent/figure-17.png"
          width={2630}
          height={1316}
          caption={
            <>
              Figure 17: Example of viewing the results for each test case for
              every model on Calibrate
            </>
          }
        />

        <p>
          The <strong>Model selection</strong> lets you see the impact of
          changing the individual weights on the leaderboard as shown below.
        </p>

        <PostVideo
          id={WEIGHTS_VIDEO_ID}
          title="Changing the weights for cost, latency and accuracy on the leaderboard"
        />

        <Aside>
          <p>
            <em>
              Note: the evaluation run on Calibrate shows the per-turn
              extraction accuracy, not the form completion accuracy, since it
              evaluates the raw LLM outputs only. The form completion accuracy
              is calculated deterministically from the turn-level extractions
              separately and the best extraction model (Gemini 3.5 flash) is
              selected with form-completion accuracy as the accuracy metric.
            </em>
          </p>
        </Aside>

        <p>
          Similarly, the full comparison of different LLMs for reply generation
          on the Scribe v2 transcripts can be seen{" "}
          <PostLink href="https://calibrate.artpark.ai/public/benchmark/38b4d5d2-462c-4a58-b194-20effcdecf7a">
            here
          </PostLink>
          . In this case, GPT 5.4 mini comes out on top for all the weight
          combinations where the weight for accuracy is &lt; 0.7.
        </p>

        <PostVideo
          id={REPLY_WEIGHTS_VIDEO_ID}
          title="Changing the weights on the leaderboard for the reply models"
        />

        <H2>Insights</H2>

        <p>
          Summarising the key takeaways from this case study on evaluating our
          voice agent:
        </p>

        <ul className="list-disc space-y-3 pl-6">
          <li>
            You need to methodically think of the evaluation design specific to
            your agent and use case. Existing public benchmarks (like this one)
            can serve as inspirations but every agent requires bespoke
            evaluation.
          </li>
          <li>
            Synthetic data can provide a great starting point. If you operate in
            highly sensitive domains, you don&rsquo;t have the luxury to deploy
            your AI system first and then, start building your evaluation
            dataset using real user interactions. You need to gather enough
            confidence before deployment. LLMs can be used to create
            high-quality evaluation datasets. But you need to do this carefully
            and with a sound evaluation design in place.
          </li>
          <li>
            If your agent is composed of multiple components, a good evaluation
            system would measure both the accuracy of each component and the
            agent end-to-end. In the example above, we saw how transcription
            errors caused degradation in extraction accuracy once the components
            were chained together.
          </li>
          <li>
            It is important to measure the overall task-level performance of
            your agent. For us, extraction errors in each turn compound into a
            large performance drop in form-completion accuracy.
          </li>
          <li>
            Your agent harness, or, simply put, how you orchestrate different
            models to create your agent, matters a lot. The right harness can
            overcome limitations of the underlying models to enable smaller,
            cheaper models to perform equally as well as larger, costlier
            models. Our rule-based engine recovered minor extraction errors by
            Gemini 3.5 Flash at the turn level to produce a much higher
            form-completion accuracy end-to-end, enabling it to jump from #8 in
            the turn-level extraction leaderboard to #1 in the form-completion
            leaderboard.
          </li>
          <li>
            Any realistic deployment cares about 2 other metrics beyond
            accuracy: cost and latency. Deployment constraints can be applied to
            filter out irrelevant models. The Pareto frontier helps you further
            narrow down the list of candidates. One way to make a concrete
            decision is to assign weights to cost, quality and latency, that
            reflect their relative importance. Varying these weights to match
            your deployment requirements will produce the best model tailored to
            you.
          </li>
        </ul>

        <H2>Next steps</H2>

        <p>
          We are already in the process of creating a second version of the
          benchmark covering more linguistic and acoustic variations to
          replicate the challenges faced during our pilot more closely while
          expanding to more local languages beyond Hindi (Marathi, Telugu, and
          Kannada). One of the limitations of the current dataset is that the
          audio recordings are read aloud from scripted transcripts, not
          captured from spontaneous, real calls.
        </p>

        <p>
          Our current evaluation design is tied to the current architecture. To
          make the evaluation more general purpose and architecture agnostic, we
          are setting up{" "}
          <PostLink href="https://calibrate.artpark.ai/#simulations">
            end-to-end voice simulations
          </PostLink>{" "}
          with realistic user personas where any voice agent, irrespective of
          its architecture, can be evaluated. Here, one voice agent mimics the
          user and converses with the form-filling voice agent built by
          FormBharo and its performance is evaluated at the end of each call.
          The biggest hurdle here is ensuring the simulated users can accurately
          replicate the challenges of a real call. One such challenge is
          background noise. To handle that, we are working on simulating
          different types of background noise (music, multiple speakers, car
          horn, dog barking, etc.) that we have noticed from our pilot and
          adding it to the simulated calls. Early results indicate that the
          agent&rsquo;s performance drops when the simulated background noise is
          injected into the call. Ironically, this is promising because it gives
          us confidence that we can create realistic simulations.
        </p>

        <p>
          We have pilots with other non-profits and government partners in
          progress now. But, manually creating the evals for each form is not
          scalable. So, we are preparing a recipe to automatically generate
          synthetic evaluations for any form using the framework described
          above, by expanding it to make it more general purpose.
        </p>

        <p>
          Although we compute form completion accuracy, certain fields carry
          more importance than others. So, computing field-level form completion
          accuracy will give a clearer picture of where the issues are and
          whether the agent is ready for scale.
        </p>

        <p>
          Depending on the call duration, the cost per call ranges from ~Rs. 4
          to ~Rs. 20 today, the bulk of which comes from LLM API calls. Although
          accuracy and latency are our biggest concerns at present, we will work
          on identifying ways to reduce the cost to meet the milestone of ~Rs.
          2/call without compromising on latency or accuracy.
        </p>

        <p>
          Finally, we are continuously monitoring all our deployments through
          the{" "}
          <PostLink href="https://calibrate.artpark.ai/#monitoring">
            automated traces on Calibrate
          </PostLink>{" "}
          so that users can easily report errors and every error can be
          converted into either a structured unit test or a simulation.
        </p>

        <H2>Closing notes</H2>

        <p>
          The full implementation details can be found in our preprint here:{" "}
          <PostLink href="https://arxiv.org/abs/2608.06027">
            https://arxiv.org/abs/2608.06027
          </PostLink>
        </p>

        <p>
          FormBharo is also publicly available now. You can create a voice agent
          for your forms at:{" "}
          <PostLink href="https://formbharo.artpark.ai">
            https://formbharo.artpark.ai
          </PostLink>
        </p>

        <p>
          If you have any feedback to share with us or if this post helped you
          think about the evaluation for your use case, please{" "}
          <PostLink href="https://www.linkedin.com/in/aman-dalmia/">
            drop me a note
          </PostLink>
          .
        </p>

        <p>
          <em>
            If you find this type of work interesting or want to transition into
            the social sector, we are hiring{" "}
            <PostLink href="https://www.artpark.in/careers-1/senior-ai-engineer">
              Voice AI engineers
            </PostLink>
            ,{" "}
            <PostLink href="https://www.artpark.in/careers-1/developer-advocate">
              Developer Advocates
            </PostLink>{" "}
            and{" "}
            <PostLink href="https://www.artpark.in/careers-1/ai-ml-engineer">
              ML engineers
            </PostLink>{" "}
            in our team.
          </em>
        </p>
      </>
    ),
  },
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
          If you are attending too,{" "}
          <a
            href="https://www.linkedin.com/in/aman-dalmia/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-gray-900 underline underline-offset-2 decoration-gray-400 hover:decoration-gray-700"
          >
            let's connect
          </a>{" "}
          .
        </p>

        <p>
          To learn more about Calibrate, you can see our past talks and
          tutorials{" "}
          <Link
            href="/learn"
            className="font-medium text-gray-900 underline underline-offset-2 decoration-gray-400 hover:decoration-gray-700"
          >
            here
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
          equipped to distinguish an AI-generated response from an expert&apos;s
          advice. I am often asked questions like &ldquo;whether the team should
          move to the latest model released last week&rdquo;, but hardly
          &ldquo;are we sure the AI is responding accurately for the most
          critical inputs we receive&rdquo;. My response is always the same
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
