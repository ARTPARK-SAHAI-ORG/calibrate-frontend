import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, DM_Sans } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "@/lib/site";
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
  // Names the site once, so every page below can write a canonical link or a
  // preview image as a short path and still emit a full address. Without it
  // Next guesses, and on Vercel it guesses the throwaway deployment address.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Calibrate",
    template: "%s",
  },
  description: "Open-source AI agent evaluation for non-profits",
  // The landing page cannot set this itself: it is a client component, and
  // those cannot export metadata. Pages behind sign-in inherit it and so claim
  // to be the home page, which never reaches a crawler because it is sent to
  // the login page first.
  alternates: { canonical: "/" },
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
