import { useCallback, useEffect, useState } from "react";

/**
 * Local, per-browser personalisation of the Product Library project board:
 * a colour tag and a manual order for each project card.
 */
export const PROJECT_COLORS = [
  "none",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
] as const;

export type ProjectColor = (typeof PROJECT_COLORS)[number];

export const PROJECT_COLOR_LABEL: Record<ProjectColor, string> = {
  none: "No colour",
  "chart-1": "Terracotta",
  "chart-2": "Teal",
  "chart-3": "Deep blue",
  "chart-4": "Amber",
  "chart-5": "Ochre",
};

export const PROJECT_COLOR_SWATCH: Record<ProjectColor, string> = {
  none: "bg-muted",
  "chart-1": "bg-chart-1",
  "chart-2": "bg-chart-2",
  "chart-3": "bg-chart-3",
  "chart-4": "bg-chart-4",
  "chart-5": "bg-chart-5",
};

/** Left accent border applied to the card. */
export const PROJECT_COLOR_BORDER: Record<ProjectColor, string> = {
  none: "border-l-transparent",
  "chart-1": "border-l-chart-1",
  "chart-2": "border-l-chart-2",
  "chart-3": "border-l-chart-3",
  "chart-4": "border-l-chart-4",
  "chart-5": "border-l-chart-5",
};

type BoardState = {
  colors: Record<string, ProjectColor>;
  order: string[];
};

const KEY = "psa.products.projectBoard.v1";
const EMPTY: BoardState = { colors: {}, order: [] };

function read(): BoardState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<BoardState>;
    return { colors: parsed.colors ?? {}, order: parsed.order ?? [] };
  } catch {
    return EMPTY;
  }
}

export function useProjectBoard() {
  const [state, setState] = useState<BoardState>(EMPTY);

  useEffect(() => {
    setState(read());
  }, []);

  const persist = useCallback((next: BoardState) => {
    setState(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable — keep the in-memory value */
    }
  }, []);

  const setColor = useCallback(
    (id: string, color: ProjectColor) =>
      persist({ ...state, colors: { ...state.colors, [id]: color } }),
    [persist, state],
  );

  /** Move `id` so that it sits at the position currently held by `targetId`. */
  const moveBefore = useCallback(
    (ids: string[], id: string, targetId: string) => {
      if (id === targetId) return;
      const base = orderIds(ids, state.order);
      const next = base.filter((x) => x !== id);
      const at = next.indexOf(targetId);
      next.splice(at < 0 ? next.length : at, 0, id);
      persist({ ...state, order: next });
    },
    [persist, state],
  );

  const resetOrder = useCallback(() => persist({ ...state, order: [] }), [persist, state]);

  return {
    colors: state.colors,
    order: state.order,
    hasCustomOrder: state.order.length > 0,
    setColor,
    moveBefore,
    resetOrder,
  };
}

/** Apply a saved order to a list of ids, keeping unknown ids in their original place. */
export function orderIds(ids: string[], order: string[]): string[] {
  if (!order.length) return [...ids];
  const known = order.filter((id) => ids.includes(id));
  const rest = ids.filter((id) => !known.includes(id));
  return [...known, ...rest];
}
