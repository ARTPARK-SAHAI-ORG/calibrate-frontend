import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Evaluators | Calibrate",
};

export default function MetricsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
