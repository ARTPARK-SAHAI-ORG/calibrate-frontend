import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Simulations | Calibrate",
};

export default function SimulationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
