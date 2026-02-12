"use client";

import { WHATSAPP_INVITE_URL, DISCORD_INVITE_URL } from "@/constants/links";

export function LandingFooter() {
  return (
    <footer className="bg-gray-50 text-gray-500 py-10 md:py-16 px-4 md:px-8 lg:px-12 border-t border-gray-200">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          {/* Company Column */}
          <div className="border-l border-gray-300 pl-6 md:pl-8 flex flex-col">
            <h3 className="text-gray-400 text-sm tracking-[0.2em] uppercase mb-6">
              Company
            </h3>
            <ul className="space-y-4">
              <li>
                <a
                  href="/about"
                  className="hover:text-gray-900 transition-colors"
                >
                  About Us
                </a>
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
            </ul>
            <p className="mt-auto pt-8 text-xs text-gray-400">
              Supported by{" "}
              <a
                href="https://artpark.in"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-600 transition-colors"
              >
                ARTPARK
              </a>{" "}
              @IISc
              <br />
              Funded by Government of Karnataka (GoK)
            </p>
          </div>

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
                <a
                  href={`${process.env.NEXT_PUBLIC_DOCS_URL}/cli/overview`}
                  className="hover:text-gray-900 transition-colors"
                >
                  CLI
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
                  href={DISCORD_INVITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gray-900 transition-colors"
                >
                  Discord
                </a>
              </li>
              <li>
                <a
                  href="https://linkedin.com/company/artpark"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gray-900 transition-colors"
                >
                  LinkedIn
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
