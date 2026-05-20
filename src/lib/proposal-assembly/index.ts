/**
 * Public surface of the Proposal Container & Assembly Layer.
 *
 * ADDITIVE: existing proposal builder, generated_content architecture,
 * editable blocks, drag/drop, fee calculator, payment generator and Gantt
 * remain untouched. Legacy proposals continue to function unchanged.
 */
export * from "./types";
export { assembleProposal } from "./assemble";
export { ATTACHMENT_TEMPLATES, findAttachment } from "./registries/attachment-templates";
export { SECTION_TEMPLATES, lookupSectionTemplate } from "./registries/section-templates";
export {
  PLACEHOLDER_CATALOG,
  DYNAMIC_PHASE_PLACEHOLDER_PREFIXES,
} from "./placeholders/catalog";
export {
  buildPlaceholderMap,
  resolvePlaceholders,
} from "./placeholders/resolve";
export { useAssembleProposalInsert } from "./use-assemble-proposal-insert";
export { SCENARIOS, SCENARIO_SMALL, SCENARIO_MEDIUM, SCENARIO_LARGE } from "./scenarios";
export type { ScenarioId } from "./scenarios";
export { detectManualEdits } from "./manual-edit-detector";
export type { EditFinding, EditReport, StoredBlock } from "./manual-edit-detector";
