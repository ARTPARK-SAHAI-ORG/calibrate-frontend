import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tools | Pense",
};

export default function ToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
