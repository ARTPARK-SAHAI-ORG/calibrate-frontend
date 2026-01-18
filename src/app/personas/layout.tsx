import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Personas | Pense",
};

export default function PersonasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
