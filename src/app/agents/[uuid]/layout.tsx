import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agent | Pense",
};

export default function AgentDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
