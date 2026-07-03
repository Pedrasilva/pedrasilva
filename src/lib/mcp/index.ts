import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listProjectsTool from "./tools/list-projects";
import listCompaniesTool from "./tools/list-companies";

// The OAuth issuer MUST be the direct Supabase host — the `.lovable.cloud`
// proxy fails RFC 8414 issuer validation. Read the project ref via
// import.meta.env so Vite inlines it at build time.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "psa-hub-mcp",
  title: "PSA Hub",
  version: "0.1.0",
  instructions:
    "Tools for PSA Hub — a project, CRM, HR, and finance workspace for Pedra Silva Architects. " +
    "Use `whoami` to check identity, `list_projects` for project data, and `list_companies` for CRM companies. " +
    "All tools run as the signed-in user and respect row-level security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listProjectsTool, listCompaniesTool],
});
