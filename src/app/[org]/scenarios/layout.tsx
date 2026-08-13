import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Scenarios | Calibrate",
};

export default function ScenariosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
