import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Edit, ArrowLeft, Upload } from 'lucide-react'
import { Button, Input, Textarea, ScrollArea, Label, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@neo-tavern/ui'
import { useCharacterStore } from '@/features/character/character.store'
import { useSettingsStore } from '@/features/settings/settings.store'
import { useWorldbookStore } from '@/features/settings/worldbook.store'
import { generateId } from '@neo-tavern/shared'
import type { CreateCharacterInput, Character, RegexPreset, Worldbook } from '@neo-tavern/shared'
import { settingsRepository, worldbookRepository } from '@/db/repositories'
import { parseJsonCharacterCard, parsePngCharacterCard, type ParsedCharacterCard } from '@/utils/parse-character-card'

const emptyForm: CreateCharacterInput = {
  name: '',
  description: '',
  personality: '',
  scenario: '',
  firstMessage: '',
  exampleDialogues: '',
}

export function CharacterPage() {
  const navigate = useNavigate()
  const { characters, loading, error, loadCharacters, createCharacter, updateCharacter, deleteCharacter, clearError } = useCharacterStore()
  const [form, setForm] = useState<CreateCharacterInput>(emptyForm)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Character | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const toast = (type: 'success' | 'error' | 'info', msg: string) => {
    const fn = (window as any).__toast
    if (fn) fn(type, msg)
  }

  useEffect(() => {
    loadCharacters()
  }, [loadCharacters])

  useEffect(() => {
    if (!selectedId && !editingId && characters.length > 0) {
      setSelectedId(characters[0].id)
    }
  }, [characters])

  const selected = characters.find((c) => c.id === selectedId) ?? null

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const isPng = file.name.toLowerCase().endsWith('.png')
      let card: ParsedCharacterCard | null

      if (isPng) {
        const buf = await file.arrayBuffer()
        card = parsePngCharacterCard(buf)
      } else {
        const text = await file.text()
        card = parseJsonCharacterCard(text)
      }

      if (!card) { toast('error', 'Could not parse character card'); return }

      const charName = card.name || file.name.replace(/\.(json|png)$/i, '')
      const now = new Date().toISOString()

      const char = await createCharacter({
        name: charName,
        description: card.description,
        personality: card.personality,
        scenario: card.scenario,
        firstMessage: card.firstMessage,
        exampleDialogues: card.exampleDialogues,
      })

      const importedParts: string[] = ['Character']

      if (card.regexScripts.length > 0) {
        const regexRules: any[] = []
        for (const s of card.regexScripts) {
          if (s.disabled) continue
          if (!s.findRegex) continue
          const m = s.findRegex.match(/^\/(.+)\/([a-z]*)$/)
          if (!m) continue
          const isDisplay = s.markdownOnly && !s.promptOnly
          if (!isDisplay) continue
          regexRules.push({
            id: generateId(), presetId: '',
            name: s.scriptName || 'Imported Rule',
            pattern: m[1], displayTemplate: '',
            stripFromPrompt: true, enabled: true, createdAt: now,
          })
        }
        if (regexRules.length > 0) {
          const presetId = generateId()
          for (const r of regexRules) r.presetId = presetId
          const preset: RegexPreset = {
            id: presetId, name: charName + ' Regex', description: 'Auto-imported with ' + charName,
            rules: regexRules, isGlobal: false, createdAt: now, updatedAt: now,
          }
          const existingPresets = useSettingsStore.getState().regexPresets
          await settingsRepository.saveRegexRules([...existingPresets, preset])
          useSettingsStore.getState().loadRegexRules()
          await updateCharacter(char.id, { regexPresetId: presetId })
          useSettingsStore.getState().setActiveRegexPreset(presetId)
          importedParts.push(regexRules.length + ' regex rules')
        }
      }

      if (card.worldbookEntries.length > 0) {
        const wbName = card.worldbookName || charName + ' Lorebook'
        const wb: Worldbook = {
          id: generateId(), name: wbName,
          description: 'Imported with ' + charName,
          entries: card.worldbookEntries.map((e) => ({
            id: generateId(), worldbookId: '',
            title: e.title, keys: e.keys, content: e.content,
            priority: e.priority, type: e.always ? 'always' as const : 'trigger' as const,
            triggerMode: e.triggerMode, enabled: e.enabled,
            createdAt: now, updatedAt: now,
          })),
          createdAt: now, updatedAt: now,
        }
        for (const entry of wb.entries) entry.worldbookId = wb.id
        const existingWbs = useWorldbookStore.getState().worldbooks
        await worldbookRepository.save([...existingWbs, wb])
        useWorldbookStore.getState().loadWorldbooks()
        await updateCharacter(char.id, { worldbookId: wb.id })
        useWorldbookStore.getState().setActiveWorldbook(wb.id)
        importedParts.push(wb.entries.length + ' worldbook entries')
      }

      toast('success', `Imported "${charName}" — ${importedParts.join(', ')}`)
      setSelectedId(char.id)
    } catch {
      toast('error', 'Failed to import character card')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) return
    try {
      if (editingId) {
        await updateCharacter(editingId, form)
        setEditingId(null)
        setSelectedId(editingId)
      } else {
        const created = await createCharacter(form)
        setSelectedId(created.id)
        setEditingId(null)
      }
      setForm(emptyForm)
    } catch {
    }
  }

  const handleStartEdit = (char?: Character) => {
    if (char) {
      setForm({
        name: char.name,
        description: char.description,
        personality: char.personality,
        scenario: char.scenario,
        firstMessage: char.firstMessage,
        exampleDialogues: char.exampleDialogues ?? '',
      })
      setEditingId(char.id)
      setSelectedId(null)
    } else {
      setForm(emptyForm)
      setEditingId(null)
    }
  }

  const handleSelect = (char: Character) => {
    if (editingId) return
    setSelectedId(char.id)
  }

  const handleCancel = () => {
    setEditingId(null)
    setForm(emptyForm)
    if (selected) setSelectedId(selected.id)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      if (deleteTarget.regexPresetId) {
        const presets = useSettingsStore.getState().regexPresets.filter((p) => p.id !== deleteTarget.regexPresetId)
        await settingsRepository.saveRegexRules(presets)
        useSettingsStore.getState().loadRegexRules()
      }
      if (deleteTarget.worldbookId) {
        const wbs = useWorldbookStore.getState().worldbooks.filter((w) => w.id !== deleteTarget.worldbookId)
        await worldbookRepository.save(wbs)
        useWorldbookStore.getState().loadWorldbooks()
      }
      await deleteCharacter(deleteTarget.id)
      setDeleteTarget(null)
      if (selectedId === deleteTarget.id) setSelectedId(null)
      if (editingId === deleteTarget.id) {
        setEditingId(null)
        setForm(emptyForm)
      }
      toast('info', `Deleted "${deleteTarget.name}"`)
    } catch {
    }
  }

  const updateField = (field: keyof CreateCharacterInput, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const hasContent = (text: string | undefined) => text && text.trim().length > 0

  return (
    <div className="flex h-full">
      <div className="w-56 border-r p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Characters</h2>
          <div className="flex gap-1">
            <input ref={fileInputRef} type="file" accept=".json,.png" onChange={handleImportFile} className="hidden" />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => fileInputRef.current?.click()} disabled={importing} title="Import character card">
              <Upload className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigate('/')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={() => handleStartEdit()} className="justify-start text-xs">
          <Plus className="h-3.5 w-3.5 mr-1" />New Character
        </Button>

        <ScrollArea className="flex-1 -mx-2 px-2">
          <div className="flex flex-col gap-0.5">
            {loading && <p className="text-xs text-muted-foreground p-2">Loading...</p>}
            {!loading && characters.length === 0 && (
              <p className="text-xs text-muted-foreground p-2">No characters yet.</p>
            )}
            {characters.map((char) => (
              <div key={char.id}
                className={`p-2 rounded-lg flex items-center justify-between group transition-colors cursor-pointer
                  ${selectedId === char.id ? 'bg-accent' : 'hover:bg-accent/50'}`}
                onClick={() => handleSelect(char)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {char.avatar ? (
                    <img src={char.avatar} alt={char.name} className="w-7 h-7 rounded-lg object-cover border border-border/30 shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-accent/60 border border-border/30 shrink-0 flex items-center justify-center">
                      <span className="text-xs font-bold text-muted-foreground">{char.name.charAt(0)}</span>
                    </div>
                  )}
                  <span className="text-sm font-medium truncate">{char.name}</span>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); handleStartEdit(char) }}>
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteTarget(char) }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 overflow-auto">
        {error && (
          <div className="m-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center justify-between">
            <span>{error}</span>
            <Button variant="ghost" size="sm" onClick={clearError}>Dismiss</Button>
          </div>
        )}

        {editingId !== null ? (
          /* ====== EDIT MODE ====== */
          <div className="p-6">
            <h1 className="text-2xl font-bold mb-6">{editingId ? 'Edit Character' : 'New Character'}</h1>

            <div className="grid gap-4 max-w-2xl">
              <div>
                <Label htmlFor="char-name">Name *</Label>
                <Input id="char-name" value={form.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('name', e.target.value)} placeholder="Character name" />
              </div>
              <div>
                <Label htmlFor="char-desc">Description</Label>
                <Textarea id="char-desc" value={form.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateField('description', e.target.value)} placeholder="Describe the character..." rows={3} />
              </div>
              <div>
                <Label htmlFor="char-personality">Personality</Label>
                <Textarea id="char-personality" value={form.personality} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateField('personality', e.target.value)} placeholder="Personality traits..." rows={3} />
              </div>
              <div>
                <Label htmlFor="char-scenario">Scenario</Label>
                <Textarea id="char-scenario" value={form.scenario} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateField('scenario', e.target.value)} placeholder="Current scenario / situation..." rows={3} />
              </div>
              <div>
                <Label htmlFor="char-firstmsg">First Message</Label>
                <Textarea id="char-firstmsg" value={form.firstMessage} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateField('firstMessage', e.target.value)} placeholder="The character's first message..." rows={3} />
              </div>
              <div>
                <Label htmlFor="char-examples">Example Dialogues</Label>
                <Textarea id="char-examples" value={form.exampleDialogues ?? ''} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateField('exampleDialogues', e.target.value)} placeholder="Example conversations..." rows={4} />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSubmit} disabled={!form.name.trim() || loading}>
                  {editingId ? 'Update' : 'Create'} Character
                </Button>
                <Button variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        ) : selected ? (
          /* ====== PREVIEW MODE ====== */
          <div className="p-6 max-w-3xl">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                {selected.avatar ? (
                  <img
                    src={selected.avatar}
                    alt={selected.name}
                    className="w-16 h-16 rounded-xl object-cover border border-border/50 shadow-sm"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-accent/60 border border-border/50 shadow-sm flex items-center justify-center">
                    <span className="text-2xl font-bold text-muted-foreground select-none">
                      {selected.name.charAt(0)}
                    </span>
                  </div>
                )}
                <h1 className="text-2xl font-bold">{selected.name}</h1>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleStartEdit(selected)}>
                <Edit className="h-4 w-4 mr-1" />Edit
              </Button>
            </div>

            {hasContent(selected.description) && (
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Description</h3>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{selected.description}</p>
              </div>
            )}

            {hasContent(selected.personality) && (
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Personality</h3>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{selected.personality}</p>
              </div>
            )}

            {hasContent(selected.scenario) && (
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Scenario</h3>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{selected.scenario}</p>
              </div>
            )}

            {hasContent(selected.firstMessage) && (
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">First Message</h3>
                <div className="bg-accent/50 border border-border/50 rounded-lg p-4">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap italic">{selected.firstMessage}</p>
                </div>
              </div>
            )}

            {hasContent(selected.exampleDialogues) && (
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Example Dialogues</h3>
                <div className="bg-muted/40 border border-border/30 rounded-lg p-4">
                  <p className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground font-mono">{selected.exampleDialogues}</p>
                </div>
              </div>
            )}

            {!hasContent(selected.description) && !hasContent(selected.personality) && !hasContent(selected.scenario) && !hasContent(selected.firstMessage) && !hasContent(selected.exampleDialogues) && (
              <div className="text-center text-muted-foreground text-sm py-12">
                <p className="mb-2">This character has no details yet.</p>
                <Button variant="outline" size="sm" onClick={() => handleStartEdit(selected)}>
                  <Edit className="h-3.5 w-3.5 mr-1" />Add Details
                </Button>
              </div>
            )}
          </div>
        ) : (
          /* ====== EMPTY STATE ====== */
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <div className="text-center space-y-2">
              <p>Select a character or create a new one</p>
              <Button variant="outline" size="sm" onClick={() => handleStartEdit()}>
                <Plus className="h-4 w-4 mr-1" />New Character
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Character</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"? This will also delete all associated chats and messages. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
