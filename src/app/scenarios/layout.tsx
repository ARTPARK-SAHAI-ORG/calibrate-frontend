import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Scenarios | Pense",
};

export default function ScenariosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
