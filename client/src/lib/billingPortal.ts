import { apiRequest } from "@/lib/queryClient";

export const billingPortalUnavailableMessage = {
  title: "Billing portal unavailable",
  description: "Verify your Pro access or try again after checkout completes.",
};

export async function openBillingPortal(accountEmail: string) {
  let res: Response;
  try {
    res = await apiRequest("POST", "/api/billing/portal", { email: accountEmail });
  } catch {
    const refresh = await apiRequest("POST", "/api/billing/session", { email: accountEmail });
    const refreshData = await refresh.json();
    if (!refreshData.success) throw new Error("Billing session refresh failed");
    res = await apiRequest("POST", "/api/billing/portal", { email: accountEmail });
  }

  const data = await res.json();
  if (data.url) window.location.href = data.url;
}
