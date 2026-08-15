/**
 * The Learn page. Every session must show up with its recording and its slides
 * playing on the page, pointing at the exact addresses we published, because a
 * wrong or missing address here is a dead end for the reader.
 */
import { render, screen, within } from "@/test-utils";
import LearnPage from "../learn/page";
import { WEBINARS_URL } from "@/constants/links";

type ExpectedTalk = {
  title: string;
  recordingEmbedUrl: string;
  recordingUrl: string;
  slidesEmbedUrl: string;
  slidesUrl: string;
};

const EXPECTED_TALKS: ExpectedTalk[] = [
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

describe("LearnPage", () => {
  const originalDocsUrl = process.env.NEXT_PUBLIC_DOCS_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_DOCS_URL = "https://docs.example.com";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_DOCS_URL = originalDocsUrl;
  });

  it("lists every session in the order we published them", () => {
    render(<LearnPage />);
    const titles = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);
    expect(titles).toEqual(EXPECTED_TALKS.map((talk) => talk.title));
  });

  it.each(EXPECTED_TALKS)(
    "plays the recording and the slides for $title",
    (talk: ExpectedTalk) => {
      render(<LearnPage />);
      const section = screen.getByRole("region", { name: talk.title });

      expect(
        within(section).getByTitle(`Recording of ${talk.title}`),
      ).toHaveAttribute("src", talk.recordingEmbedUrl);

      expect(
        within(section).getByTitle(`Slides from ${talk.title}`),
      ).toHaveAttribute("src", talk.slidesEmbedUrl);
    },
  );

  it.each(EXPECTED_TALKS)(
    "opens the recording and the slides for $title in a new tab",
    (talk: ExpectedTalk) => {
      render(<LearnPage />);
      const recording = screen.getByRole("link", {
        name: `Open the recording of ${talk.title} in a new tab`,
      });
      expect(recording).toHaveAttribute("href", talk.recordingUrl);
      expect(recording).toHaveAttribute("target", "_blank");
      expect(recording).toHaveAttribute("rel", "noopener noreferrer");

      const slides = screen.getByRole("link", {
        name: `Open the slides from ${talk.title} in a new tab`,
      });
      expect(slides).toHaveAttribute("href", talk.slidesUrl);
      expect(slides).toHaveAttribute("target", "_blank");
      expect(slides).toHaveAttribute("rel", "noopener noreferrer");
    },
  );

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

  it("keeps the header and the footer, with the header logo linking home", () => {
    render(<LearnPage />);
    const header = screen.getByRole("navigation");
    expect(
      within(header).getByRole("link", { name: /Calibrate/ }),
    ).toHaveAttribute("href", "/");
    const footer = screen.getByRole("contentinfo");
    expect(
      within(footer).getByRole("link", { name: "Learn" }),
    ).toHaveAttribute("href", "/learn");
  });
});
