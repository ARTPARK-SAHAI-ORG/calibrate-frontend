import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LandingHeader } from "@/components/LandingHeader";
import { LandingFooter } from "@/components/LandingFooter";
import {
  POSTS,
  PostByline,
  articleJsonLd,
  findPost,
  tabTitle,
} from "@/lib/blogPosts";
import { SHARE_IMAGE } from "@/lib/site";

type PostPageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return POSTS.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PostPageProps): Promise<Metadata> {
  const post = findPost((await params).slug);
  if (!post) return { title: "Blog | Calibrate" };
  return {
    title: tabTitle(post),
    description: post.summary,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      siteName: "Calibrate",
      title: post.title,
      description: post.summary,
      url: `/blog/${post.slug}`,
      publishedTime: post.date,
      authors: [post.author],
      images: [post.image ?? SHARE_IMAGE],
    },
  };
}

export default async function BlogPostPage({ params }: PostPageProps) {
  const post = findPost((await params).slug);
  if (!post) return notFound();

  return (
    <div className="min-h-screen bg-white landing-page">
      <LandingHeader showLogoLink talkToUsHref="/#join-community" />
      <main className="bg-white py-16 md:py-24 px-4 md:px-8 lg:px-12">
        <article className="max-w-3xl mx-auto">
          {/* Escaping "<" keeps a stray angle bracket in a post from closing
              this tag early and spilling the rest onto the page. */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(articleJsonLd(post)).replace(
                /</g,
                "\\u003c",
              ),
            }}
          />
          <Link
            href="/blog"
            className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            ← All posts
          </Link>
          <h1 className="mt-6 text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 leading-[1.1] tracking-[-0.02em] text-balance">
            {post.title}
          </h1>
          <PostByline post={post} className="mt-4" />
          {/* The post is written as paragraphs, so they are spaced here rather
              than one class at a time inside every post. */}
          <div className="mt-10 md:mt-12 space-y-6 text-base md:text-lg text-gray-700 leading-relaxed text-pretty">
            {post.body}
          </div>
        </article>
      </main>
      <LandingFooter />
    </div>
  );
}
