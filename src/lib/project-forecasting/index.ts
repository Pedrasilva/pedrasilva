/**
 * Stage 6C — Forecast & capacity engine.
 * Public surface.
 */
export * from "./types";
export * from "./allocation-forecast";
export * from "./staffing-coverage";
export * from "./recoverability";
export * from "./capacity";
export * from "./project-metrics";
export * from "./allocation-suggestions";
export {
  useProjectForecastEnvelope,
  useFreezeProjectForecastSnapshot,
  type ProjectForecastEnvelope,
} from "./use-project-forecast";
