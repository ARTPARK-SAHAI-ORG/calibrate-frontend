import Link from "next/link";
import { LandingHeader } from "@/components/LandingHeader";
import { LandingFooter } from "@/components/LandingFooter";
import { POSTS, formatPostDate } from "@/lib/blogPosts";

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-white landing-page">
      <LandingHeader showLogoLink talkToUsHref="/#join-community" />
      <main className="bg-white py-16 md:py-24 px-4 md:px-8 lg:px-12">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 mb-10 md:mb-16 leading-[1.1] tracking-[-0.02em]">
            Blog
          </h1>

          <ul className="space-y-10 md:space-y-14">
            {POSTS.map((post) => (
              <li key={post.slug}>
                <p className="text-sm text-gray-400">
                  <time dateTime={post.date}>{formatPostDate(post.date)}</time>
                  <span className="mx-2">·</span>
                  {post.author}
                </p>
                <h2 className="mt-2 text-xl sm:text-2xl lg:text-3xl font-semibold text-gray-900 leading-[1.12] tracking-[-0.03em] text-balance">
                  <Link
                    href={`/blog/${post.slug}`}
                    className="hover:text-gray-600 transition-colors"
                  >
                    {post.title}
                  </Link>
                </h2>
                <p className="mt-3 text-base md:text-lg font-light text-gray-500 leading-relaxed text-pretty">
                  {post.summary}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
