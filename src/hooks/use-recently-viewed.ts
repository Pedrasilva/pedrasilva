/**
 * Lightweight Recently Viewed tracker.
 *
 * Stores a short, deduplicated, newest-first list of recently visited
 * detail pages per module in localStorage. No backend persistence.
 *
 * - `useRecordRecentlyViewed({ module, href, label })` — record an item.
 *   Mount on detail routes once the entity label is known. It is a no-op
 *   while `label` is empty.
 * - `useRecentlyViewed(module)` — read the list (reactive across tabs and
 *   within the app via a "storage"-like custom event).
 */
import { useCallback, useEffect, useState } from "react";

export type RecentModule =
  | "projects"
  | "crm"
  | "hr"
  | "finance";

export type RecentItem = {
  href: string;
  label: string;
  module: RecentModule;
  ts: number;
};

const KEY = "psa.recentlyViewed.v1";
const MAX_PER_MODULE = 6;
const EVENT = "psa:recently-viewed-changed";

function safeRead(): RecentItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isItem) : [];
  } catch {
    return [];
  }
}

function isItem(x: unknown): x is RecentItem {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.href === "string" &&
    typeof o.label === "string" &&
    typeof o.module === "string" &&
    typeof o.ts === "number"
  );
}

function safeWrite(items: RecentItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function useRecentlyViewed(module: RecentModule): RecentItem[] {
  const [items, setItems] = useState<RecentItem[]>([]);

  useEffect(() => {
    const update = () =>
      setItems(
        safeRead()
          .filter((i) => i.module === module)
          .sort((a, b) => b.ts - a.ts)
          .slice(0, MAX_PER_MODULE),
      );
    update();
    const onChange = () => update();
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [module]);

  return items;
}

export function useRecordRecentlyViewed(input: {
  module: RecentModule;
  href: string;
  label: string;
}) {
  const { module, href, label } = input;
  useEffect(() => {
    if (!href || !label) return;
    const all = safeRead();
    const next: RecentItem[] = [
      { module, href, label, ts: Date.now() },
      ...all.filter((i) => !(i.module === module && i.href === href)),
    ];
    // Cap globally to keep storage bounded.
    safeWrite(next.slice(0, MAX_PER_MODULE * 4));
  }, [module, href, label]);
}

export function clearRecentlyViewed(module?: RecentModule) {
  const all = safeRead();
  const next = module ? all.filter((i) => i.module !== module) : [];
  safeWrite(next);
}

/** Imperative record (e.g. from event handlers). */
export function recordRecentlyViewed(item: Omit<RecentItem, "ts">) {
  if (!item.href || !item.label) return;
  const all = safeRead();
  const next: RecentItem[] = [
    { ...item, ts: Date.now() },
    ...all.filter((i) => !(i.module === item.module && i.href === item.href)),
  ];
  safeWrite(next.slice(0, MAX_PER_MODULE * 4));
}

export const RECENTLY_VIEWED_MAX = MAX_PER_MODULE;
