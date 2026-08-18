import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  path: "/blog",
  title: "Blog | Calibrate",
  description:
    "Learnings and challenges from real-world AI deployments and how we are solving them.",
});

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
