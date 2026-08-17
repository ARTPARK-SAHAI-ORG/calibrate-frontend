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
    expect(screen.getByText(post.author)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← All posts" })).toHaveAttribute(
      "href",
      "/blog",
    );
  });

  it("shows the first post in full", async () => {
    render(
      await BlogPostPage({
        params: Promise.resolve({
          slug: "the-model-is-no-longer-the-problem",
        }),
      }),
    );

    expect(screen.getByText("17 August 2026")).toBeInTheDocument();
    expect(screen.getByText("So, where are we lacking?")).toBeInTheDocument();
    expect(
      screen.getByText("Open-source. Free. Self-hostable."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Calibrate" })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("shows the not-found page for an address nobody wrote", async () => {
    await BlogPostPage({ params: Promise.resolve({ slug: "no-such-post" }) });
    expect(notFound).toHaveBeenCalled();
  });
});
