import type { Metadata } from "next";
import { SHARE_IMAGE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Blog | Calibrate",
  description: "What we are learning about evaluating AI, newest first.",
  alternates: { canonical: "/blog" },
  openGraph: {
    type: "website",
    siteName: "Calibrate",
    title: "Blog | Calibrate",
    description: "What we are learning about evaluating AI, newest first.",
    url: "/blog",
    images: [SHARE_IMAGE],
  },
};

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
