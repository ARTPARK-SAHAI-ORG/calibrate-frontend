import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tools | Calibrate",
};

export default function ToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
