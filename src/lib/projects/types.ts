import type { Database } from "@/integrations/supabase/types";

export type Project = Database["public"]["Tables"]["pm_projects"]["Row"];
export type Stage = Database["public"]["Tables"]["pm_stages"]["Row"];
export type Resource = Database["public"]["Tables"]["pm_resources"]["Row"];
export type Allocation = Database["public"]["Tables"]["pm_allocations"]["Row"];
export type Task = Database["public"]["Tables"]["pm_tasks"]["Row"];
export type TimeEntry = Database["public"]["Tables"]["pm_time_entries"]["Row"];

export type AllocationWithResource = Allocation & { resource: Resource };
export type StageWithAllocations = Stage & { allocations: AllocationWithResource[] };
