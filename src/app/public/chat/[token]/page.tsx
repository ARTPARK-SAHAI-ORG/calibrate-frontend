"use client";

import { useParams } from "next/navigation";
import { PublicChatView } from "@/components/chat/PublicChatView";

export default function PublicChatPage() {
  const { token } = useParams<{ token: string }>();
  return <PublicChatView token={token} />;
}
