/**
 * The Learn page. Every session must show up with its recording and its slides
 * playing on the page, pointing at the exact addresses we published, because a
 * wrong or missing address here is a dead end for the reader.
 *
 * Sessions are named here by their id, not their title. Titles and summaries
 * are copy that gets reworded; the id is what a shared link carries and what
 * the list down the left points at, so that is what this pins.
 */
import { render, screen, within } from "@/test-utils";
import LearnPage from "../learn/page";
import { WEBINARS_URL } from "@/constants/links";

type ExpectedTalk = {
  id: string;
  recordingEmbedUrl: string;
  recordingUrl: string;
  slidesEmbedUrl: string;
  slidesUrl: string;
};

const EXPECTED_TALKS: ExpectedTalk[] = [
  {
    id: "workshop-for-leaders",
    recordingEmbedUrl: "https://www.youtube.com/embed/Hsqm8lR1U8w",
    recordingUrl: "https://youtu.be/Hsqm8lR1U8w",
    slidesEmbedUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vTV6Fa34l5SF899zK4GUOQ2VwElkS4ShtiBz7_JkecfvY5CActCm30Dd7Gw0PuzYy368U-EHA-56uKD/embed?start=false&loop=false&delayms=3000",
    slidesUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vTV6Fa34l5SF899zK4GUOQ2VwElkS4ShtiBz7_JkecfvY5CActCm30Dd7Gw0PuzYy368U-EHA-56uKD/pub?start=false&loop=false&delayms=3000",
  },
  {
    id: "getting-started",
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
    id: "office-hours",
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

/** The block on the page for one session, and the title it is showing. */
function sessionOnPage(id: string) {
  const block = document.getElementById(id);
  if (!block) throw new Error(`No session on the page with the id "${id}"`);
  return { block, title: block.getAttribute("aria-label") ?? "" };
}

describe("LearnPage", () => {
  const originalDocsUrl = process.env.NEXT_PUBLIC_DOCS_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_DOCS_URL = "https://docs.example.com";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_DOCS_URL = originalDocsUrl;
  });

  it("shows every session, in the order we published them", () => {
    render(<LearnPage />);
    const onPage = screen
      .getAllByRole("region")
      .map((section) => section.getAttribute("id"));
    expect(onPage).toEqual(EXPECTED_TALKS.map((talk) => talk.id));
  });

  it("gives every session a title and a line on what it covered", () => {
    render(<LearnPage />);
    EXPECTED_TALKS.forEach((talk) => {
      const { block, title } = sessionOnPage(talk.id);
      expect(title).not.toBe("");
      expect(
        within(block).getByRole("heading", { level: 2 }),
      ).toHaveTextContent(title);
      expect(block.querySelector("h2 + p")?.textContent?.trim()).toBeTruthy();
    });
  });

  it.each(EXPECTED_TALKS)(
    "plays the recording and the slides for $id",
    (talk: ExpectedTalk) => {
      render(<LearnPage />);
      const { block, title } = sessionOnPage(talk.id);

      expect(within(block).getByTitle(`Recording of ${title}`)).toHaveAttribute(
        "src",
        talk.recordingEmbedUrl,
      );
      expect(within(block).getByTitle(`Slides from ${title}`)).toHaveAttribute(
        "src",
        talk.slidesEmbedUrl,
      );
    },
  );

  it.each(EXPECTED_TALKS)(
    "opens the recording and the slides for $id in a new tab",
    (talk: ExpectedTalk) => {
      render(<LearnPage />);
      const { block, title } = sessionOnPage(talk.id);

      const recording = within(block).getByRole("link", {
        name: `Open the recording of ${title} in a new tab`,
      });
      expect(recording).toHaveAttribute("href", talk.recordingUrl);
      expect(recording).toHaveAttribute("target", "_blank");
      expect(recording).toHaveAttribute("rel", "noopener noreferrer");

      const slides = within(block).getByRole("link", {
        name: `Open the slides from ${title} in a new tab`,
      });
      expect(slides).toHaveAttribute("href", talk.slidesUrl);
      expect(slides).toHaveAttribute("target", "_blank");
      expect(slides).toHaveAttribute("rel", "noopener noreferrer");
    },
  );

  it("links to the insights from workshop-for-leaders in that session's summary", () => {
    render(<LearnPage />);
    const { block } = sessionOnPage("workshop-for-leaders");
    // The words in the link say where it goes, so it reads correctly to
    // anyone who hears it out of the sentence around it.
    const insights = within(block).getByRole("link", {
      name: "summary of the insights",
    });
    expect(insights).toHaveAttribute(
      "href",
      "https://docs.google.com/document/d/e/2PACX-1vR9nJWvGTk0oisXlxAdjUZEANkLrnUjmmqxlE07BUxX3HVVkD5kcY_w65RJPJlONG9FEEQc5eL0A3Xv/pub",
    );
    expect(insights).toHaveAttribute("target", "_blank");
    expect(insights).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("links to the documentation, the calendar and the changelog at the top", () => {
    render(<LearnPage />);
    // The footer carries its own documentation and changelog links, so look
    // in the page body only.
    const main = within(screen.getByRole("main"));
    expect(main.getByRole("link", { name: "Documentation" })).toHaveAttribute(
      "href",
      "https://docs.example.com",
    );
    expect(
      main.getByRole("link", { name: "Upcoming sessions" }),
    ).toHaveAttribute("href", WEBINARS_URL);
    expect(main.getByRole("link", { name: "Changelog" })).toHaveAttribute(
      "href",
      "/changelog",
    );
  });

  it("lists every session down the left, each linking to its place on the page", () => {
    render(<LearnPage />);
    const onThisPage = within(
      screen.getByRole("navigation", { name: "Sessions on this page" }),
    );
    EXPECTED_TALKS.forEach((talk) => {
      const { title } = sessionOnPage(talk.id);
      expect(onThisPage.getByRole("link", { name: title })).toHaveAttribute(
        "href",
        `#${talk.id}`,
      );
    });
  });

  it("keeps the header and the footer, with the header logo linking home", () => {
    render(<LearnPage />);
    // The list of sessions down the left is a second set of navigation links,
    // so pick out the header by the one thing only it has.
    const header = screen
      .getAllByRole("navigation")
      .find((nav) => !nav.getAttribute("aria-label"))!;
    expect(
      within(header).getByRole("link", { name: /Calibrate/ }),
    ).toHaveAttribute("href", "/");
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Learn" })).toHaveAttribute(
      "href",
      "/learn",
    );
  });
});
