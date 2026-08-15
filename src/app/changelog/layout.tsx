import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Changelog | Calibrate",
  description: "Everything we have changed in Calibrate, newest first.",
};

export default function ChangelogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
