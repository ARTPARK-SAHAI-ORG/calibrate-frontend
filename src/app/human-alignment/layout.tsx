import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Human alignment | Calibrate",
};

export default function HumanLabellingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
