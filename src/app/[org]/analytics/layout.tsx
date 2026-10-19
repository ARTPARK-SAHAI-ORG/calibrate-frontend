import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analytics | Calibrate",
};

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
