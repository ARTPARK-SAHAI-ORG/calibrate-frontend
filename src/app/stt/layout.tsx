import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Speech to Text | Pense",
};

export default function STTLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
