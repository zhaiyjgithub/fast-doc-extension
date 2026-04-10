import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Plus, FileText } from 'lucide-react'
import { format } from 'date-fns'

interface Note {
  id: string
  content: string
  createdAt: Date
  type: '主诉' | '病史' | '查体' | '诊断' | '医嘱'
}

interface NotesPageProps {
  patientId?: string
}

const MOCK_NOTES: Note[] = [
  {
    id: '1',
    content: '患者主诉头痛、发热3天，体温最高38.5°C，无咳嗽。',
    createdAt: new Date(Date.now() - 1000 * 60 * 30),
    type: '主诉',
  },
  {
    id: '2',
    content: '既往高血压病史5年，规律服用氨氯地平5mg，血压控制良好。',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    type: '病史',
  },
]

const NOTE_TYPES: Note['type'][] = ['主诉', '病史', '查体', '诊断', '医嘱']

export function NotesPage({ patientId: _patientId }: NotesPageProps) {
  const [notes, setNotes] = React.useState<Note[]>(MOCK_NOTES)
  const [draft, setDraft] = React.useState('')
  const [draftType, setDraftType] = React.useState<Note['type']>('主诉')
  const [activeTab, setActiveTab] = React.useState('list')

  function handleAddNote() {
    if (!draft.trim()) return
    const newNote: Note = {
      id: Date.now().toString(),
      content: draft.trim(),
      createdAt: new Date(),
      type: draftType,
    }
    setNotes((prev) => [newNote, ...prev])
    setDraft('')
    setActiveTab('list')
  }

  return (
    <div className="flex h-full flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
        <TabsList className="shrink-0 px-4">
          <TabsTrigger value="list">笔记列表</TabsTrigger>
          <TabsTrigger value="new">新建笔记</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="space-y-2 px-4 py-3">
              {notes.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                  <FileText className="h-8 w-8" />
                  <p className="text-sm">暂无笔记</p>
                </div>
              )}
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-lg border border-border bg-card p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">{note.type}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {format(note.createdAt, 'MM-dd HH:mm')}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed">{note.content}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="new" className="flex-1 overflow-hidden">
          <div className="flex h-full flex-col gap-3 px-4 py-3">
            <div className="flex flex-wrap gap-1.5">
              {NOTE_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => setDraftType(type)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    draftType === type
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
            <Textarea
              placeholder="输入笔记内容…"
              className="flex-1 resize-none"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button onClick={handleAddNote} disabled={!draft.trim()} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              添加笔记
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
