import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Personas | Calibrate",
};

export default function PersonasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
