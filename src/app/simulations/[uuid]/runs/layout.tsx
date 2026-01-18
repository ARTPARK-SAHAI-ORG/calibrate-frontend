import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Simulation Run | Pense",
};

export default function SimulationRunLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
