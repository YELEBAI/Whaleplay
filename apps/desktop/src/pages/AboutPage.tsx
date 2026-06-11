import { useTranslation } from "react-i18next";
import { ExternalLink, MessageCircle, Scale, BookOpen } from "lucide-react";
import { Button } from "@neo-tavern/ui";

// ── GitHub SVG icon (not available in lucide-react) ──
const GithubIcon = (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.205.085 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.418-1.305.762-1.604-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.605-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12 24 5.37 18.63 0 12 0z" />
  </svg>
);

// ── Tooltip ───────────────────────────────────────────
const Tooltip = ({ text, children }: { text: string; children: React.ReactNode }) => (
  <span className="group relative inline-flex items-center">
    {children}
    <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background opacity-0 transition-opacity group-hover:opacity-100">
      {text}
    </span>
  </span>
);

// ── Link row ──────────────────────────────────────────
const linkRow =
  "inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-accent transition-colors";

export function AboutPage() {
  const { t } = useTranslation("about");

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="flex max-w-sm flex-col items-center gap-6 text-center">
        <img src="/icons/128x128.png" alt="Whale Play" className="h-24 w-24 rounded-2xl shadow-lg" />

        <div>
          <h1 className="text-2xl font-bold">Whale Play</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
        </div>

        <div className="flex w-full flex-col gap-3">
          <a href="https://github.com/YELEBAI/Whaleplay" target="_blank" rel="noopener noreferrer" className={linkRow}>
            {GithubIcon}
            {t("repository")}
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </a>

          <a
            href="https://github.com/YELEBAI/Whaleplay/issues"
            target="_blank"
            rel="noopener noreferrer"
            className={linkRow}
          >
            <MessageCircle className="h-4 w-4" />
            {t("feedback")}
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </a>

          <span className={linkRow}>
            <Scale className="h-4 w-4" />
            {t("license")}
            <Tooltip text={t("licenseHint")}>
              <span className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                ?
              </span>
            </Tooltip>
          </span>

          <Button
            variant="outline"
            onClick={() => window.open("https://github.com/YELEBAI/Whaleplay/tree/main/docs/zh/index.md", "_blank")}
            className="gap-2"
          >
            <BookOpen className="h-4 w-4" />
            {t("documentation")}
          </Button>
        </div>
      </div>
    </div>
  );
}
