import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Save, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Input,
  Textarea,
  Label,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@neo-tavern/ui";
import { useSettingsStore } from "@/features/settings/settings.store";
import { toast } from "@/utils/toast";
import { TFunction } from "i18next";

// ── Sidebar ───────────────────────────────────────────

function PersonaSidebar({ t, tc, onBack }: { t: TFunction<"persona">; tc: TFunction<"common">; onBack: () => void }) {
  return (
    <div className="flex w-60 flex-col gap-3 border-r p-4">
      <button
        onClick={onBack}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {tc("actions.back")}
      </button>
      <h2 className="text-muted-foreground text-sm font-semibold tracking-wider uppercase">{t("sidebar.title")}</h2>
      <p className="text-muted-foreground text-xs">{t("sidebar.description")}</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────

export function PersonaPage() {
  const { t } = useTranslation("persona");
  const { t: tc } = useTranslation("common");
  const { t: tt } = useTranslation("toast");
  const navigate = useNavigate();
  const personaName = useSettingsStore((s) => s.personaName);
  const personaDesc = useSettingsStore((s) => s.personaDesc);
  const loadPersona = useSettingsStore((s) => s.loadPersona);
  const savePersona = useSettingsStore((s) => s.savePersona);

  const [name, setName] = useState(personaName);
  const [desc, setDesc] = useState(personaDesc);
  const hasSyncedStoreRef = useRef(false);

  useEffect(() => {
    loadPersona();
  }, [loadPersona]);

  useEffect(() => {
    if (!hasSyncedStoreRef.current) {
      hasSyncedStoreRef.current = true;
      return;
    }
    setName(personaName);
    setDesc(personaDesc);
  }, [personaName, personaDesc]);

  const handleSave = () => {
    if (!name.trim()) {
      toast("error", tt("nameRequired"));
      return;
    }
    savePersona(name.trim(), desc);
    toast("success", tt("personaSaved"));
  };

  return (
    <div className="flex h-full">
      <PersonaSidebar t={t} tc={tc} onBack={() => navigate("/")} />
      <div className="flex-1 overflow-auto p-6">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              {t("card.title")}
            </CardTitle>
            <CardDescription>{t("card.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>{t("form.displayName")}</Label>
              <Input
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                placeholder={t("form.displayNamePlaceholder")}
              />
              <p className="text-muted-foreground mt-1 text-xs">{t("form.displayNameHint")}</p>
            </div>
            <div>
              <Label>{t("form.description")}</Label>
              <Textarea
                value={desc}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDesc(e.target.value)}
                placeholder={t("form.descriptionPlaceholder")}
                rows={4}
              />
            </div>
            <Button onClick={handleSave}>
              <Save className="mr-2 h-4 w-4" />
              {t("actions.save", { ns: "common" })}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
