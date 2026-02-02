"use client";

const WHATSAPP_INVITE_URL =
  "https://chat.whatsapp.com/JygDNcZ943a3VmZDXYMg5Z?mode=gi_t";

export function LandingFooter() {
  return (
    <footer className="bg-gray-50 text-gray-500 py-16 px-12 border-t border-gray-200">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {/* Company Column */}
          <div className="border-l border-gray-300 pl-8 flex flex-col">
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
                  href="https://docs.google.com/document/d/e/2PACX-1vRk2LZDD3ZtMHBocQVl5Qh14PtThP2nB1DFUsC0_9w028yx6LrDKHE77IgOxY-PojVgtyGp-hClts8l/pub"
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
            </p>
          </div>

          {/* Resources Column */}
          <div className="border-l border-gray-300 pl-8">
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
                  href={`${process.env.NEXT_PUBLIC_DOCS_URL}/python-sdk/overview`}
                  className="hover:text-gray-900 transition-colors"
                >
                  Python SDK
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
                  href="https://docs.google.com/document/d/e/2PACX-1vTRkPJ3-aoibS0ySGfN62w-ytqZrsQ4EogQNTO01Ts4epzT8KJTXpbgSFV1Nb2xihnVpxniC11se5Cx/pub"
                  target="_blank"
                  className="hover:text-gray-900 transition-colors"
                >
                  Terms of Service
                </a>
              </li>
            </ul>
          </div>

          {/* Community Column */}
          <div className="border-l border-gray-300 pl-8">
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
                  href="https://discord.gg/xCJ55Ban"
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
        <div className="mt-16 text-right text-gray-400 text-sm">
          © {new Date().getFullYear()}
        </div>
      </div>
    </footer>
  );
}
