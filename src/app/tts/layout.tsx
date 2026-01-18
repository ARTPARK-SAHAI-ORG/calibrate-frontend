import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Text to Speech | Pense",
};

export default function TTSLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
