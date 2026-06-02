import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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

export function PersonaPage() {
  const { t } = useTranslation("persona");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();
  const personaName = useSettingsStore((s) => s.personaName);
  const personaDesc = useSettingsStore((s) => s.personaDesc);
  const loadPersona = useSettingsStore((s) => s.loadPersona);
  const savePersona = useSettingsStore((s) => s.savePersona);

  const [name, setName] = useState(personaName);
  const [desc, setDesc] = useState(personaDesc);

  useEffect(() => {
    loadPersona();
  }, [loadPersona]);
  useEffect(() => {
    setName(personaName);
    setDesc(personaDesc);
  }, [personaName, personaDesc]);

  const handleSave = () => {
    if (!name.trim()) {
      toast("error", t("toast.nameRequired"));
      return;
    }
    savePersona(name.trim(), desc);
    toast("success", t("toast.saved"));
  };

  return (
    <div className="flex h-full">
      <div className="w-56 border-r p-4 flex flex-col">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          {tc("actions.back")}
        </button>
        <h2 className="text-lg font-semibold mb-1">{t("sidebar.title")}</h2>
        <p className="text-xs text-muted-foreground" dangerouslySetInnerHTML={{ __html: t("sidebar.description") }} />
      </div>
      <div className="flex-1 p-6 overflow-auto">
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
              <p className="text-xs text-muted-foreground mt-1">{t("form.displayNameHint")}</p>
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
              <Save className="h-4 w-4 mr-2" />
              {t("actions.save", { ns: "common" })}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
