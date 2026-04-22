/**
 * LanguageSwitcher — compact dropdown that lets the user toggle between EN and
 * PT-PT. Persists to localStorage immediately and to the user profile when
 * authenticated (handled by `LanguageProvider`).
 */
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/i18n/language-provider";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { t } = useTranslation("common");
  const { language, setLanguage } = useLanguage();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground",
          className,
        )}
        aria-label={t("language")}
      >
        <Languages className="h-4 w-4" />
        <span className="hidden sm:inline uppercase">{language === "pt-PT" ? "PT" : "EN"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{t("language")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SUPPORTED_LANGUAGES.map((code: SupportedLanguage) => (
          <DropdownMenuItem
            key={code}
            onSelect={() => void setLanguage(code)}
            className={cn(
              "cursor-pointer",
              language === code && "bg-accent font-medium",
            )}
          >
            {t(`languages.${code}` as const)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
