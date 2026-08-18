import { pageMetadata } from "@/lib/site";

export const metadata = pageMetadata({
  path: "/learn",
  title: "Learn | Calibrate",
  description: "Learning resources on Calibrate and AI evals",
});

export default function LearnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
