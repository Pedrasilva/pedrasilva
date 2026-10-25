import { useTranslation } from "react-i18next";
export function ProposalImageEditorHint() {
 const { t } = useTranslation("crm");
 return <>{t("quoteEditor.selectImageHint")}</>;
}
