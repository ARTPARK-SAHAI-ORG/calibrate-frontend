import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login | Pense",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
