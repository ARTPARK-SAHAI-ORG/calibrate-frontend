import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Annotate | Calibrate",
};

export default function AnnotateJobLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
