import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Item | Calibrate",
};

export default function LabellingItemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
