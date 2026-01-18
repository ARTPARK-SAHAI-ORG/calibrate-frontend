import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Simulation | Pense",
};

export default function SimulationDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
