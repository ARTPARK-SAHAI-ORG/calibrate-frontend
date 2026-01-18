import { Metadata } from "next";

export const metadata: Metadata = {
  title: "New TTS Evaluation | Pense",
};

export default function NewTTSLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
