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
export {
  useProjectForecastEnvelope,
  useFreezeProjectForecastSnapshot,
  type ProjectForecastEnvelope,
} from "./use-project-forecast";
