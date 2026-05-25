import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FinanceSidebar } from "@/components/finance/finance-sidebar";
import {
  FinanceShellProvider,
  useFinanceShell,
} from "@/components/finance/finance-shell-context";
import { checkFinanceAccess } from "@/lib/finance/access";

export const Route = createFileRoute("/_app/finance")({
  beforeLoad: async () => {
    const allowed = await checkFinanceAccess();
    if (!allowed) {
      throw redirect({ to: "/" });
    }
  },
  component: FinanceLayout,
});

function FinanceLayout() {
  return (
    <FinanceShellProvider>
      <SidebarProvider>
        <div className="finance-shell flex min-h-[calc(100vh-3.5rem)] w-full">
          <FinanceSidebar />
          <SidebarInset className="flex-1">
            <FinanceHeader />
            <main className="flex-1 px-4 sm:px-6 py-6 lg:py-8">
              <Outlet />
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </FinanceShellProvider>
  );
}

function FinanceHeader() {
  const { t } = useTranslation(["finance"]);
  const { vatMode, setVatMode } = useFinanceShell();
  return (
    <header className="sticky top-14 z-30 flex h-12 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <SidebarTrigger />
      <div className="text-sm font-semibold tracking-tight">
        {t("finance:page.title")}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Label className="hidden text-xs text-muted-foreground sm:inline">
          {t("finance:page.vatToggle")}
        </Label>
        <Select value={vatMode} onValueChange={(v) => setVatMode(v as "inc" | "ex")}>
          <SelectTrigger className="h-8 w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inc">{t("finance:page.vatInc")}</SelectItem>
            <SelectItem value="ex">{t("finance:page.vatEx")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </header>
  );
}
