import { supabase } from '@/integrations/supabase/client';

/** Caller-scoped RPC. Never fetch raw rows as a fallback. */
export async function readB1Rows<T>(kind: 'projects' | 'stages' | 'resources' | 'entries' | 'history', projectId?: string): Promise<T[]> {
  const { data, error } = await supabase.rpc(`pm_b1_${kind}` as never, { _project: projectId ?? null } as never);
  if (error) throw error;
  return ((data ?? []) as unknown as (T | null)[]).filter((row): row is T => row !== null);
}

export function permittedNumber(value: number | null | undefined, allowed: boolean): number {
  return allowed && value != null && Number.isFinite(value) ? value : NaN;
}

export function permittedMargin(value: number | null, cost: number | null, allowedParts: boolean[]): number | null {
  if (!allowedParts.every(Boolean) || value == null || cost == null || !Number.isFinite(value) || !Number.isFinite(cost) || value <= 0) return null;
  return (value - cost) / value;
}