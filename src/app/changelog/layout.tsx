import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  path: "/changelog",
  title: "Changelog | Calibrate",
  description: "Everything we have changed in Calibrate, newest first.",
  image: "/share/changelog.png",
});

export default function ChangelogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
