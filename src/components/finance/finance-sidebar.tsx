import { Link, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Receipt,
  CreditCard,
  Building2,
  Wallet,
  FileText,
  Send,
  Inbox,
  ArrowDownToLine,
  Banknote,
  RefreshCw,
  ListChecks,
  BarChart3,
  CalendarClock,
  TrendingUp,
  FolderKanban,
  Tags,
  Percent,
  Cog,
  Shield,
  Upload,
  AlertTriangle,
  ScrollText,
  Beaker,
  Users,
  Truck,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

type Item = {
  to: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
};

type Group = {
  labelKey: string;
  items: Item[];
  adminOnly?: boolean;
};

const GROUPS: Group[] = [
  {
    labelKey: "finance:sidebar.groups.overview",
    items: [
      { to: "/finance", labelKey: "finance:sidebar.items.overview", icon: LayoutDashboard, end: true },
    ],
  },
  {
    labelKey: "finance:sidebar.groups.payments",
    items: [
      { to: "/finance/payments/suppliers", labelKey: "finance:sidebar.items.suppliers", icon: Truck },
      { to: "/finance/payments/purchases", labelKey: "finance:sidebar.items.purchases", icon: Receipt },
      { to: "/finance/payments/expenses", labelKey: "finance:sidebar.items.expenses", icon: Wallet },
      { to: "/finance/payments/outflows", labelKey: "finance:sidebar.items.outflows", icon: ArrowDownToLine },
      { to: "/finance/payments/cards", labelKey: "finance:sidebar.items.cards", icon: CreditCard },
    ],
  },
  {
    labelKey: "finance:sidebar.groups.invoicing",
    items: [
      { to: "/finance/invoicing/clients", labelKey: "finance:sidebar.items.clients", icon: Users },
      { to: "/finance/invoicing/invoices", labelKey: "finance:sidebar.items.invoices", icon: FileText },
      { to: "/finance/invoicing/receipts", labelKey: "finance:sidebar.items.receipts", icon: Send },
      { to: "/finance/invoicing/inflows", labelKey: "finance:sidebar.items.inflows", icon: Inbox },
    ],
  },
  {
    labelKey: "finance:sidebar.groups.banking",
    items: [
      { to: "/finance/banking/balances", labelKey: "finance:sidebar.items.balances", icon: Banknote },
      { to: "/finance/banking/reconciliation", labelKey: "finance:sidebar.items.reconciliation", icon: RefreshCw },
      { to: "/finance/banking/transactions", labelKey: "finance:sidebar.items.transactions", icon: ListChecks },
    ],
  },
  {
    labelKey: "finance:sidebar.groups.reports",
    items: [
      { to: "/finance/reports/cashflow", labelKey: "finance:sidebar.items.cashflow", icon: BarChart3 },
      { to: "/finance/reports/vat", labelKey: "finance:sidebar.items.vat", icon: Percent },
      { to: "/finance/reports/forecast", labelKey: "finance:sidebar.items.forecast", icon: TrendingUp },
      { to: "/finance/reports/projects", labelKey: "finance:sidebar.items.projectFinancials", icon: FolderKanban },
    ],
  },
  {
    labelKey: "finance:sidebar.groups.data",
    items: [
      { to: "/finance/data/classifications", labelKey: "finance:sidebar.items.classifications", icon: Tags },
      { to: "/finance/data/vat-rates", labelKey: "finance:sidebar.items.vatRates", icon: Percent },
      { to: "/finance/data/bank-accounts", labelKey: "finance:sidebar.items.bankAccounts", icon: Building2 },
      { to: "/finance/data/cards", labelKey: "finance:sidebar.items.cards", icon: CreditCard },
      { to: "/finance/data/rules", labelKey: "finance:sidebar.items.rules", icon: Cog },
    ],
  },
  {
    labelKey: "finance:sidebar.groups.admin",
    adminOnly: true,
    items: [
      { to: "/finance/admin/imports", labelKey: "finance:sidebar.items.importLogs", icon: Upload },
      { to: "/finance/admin/inconsistencies", labelKey: "finance:sidebar.items.inconsistencies", icon: AlertTriangle },
      { to: "/finance/admin/audit", labelKey: "finance:sidebar.items.audit", icon: ScrollText },
      { to: "/finance/admin/qa", labelKey: "finance:sidebar.items.qa", icon: Beaker },
    ],
  },
];

export function FinanceSidebar() {
  const { t } = useTranslation(["finance"]);
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { isRealAdmin } = useAuth();

  const isActive = (to: string, end?: boolean) =>
    end ? path === to : path === to || path.startsWith(to + "/");

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Wallet className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-sm font-semibold">{t("finance:sidebar.brand")}</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {t("finance:sidebar.brandSub")}
              </div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {GROUPS.map((group) => {
          if (group.adminOnly && !isRealAdmin) return null;
          const anyActive = group.items.some((it) => isActive(it.to, it.end));
          return (
            <SidebarGroup key={group.labelKey} defaultOpen={anyActive || !collapsed}>
              <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((it) => {
                    const Icon = it.icon;
                    const active = isActive(it.to, it.end);
                    return (
                      <SidebarMenuItem key={it.to}>
                        <SidebarMenuButton asChild isActive={active} tooltip={t(it.labelKey)}>
                          <Link to={it.to as never} className="flex items-center gap-2">
                            <Icon className="h-4 w-4 shrink-0" />
                            {!collapsed && <span className="truncate">{t(it.labelKey)}</span>}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
