import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { VatMode } from "@/components/finance/sections/legacy-sections";

type FinanceShellCtx = {
  vatMode: VatMode;
  setVatMode: (m: VatMode) => void;
};

const Ctx = createContext<FinanceShellCtx | null>(null);

export function FinanceShellProvider({ children }: { children: ReactNode }) {
  const [vatMode, setVatMode] = useState<VatMode>("inc");
  const value = useMemo(() => ({ vatMode, setVatMode }), [vatMode]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFinanceShell(): FinanceShellCtx {
  const v = useContext(Ctx);
  if (!v) {
    // Permissive fallback so child components don't crash if rendered outside.
    return { vatMode: "inc", setVatMode: () => {} };
  }
  return v;
}
