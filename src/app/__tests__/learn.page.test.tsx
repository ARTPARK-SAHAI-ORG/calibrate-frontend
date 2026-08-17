/**
 * The Learn page. Every entry must show up with whatever it has, a recording, a
 * set of slides, or both, pointing at the exact addresses we published, because
 * a wrong or missing address here is a dead end for the reader.
 *
 * Entries are named here by their id, not their title. Titles and summaries are
 * copy that gets reworded; the id is what a shared link carries and what the
 * list down the left points at, so that is what this pins.
 */
import { render, screen, within } from "@/test-utils";
import LearnPage from "../learn/page";
import { WEBINARS_URL } from "@/constants/links";

type ExpectedTalk = {
  id: string;
  /** Left out for a deck we wrote with no session behind it. */
  recordingEmbedUrl?: string;
  recordingUrl?: string;
  /** Left out for a recording that came with no slides. */
  slidesEmbedUrl?: string;
  slidesUrl?: string;
};

const EXPECTED_TALKS: ExpectedTalk[] = [
  {
    id: "calibrate-demo",
    recordingEmbedUrl: "https://www.youtube.com/embed/F1oR8QlCnmI",
    recordingUrl: "https://youtu.be/F1oR8QlCnmI",
  },
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
    id: "intro-to-calibrate",
    slidesEmbedUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vQWZdlG0I_pxmj6ZaZTayng4XsV11TQKprmOT11pZcA2o2aO44RNff7IxlOrBAephygfyp6tv61qAK2/embed?start=false&loop=false&delayms=3000",
    slidesUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vQWZdlG0I_pxmj6ZaZTayng4XsV11TQKprmOT11pZcA2o2aO44RNff7IxlOrBAephygfyp6tv61qAK2/pub?start=false&loop=false&delayms=3000",
  },
  {
    id: "connect-ai-tool-with-calibrate",
    recordingEmbedUrl: "https://www.youtube.com/embed/Vx3oxYKbLVw",
    recordingUrl: "https://youtu.be/Vx3oxYKbLVw",
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
  {
    id: "evaluating-gen-ai-social-sector",
    slidesEmbedUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vRWltXva8xMcfBDZ5TPrQH2hATDDaKdA-c0ZItHMRT_O1wWECKVdsvGbv7EIFf0qg/embed?start=false&loop=false&delayms=3000",
    slidesUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vRWltXva8xMcfBDZ5TPrQH2hATDDaKdA-c0ZItHMRT_O1wWECKVdsvGbv7EIFf0qg/pub?start=false&loop=false&delayms=3000",
  },
  {
    id: "ai-evaluation-guide",
    slidesEmbedUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vSaOgSBTLQurLiDp9jSfJtfMyJQYxwPhS5t6drMeZr6mcGSN8y53XNSk9CIPjzpOAoQdV6T-Yv8T-5W/embed?start=false&loop=false&delayms=3000",
    slidesUrl:
      "https://docs.google.com/presentation/d/e/2PACX-1vSaOgSBTLQurLiDp9jSfJtfMyJQYxwPhS5t6drMeZr6mcGSN8y53XNSk9CIPjzpOAoQdV6T-Yv8T-5W/pub?start=false&loop=false&delayms=3000",
  },
];

/** The block on the page for one entry, and the title it is showing. */
function sessionOnPage(id: string) {
  const block = document.getElementById(id);
  if (!block) throw new Error(`No entry on the page with the id "${id}"`);
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

  it("shows every entry, in the order we published them", () => {
    render(<LearnPage />);
    const onPage = screen
      .getAllByRole("region")
      .map((section) => section.getAttribute("id"));
    expect(onPage).toEqual(EXPECTED_TALKS.map((talk) => talk.id));
  });

  it("gives every entry a title and a line on what it covered", () => {
    render(<LearnPage />);
    EXPECTED_TALKS.forEach((talk) => {
      const { block, title } = sessionOnPage(talk.id);
      expect(title).not.toBe("");
      expect(
        within(block).getByRole("heading", { level: 2 }),
      ).toHaveTextContent(title);
      expect(block.querySelector("h2 + div")?.textContent?.trim()).toBeTruthy();
    });
  });

  it.each(EXPECTED_TALKS)(
    "plays what $id has on the page, and nothing it does not have",
    (talk: ExpectedTalk) => {
      render(<LearnPage />);
      const { block, title } = sessionOnPage(talk.id);

      const recording = within(block).queryByTitle(`Recording of ${title}`);
      if (talk.recordingEmbedUrl) {
        expect(recording).toHaveAttribute("src", talk.recordingEmbedUrl);
      } else {
        expect(recording).toBeNull();
      }

      const slides = within(block).queryByTitle(`Slides from ${title}`);
      if (talk.slidesEmbedUrl) {
        expect(slides).toHaveAttribute("src", talk.slidesEmbedUrl);
      } else {
        expect(slides).toBeNull();
      }
    },
  );

  it.each(EXPECTED_TALKS)(
    "opens what $id has in a new tab",
    (talk: ExpectedTalk) => {
      render(<LearnPage />);
      const { block, title } = sessionOnPage(talk.id);

      const recording = within(block).queryByRole("link", {
        name: `Open the recording of ${title} in a new tab`,
      });
      if (talk.recordingUrl) {
        expect(recording).toHaveAttribute("href", talk.recordingUrl);
        expect(recording).toHaveAttribute("target", "_blank");
        expect(recording).toHaveAttribute("rel", "noopener noreferrer");
      } else {
        expect(recording).toBeNull();
      }

      const slides = within(block).queryByRole("link", {
        name: `Open the slides from ${title} in a new tab`,
      });
      if (talk.slidesUrl) {
        expect(slides).toHaveAttribute("href", talk.slidesUrl);
        expect(slides).toHaveAttribute("target", "_blank");
        expect(slides).toHaveAttribute("rel", "noopener noreferrer");
      } else {
        expect(slides).toBeNull();
      }
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

  it("lists every entry down the left, each linking to its place on the page", () => {
    render(<LearnPage />);
    const onThisPage = within(
      screen.getByRole("navigation", { name: "On this page" }),
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
    // The list of entries down the left is a second set of navigation links,
    // so pick out the header by the one thing only it has.
    const header = screen
      .getAllByRole("navigation")
      .find((nav) => !nav.getAttribute("aria-label"))!;
    // Anchor on the logo image's alt text: the header also carries a
    // "Why Calibrate?" link, which a bare /Calibrate/ would match too.
    expect(
      within(header).getByRole("link", { name: /^Calibrate Logo/ }),
    ).toHaveAttribute("href", "/");
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Learn" })).toHaveAttribute(
      "href",
      "/learn",
    );
  });
});
