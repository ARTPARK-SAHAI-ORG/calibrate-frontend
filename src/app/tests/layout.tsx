import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tests | Pense",
};

export default function TestsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
