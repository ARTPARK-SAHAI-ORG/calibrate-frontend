import { redirect } from "next/navigation";

const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === "true";

export default function Home() {
  if (MAINTENANCE_MODE) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-6">🔧</div>

          <h1 className="text-3xl font-semibold text-white mb-3">
            Under Maintenance
          </h1>

          <p className="text-gray-400">
            We&apos;re making some improvements. Back shortly.
          </p>
        </div>
      </div>
    );
  }

  redirect("/agents");
}
