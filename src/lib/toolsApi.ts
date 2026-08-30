import { getBackendUrl, getDefaultHeaders } from "@/lib/api";
import { signOut } from "next-auth/react";

/** Permanently delete a tool from the workspace. */
export async function deleteTool(
  uuid: string,
  accessToken: string,
): Promise<void> {
  const response = await fetch(`${getBackendUrl()}/tools/${uuid}`, {
    method: "DELETE",
    headers: getDefaultHeaders(accessToken),
  });
  if (response.status === 401) {
    await signOut({ callbackUrl: "/login" });
    return;
  }
  if (!response.ok) {
    throw new Error("Failed to delete tool");
  }
}
