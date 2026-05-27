import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Save, Settings, Trash2 } from 'lucide-react'
import { Button, Card, CardHeader, CardTitle, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Input } from '@neo-tavern/ui'
import { useCharacterStore } from '@/features/character/character.store'
import { useChatStore } from '@/features/chat/chat.store'
import { chatSavepointRepository, createDefaultSavepointName, messageRepository } from '@/db/repositories'
import type { Character, Chat } from '@neo-tavern/shared'
import { CharacterAvatarTile } from '@/components'

type HomeContextMenu =
  | { type: 'character'; x: number; y: number; character: Character }
  | { type: 'chat'; x: number; y: number; chat: Chat; character?: Character }

function toast(type: 'success' | 'error' | 'info', message: string) {
  const fn = (window as any).__toast
  if (fn) fn(type, message)
}

export function HomePage() {
  const navigate = useNavigate()
  const { characters, loading: charsLoading, loadCharacters } = useCharacterStore()
  const { chats, loading: chatsLoading, loadChats, deleteChat } = useChatStore()
  const [deleteTarget, setDeleteTarget] = useState<Chat | null>(null)
  const [saveTarget, setSaveTarget] = useState<Chat | null>(null)
  const [savepointName, setSavepointName] = useState('')
  const [savingSavepoint, setSavingSavepoint] = useState(false)
  const [contextMenu, setContextMenu] = useState<HomeContextMenu | null>(null)
  const charactersById = useMemo(() => new Map(characters.map((char) => [char.id, char])), [characters])

  useEffect(() => {
    loadCharacters()
    loadChats()
  }, [loadCharacters, loadChats])

  useEffect(() => {
    if (!contextMenu) return

    const close = () => setContextMenu(null)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }

    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', closeOnEscape)

    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [contextMenu])

  const handleCharacterClick = (characterId: string) => {
    const existingChat = chats.find((c) => c.characterId === characterId)
    if (existingChat) {
      navigate(`/chat/${existingChat.id}`)
    } else {
      navigate(`/chat/new?characterId=${characterId}`)
    }
  }

  const handleOpenChat = (chatId: string) => {
    navigate(`/chat/${chatId}`)
  }

  const openCharacterContextMenu = (event: React.MouseEvent, character: Character) => {
    event.preventDefault()
    setContextMenu({ type: 'character', x: event.clientX, y: event.clientY, character })
  }

  const openChatContextMenu = (event: React.MouseEvent, chat: Chat, character?: Character) => {
    event.preventDefault()
    setContextMenu({ type: 'chat', x: event.clientX, y: event.clientY, chat, character })
  }

  const closeContextMenu = () => setContextMenu(null)

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    await deleteChat(deleteTarget.id)
    setDeleteTarget(null)
  }

  const closeSaveDialog = () => {
    setSaveTarget(null)
    setSavepointName('')
    setSavingSavepoint(false)
  }

  const handleCreateSavepoint = async () => {
    if (!saveTarget) return
    setSavingSavepoint(true)
    try {
      const messages = await messageRepository.listByChatId(saveTarget.id)
      await chatSavepointRepository.create({
        chatId: saveTarget.id,
        characterId: saveTarget.characterId,
        name: savepointName,
        messages,
      })
      toast('success', '存档已创建')
      closeSaveDialog()
    } catch {
      toast('error', '创建存档失败')
      setSavingSavepoint(false)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">NeoTavern Demo</h1>
          <Button variant="outline" onClick={() => navigate('/settings')}>
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>

        <div className="mt-5 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Characters</h2>
          <Button size="icon" variant="ghost" onClick={() => navigate('/character')}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3 min-h-[128px] overflow-x-auto pb-2">
          <div className="flex min-w-max gap-4">
            {charsLoading && <p className="text-sm text-muted-foreground p-2">Loading...</p>}
            {!charsLoading && characters.length === 0 && (
              <p className="text-sm text-muted-foreground p-2">No characters yet.</p>
            )}
            {characters.map((char) => (
              <CharacterAvatarTile
                key={char.id}
                character={char}
                onClick={() => handleCharacterClick(char.id)}
                onContextMenu={(event) => openCharacterContextMenu(event, char)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <h2 className="text-lg font-semibold mb-3">Recent Chats</h2>
          {chatsLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {!chatsLoading && chats.length === 0 && (
            <p className="text-sm text-muted-foreground">No chats yet. Select a character to start.</p>
          )}
          <div className="grid gap-3">
            {chats.map((chat) => {
              const character = charactersById.get(chat.characterId)
              const displayName = character?.name || chat.title
              const avatar = character?.avatar

              return (
                <Card
                  key={chat.id}
                  className="group cursor-pointer transition-colors hover:bg-accent/50"
                  onClick={() => handleOpenChat(chat.id)}
                  onContextMenu={(event: React.MouseEvent) => openChatContextMenu(event, chat, character)}
                >
                  <CardHeader className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="flex min-w-0 items-center gap-3 text-sm">
                        {avatar ? (
                          <img
                            src={avatar}
                            alt={displayName}
                            className="h-10 w-10 shrink-0 rounded-lg border border-border/30 object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/30 bg-accent/60">
                            <span className="text-sm font-bold text-muted-foreground">{displayName.charAt(0)}</span>
                          </div>
                        )}
                        <span className="min-w-0 truncate">{chat.title}</span>
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); setDeleteTarget(chat) }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                </Card>
              )
            })}
          </div>
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 min-w-44 overflow-hidden rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 190),
            top: Math.min(contextMenu.y, window.innerHeight - 160),
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {contextMenu.type === 'character' ? (
            <>
              <button
                type="button"
                className="w-full rounded px-3 py-2 text-left hover:bg-accent"
                onClick={() => {
                  closeContextMenu()
                  handleCharacterClick(contextMenu.character.id)
                }}
              >
                Open chat
              </button>
              <button
                type="button"
                className="w-full rounded px-3 py-2 text-left hover:bg-accent"
                onClick={() => {
                  closeContextMenu()
                  navigate('/character')
                }}
              >
                Manage character
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="w-full rounded px-3 py-2 text-left hover:bg-accent"
                onClick={() => {
                  closeContextMenu()
                  handleOpenChat(contextMenu.chat.id)
                }}
              >
                Open chat
              </button>
              {contextMenu.character && (
                <button
                  type="button"
                  className="w-full rounded px-3 py-2 text-left hover:bg-accent"
                  onClick={() => {
                    const characterId = contextMenu.character?.id
                    closeContextMenu()
                    if (characterId) handleCharacterClick(characterId)
                  }}
                >
                  Open character chat
                </button>
              )}
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-accent"
                onClick={() => {
                  closeContextMenu()
                  setSaveTarget(contextMenu.chat)
                }}
              >
                <Save className="h-4 w-4" />
                存档
              </button>
              <button
                type="button"
                className="w-full rounded px-3 py-2 text-left text-destructive hover:bg-destructive/10"
                onClick={() => {
                  closeContextMenu()
                  setDeleteTarget(contextMenu.chat)
                }}
              >
                Delete chat
              </button>
            </>
          )}
        </div>
      )}

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Chat</DialogTitle>
            <DialogDescription>
              Delete "{deleteTarget?.title}"? This will also remove all messages in this conversation. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!saveTarget} onOpenChange={closeSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建存档点</DialogTitle>
            <DialogDescription>
              为 "{saveTarget?.title}" 保存当前消息快照。名字可以留空，系统会自动生成。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={savepointName}
              onChange={(event) => setSavepointName(event.target.value)}
              placeholder={createDefaultSavepointName()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeSaveDialog}>Cancel</Button>
            <Button onClick={handleCreateSavepoint} disabled={savingSavepoint}>
              {savingSavepoint ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
