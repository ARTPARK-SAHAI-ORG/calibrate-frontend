import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  path: "/blog",
  title: "Blog | Calibrate",
  description: "What we are learning about evaluating AI, newest first.",
});

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
