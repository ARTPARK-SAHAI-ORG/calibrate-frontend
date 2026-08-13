import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Workspace settings | Calibrate",
};

export default function WorkspaceSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
