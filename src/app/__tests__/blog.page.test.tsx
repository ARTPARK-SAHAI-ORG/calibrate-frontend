/**
 * The blog. Two things must hold: every post on the list opens at its own
 * address, and an address nobody wrote shows the not-found page instead of an
 * empty one.
 */
import { render, screen, within } from "@/test-utils";
import { notFound } from "next/navigation";
import BlogPage from "../blog/page";
import BlogPostPage from "../blog/[slug]/page";
import { POSTS } from "@/lib/blogPosts";

describe("Blog", () => {
  it("lists every post, each linking to its own address", () => {
    render(<BlogPage />);
    const main = within(screen.getByRole("main"));

    for (const post of POSTS) {
      expect(main.getByRole("link", { name: post.title })).toHaveAttribute(
        "href",
        `/blog/${post.slug}`,
      );
      expect(main.getByText(post.summary)).toBeInTheDocument();
    }
  });

  it("opens a post at its own address", async () => {
    const post = POSTS[0];
    render(
      await BlogPostPage({ params: Promise.resolve({ slug: post.slug }) }),
    );

    expect(
      screen.getByRole("heading", { level: 1, name: post.title }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: post.author })).toHaveAttribute(
      "href",
      post.authorUrl,
    );
    expect(screen.getByRole("link", { name: "← All posts" })).toHaveAttribute(
      "href",
      "/blog",
    );
  });

  it("shows a post in full, picture and all", async () => {
    render(
      await BlogPostPage({
        params: Promise.resolve({
          slug: "evaluation-is-all-you-need",
        }),
      }),
    );

    expect(screen.getByText("17 August 2026")).toBeInTheDocument();
    const picture = document.querySelector(
      'img[src="/blog/evaluation-is-all-you-need.png"]',
    );
    expect(picture).toBeInTheDocument();
    // Empty alt text: the picture repeats the headline right above it, so a
    // screen reader should skip it rather than read the title twice.
    expect(picture).toHaveAttribute("alt", "");
    expect(screen.getByText("So, where are we lacking?")).toBeInTheDocument();
    expect(
      screen.getByText("Open-source. Free. Self-hostable."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Calibrate" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("shows the case study with its pictures and its recording", async () => {
    render(
      await BlogPostPage({
        params: Promise.resolve({
          slug: "evaluating-a-form-filling-voice-agent",
        }),
      }),
    );

    expect(screen.getByText("2 September 2026")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Findings" }),
    ).toBeInTheDocument();

    // A picture carries no words of its own: the line under it says what it
    // shows, so a screen reader reads that instead of reading it twice.
    const picture = document.querySelector(
      'img[src="/blog/evaluating-a-form-filling-voice-agent/figure-9.png"]',
    );
    expect(picture).toHaveAttribute("alt", "");
    expect(
      screen.getByText(
        /Figure 9: An overview of how the turn-level unit tests/,
      ),
    ).toBeInTheDocument();

    // The demo call plays in the post. The two screen recordings have no
    // address yet, so they leave no empty box behind.
    const videos = document.querySelectorAll("iframe");
    expect(videos).toHaveLength(1);
    expect(videos[0]).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/60cSy_doksc",
    );
  });

  it("shows the not-found page for an address nobody wrote", async () => {
    await BlogPostPage({ params: Promise.resolve({ slug: "no-such-post" }) });
    expect(notFound).toHaveBeenCalled();
  });
});
