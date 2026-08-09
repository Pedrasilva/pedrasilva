import { useLocation } from "@tanstack/react-router";
import { GlobalTopNav } from "@/components/GlobalTopNav";

/**
 * Route-aware top-right slot. The Time / Tasks / Schedule hubs (and the quick
 * create menu) belong to the projects workflow, so they only appear on Home
 * and Projects. CRM, Finance, HR and Admin keep the header clean — their own
 * module navigation lives in the page shell.
 */
export function ModuleTopNav() {
  const loc = useLocation();
  const segment = loc.pathname.split("/")[1] ?? "";

  switch (segment) {
    case "":
    case "projects":
      return <GlobalTopNav />;
    default:
      return null;
  }
}
