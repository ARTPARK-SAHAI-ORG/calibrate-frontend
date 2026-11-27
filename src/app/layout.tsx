import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { pageMetadata, SITE_URL } from "@/lib/site";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { FloatingButtonProvider } from "@/components/providers/FloatingButtonProvider";
import { OrganizationBootstrapper } from "@/components/OrganizationBootstrapper";
import { OnboardingTour } from "@/components/OnboardingTour";
import { Analytics } from "@vercel/analytics/next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Toaster } from "sonner";

// Kept in the repo rather than fetched with next/font/google: Google sometimes
// answers with an address the build cannot read, and the deployment then fails.
const geistSans = localFont({
  src: "./fonts/geist.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/geist-mono.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  fallback: ["ui-monospace", "monospace"],
  adjustFontFallback: false,
});

const inter = localFont({
  src: "./fonts/inter.woff2",
  variable: "--font-inter",
  weight: "100 900",
});

const dmSans = localFont({
  src: "./fonts/dm-sans.woff2",
  variable: "--font-dm-sans",
  weight: "100 1000",
});

export const metadata: Metadata = {
  // The landing page cannot set any of this itself: it is a client component,
  // and those cannot export metadata. The canonical link and the preview box
  // come from here for that reason.
  //
  // Pages behind sign-in inherit the lot and so claim to be the home page,
  // which never reaches a crawler because it is sent to the login page first.
  // Every page open to everyone writes its own through the same helper.
  ...pageMetadata({
    path: "/",
    title: "Calibrate",
    description: "Open-source AI agent evaluation for non-profits",
  }),
  // Names the site once, so every page below can write a canonical link or a
  // preview image as a short path and still emit a full address. Without it
  // Next guesses, and on Vercel it guesses the throwaway deployment address.
  metadataBase: new URL(SITE_URL),
  // Only the root carries this. A page passes the whole tab title it wants, so
  // the template leaves it alone.
  title: {
    default: "Calibrate",
    template: "%s",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${dmSans.variable} antialiased`}
      >
        <SessionProvider>
          <OrganizationBootstrapper />
          <OnboardingTour />
          <FloatingButtonProvider>{children}</FloatingButtonProvider>
        </SessionProvider>
        <Toaster richColors position="top-right" closeButton />
        <Analytics />
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
        )}
      </body>
    </html>
  );
}
