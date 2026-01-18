import { Metadata } from "next";

export const metadata: Metadata = {
  title: "TTS Evaluation | Pense",
};

export default function TTSDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
