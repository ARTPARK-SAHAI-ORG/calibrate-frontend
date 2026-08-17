import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog | Calibrate",
  description: "What we are learning about evaluating AI, newest first.",
};

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
