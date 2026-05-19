/**
 * Stage 6A + 6B — Project Bootstrap Foundation
 * Public surface.
 */
export * from "./types";
export * from "./baseline-types";
export { buildProjectBootstrapSnapshot } from "./bootstrap-snapshot";
export { resolveProjectBootstrapPreview } from "./bootstrap-resolver";
export {
  resolveProjectCommercialBaseline,
  resolveStageCommercialBaselines,
  resolveAllocationPlaceholders,
} from "./commercial-baseline";
export {
  usePreviewProjectBootstrap,
  useApplyProjectBootstrap,
  useProjectBootstrapRunForContract,
  useProjectCommercialBaseline,
  useStageCommercialBaselines,
  useStageAllocationPlaceholders,
} from "./use-project-bootstrap";
