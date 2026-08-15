import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Learn | Calibrate",
  description: "Learning resources on Calibrate and AI evals",
};

export default function LearnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
