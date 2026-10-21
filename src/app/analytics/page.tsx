"use client";

import { useEffect } from "react";
import { useRouter } from "@/lib/nav";
import { useAccessToken } from "@/hooks";
import { AppLayout } from "@/components/AppLayout";
import { AnalyticsView } from "@/components/analytics/AnalyticsView";
import { useSidebarState } from "@/lib/sidebar";

export default function AnalyticsPage() {
  const router = useRouter();
  const accessToken = useAccessToken();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();

  useEffect(() => {
    document.title = "Analytics | Calibrate";
  }, []);

  return (
    <AppLayout
      activeItem="analytics"
      onItemChange={(id) => router.push(`/${id}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
    >
      <div className="space-y-4 md:space-y-6 py-4 md:py-6">
        <AnalyticsView accessToken={accessToken} />
      </div>
    </AppLayout>
  );
}
