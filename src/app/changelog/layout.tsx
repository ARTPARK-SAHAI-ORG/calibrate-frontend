import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  path: "/changelog",
  title: "Changelog | Calibrate",
  description: "New releases and bug fixes",
  image: "/share/changelog.png",
});

export default function ChangelogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
