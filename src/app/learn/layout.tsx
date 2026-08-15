import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Learn | Calibrate",
  description:
    "Recordings and slides from the sessions we run on evaluating AI.",
};

export default function LearnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
