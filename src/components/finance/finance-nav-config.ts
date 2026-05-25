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
  Percent,
  TrendingUp,
  FolderKanban,
  Tags,
  Cog,
  Upload,
  AlertTriangle,
  ScrollText,
  Beaker,
  Users,
  Truck,
} from "lucide-react";

export type FinanceNavItem = {
  to: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
};

export type FinanceNavGroup = {
  key: string;
  labelKey: string;
  items: FinanceNavItem[];
  adminOnly?: boolean;
};

export const FINANCE_NAV_GROUPS: FinanceNavGroup[] = [
  {
    key: "overview",
    labelKey: "finance:sidebar.groups.overview",
    items: [
      { to: "/finance", labelKey: "finance:sidebar.items.overview", icon: LayoutDashboard, end: true },
    ],
  },
  {
    key: "payments",
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
    key: "invoicing",
    labelKey: "finance:sidebar.groups.invoicing",
    items: [
      { to: "/finance/invoicing/clients", labelKey: "finance:sidebar.items.clients", icon: Users },
      { to: "/finance/invoicing/invoices", labelKey: "finance:sidebar.items.invoices", icon: FileText },
      { to: "/finance/invoicing/receipts", labelKey: "finance:sidebar.items.receipts", icon: Send },
      { to: "/finance/invoicing/inflows", labelKey: "finance:sidebar.items.inflows", icon: Inbox },
    ],
  },
  {
    key: "banking",
    labelKey: "finance:sidebar.groups.banking",
    items: [
      { to: "/finance/banking/balances", labelKey: "finance:sidebar.items.balances", icon: Banknote },
      { to: "/finance/banking/reconciliation", labelKey: "finance:sidebar.items.reconciliation", icon: RefreshCw },
      { to: "/finance/banking/transactions", labelKey: "finance:sidebar.items.transactions", icon: ListChecks },
    ],
  },
  {
    key: "reports",
    labelKey: "finance:sidebar.groups.reports",
    items: [
      { to: "/finance/reports/cashflow", labelKey: "finance:sidebar.items.cashflow", icon: BarChart3 },
      { to: "/finance/reports/vat", labelKey: "finance:sidebar.items.vat", icon: Percent },
      { to: "/finance/reports/forecast", labelKey: "finance:sidebar.items.forecast", icon: TrendingUp },
      { to: "/finance/reports/projects", labelKey: "finance:sidebar.items.projectFinancials", icon: FolderKanban },
    ],
  },
  {
    key: "data",
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
    key: "admin",
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

export function findActiveFinanceGroup(
  path: string,
  groups: FinanceNavGroup[] = FINANCE_NAV_GROUPS,
): FinanceNavGroup {
  // Prefer the most specific (longest) item match across all groups.
  let bestGroup: FinanceNavGroup = groups[0];
  let bestLen = -1;
  for (const g of groups) {
    for (const it of g.items) {
      const match = it.end ? path === it.to : path === it.to || path.startsWith(it.to + "/");
      if (match && it.to.length > bestLen) {
        bestLen = it.to.length;
        bestGroup = g;
      }
    }
  }
  return bestGroup;
}

export function isFinanceItemActive(path: string, to: string, end?: boolean): boolean {
  return end ? path === to : path === to || path.startsWith(to + "/");
}
