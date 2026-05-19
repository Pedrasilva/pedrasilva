/**
 * Stage 5A — Contract Generator Foundation
 * Public surface for the contracts module.
 */
export * from "./types";
export { buildContractSnapshot } from "./contract-snapshots";
export {
  resolveContractClauses,
  resolveContractExhibits,
} from "./contract-resolver";
export {
  useContract,
  useContractsByQuote,
  useCreateDraftContractFromQuote,
  useUpdateClauseContent,
  useRegenerateDraftContract,
  useIssueContract,
  useSignContract,
  useVoidContract,
  useCreateRevisionContract,
} from "./use-contracts";
