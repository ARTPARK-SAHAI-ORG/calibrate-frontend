import { Metadata } from "next";

export const metadata: Metadata = {
  title: "STT Evaluation | Pense",
};

export default function STTDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
