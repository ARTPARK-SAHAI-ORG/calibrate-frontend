"use client";

import { Link } from "@/lib/nav";
import { WEBINARS_URL, WHATSAPP_INVITE_URL } from "@/constants/links";

export function LandingFooter() {
  return (
    // The header's Resources link scrolls here. scroll-mt keeps the heading
    // clear of the header, which stays pinned to the top of the screen.
    <footer
      id="resources"
      className="bg-gray-50 text-gray-500 py-10 md:py-16 px-4 md:px-8 lg:px-12 border-t border-gray-200 scroll-mt-20"
    >
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
          {/* Resources Column */}
          <div className="border-l border-gray-300 pl-6 md:pl-8">
            <h3 className="text-gray-400 text-sm tracking-[0.2em] uppercase mb-6">
              Resources
            </h3>
            <ul className="space-y-4">
              <li>
                <a
                  href={process.env.NEXT_PUBLIC_DOCS_URL}
                  className="hover:text-gray-900 transition-colors"
                >
                  Documentation
                </a>
              </li>
              <li>
                <Link href="/changelog" className="hover:text-gray-900 transition-colors">
                  Changelog
                </Link>
              </li>
              <li>
                <a
                  href="https://docs.google.com/document/d/e/2PACX-1vScdz5QUGyo_q4fBSAymagmoi55K8Ss77t2AcnsDYriYXp0LyM8GQ1Pnj3EDjrCUg/pub"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gray-900 transition-colors"
                >
                  Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href="https://docs.google.com/document/d/e/2PACX-1vR6h4w6CrrucGhf1LKrQZGQx6IzmoOTYgAlOvqFuaObeDtStMy5UC0kNT8z2efNEQ/pub"
                  target="_blank"
                  className="hover:text-gray-900 transition-colors"
                >
                  Terms of Service
                </a>
              </li>
            </ul>
          </div>

          {/* Community Column */}
          <div className="border-l border-gray-300 pl-6 md:pl-8">
            <h3 className="text-gray-400 text-sm tracking-[0.2em] uppercase mb-6">
              Community
            </h3>
            <ul className="space-y-4">
              <li>
                <a
                  href={WHATSAPP_INVITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gray-900 transition-colors"
                >
                  WhatsApp
                </a>
              </li>
              <li>
                <a
                  href={WEBINARS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gray-900 transition-colors"
                >
                  Webinars on AI evaluation
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-10 md:mt-16 text-right text-gray-400 text-sm">
          © {new Date().getFullYear()}
        </div>
      </div>
    </footer>
  );
}
