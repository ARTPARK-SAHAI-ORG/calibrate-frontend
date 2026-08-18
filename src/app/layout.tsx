import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, DM_Sans } from "next/font/google";
import "./globals.css";
import { IS_CANONICAL_SITE, pageMetadata, SITE_URL } from "@/lib/site";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { FloatingButtonProvider } from "@/components/providers/FloatingButtonProvider";
import { OrganizationBootstrapper } from "@/components/OrganizationBootstrapper";
import { OnboardingTour } from "@/components/OnboardingTour";
import { Analytics } from "@vercel/analytics/next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
  // A copy of this app on someone else's domain, and our own preview builds,
  // ask to be left out of search entirely. robots.txt blocks crawlers there
  // too, but that is a request a crawler may ignore; this is the line that
  // takes a page back out once it has been read.
  ...(IS_CANONICAL_SITE ? {} : { robots: { index: false, follow: false } }),
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
