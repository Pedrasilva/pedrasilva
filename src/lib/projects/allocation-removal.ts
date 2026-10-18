/** Allocations with any logged hours can only be retired; empty ones may be deleted. */
export const removalMode = (loggedHours: number): "delete" | "retire" => (loggedHours > 0 ? "retire" : "delete");
