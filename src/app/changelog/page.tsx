import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LandingHeader } from "@/components/LandingHeader";
import { LandingFooter } from "@/components/LandingFooter";
import { ChangelogList } from "@/components/ChangelogList";
import { parseChangelog } from "@/lib/changelog";

/**
 * CHANGELOG.MD is read once, when the site is built, so the page is plain HTML
 * with no request to make. A merge into prod rebuilds the site, which is what
 * puts the newest lines on the page.
 */
export default function ChangelogPage() {
  const months = parseChangelog(
    readFileSync(join(process.cwd(), "CHANGELOG.MD"), "utf8"),
  );

  return (
    <div className="min-h-screen bg-white landing-page">
      <LandingHeader showLogoLink talkToUsHref="/#join-community" />
      <main className="bg-white py-16 md:py-24 px-4 md:px-8 lg:px-12">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 mb-10 md:mb-16 leading-[1.1] tracking-[-0.02em]">
            Changelog
          </h1>
          <ChangelogList months={months} />
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
