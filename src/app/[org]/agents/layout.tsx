import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agents | Calibrate",
};

export default function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
