import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agent | Calibrate",
};

export default function AgentDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
