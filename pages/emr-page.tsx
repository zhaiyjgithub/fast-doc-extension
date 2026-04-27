import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Wand2, Copy, Check, Pencil, Eye } from 'lucide-react'

interface EMRField {
  key: string
  label: string
  value: string
}

const INITIAL_EMR: EMRField[] = [
  { key: 'chiefComplaint', label: 'Chief complaint', value: '' },
  { key: 'presentIllness', label: 'History of present illness', value: '' },
  { key: 'pastHistory', label: 'Past medical history', value: '' },
  { key: 'physicalExam', label: 'Physical examination', value: '' },
  { key: 'diagnosis', label: 'Diagnosis', value: '' },
  { key: 'treatment', label: 'Plan / treatment', value: '' },
]

const AI_GENERATED: EMRField[] = [
  { key: 'chiefComplaint', label: 'Chief complaint', value: 'Headache and fever for 3 days' },
  {
    key: 'presentIllness',
    label: 'History of present illness',
    value:
      'Three days ago the patient developed headache, predominantly frontal, constant and throbbing, with fever up to 38.5°C. No chills or rigors, no cough or rhinorrhea, no nausea or vomiting. Ibuprofen temporarily reduced temperature.',
  },
  {
    key: 'pastHistory',
    label: 'Past medical history',
    value:
      'Hypertension for 5 years, on medication with good control. Denies diabetes, coronary disease, or other chronic conditions.',
  },
  {
    key: 'physicalExam',
    label: 'Physical examination',
    value:
      'T 38.2°C, BP 135/85 mmHg, HR 88, RR 18. Alert and oriented. Mild pharyngeal erythema; tonsils not enlarged. Lungs clear bilaterally. Regular cardiac rhythm. Abdomen soft, non-tender.',
  },
  {
    key: 'diagnosis',
    label: 'Diagnosis',
    value: '1. Upper respiratory infection\n2. Hypertension, stage 1, low risk',
  },
  {
    key: 'treatment',
    label: 'Plan / treatment',
    value:
      '1. Acetaminophen 500 mg PO PRN for fever\n2. Increase fluid intake and rest\n3. Continue current antihypertensive regimen; monitor BP\n4. Follow up in 3 days; seek care sooner if symptoms worsen',
  },
]

interface EMRPageProps {
  patientId?: string
}

export function EMRPage({ patientId: _patientId }: EMRPageProps) {
  const [fields, setFields] = React.useState<EMRField[]>(INITIAL_EMR)
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [hasGenerated, setHasGenerated] = React.useState(false)
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null)
  const [activeTab, setActiveTab] = React.useState('edit')

  function handleGenerate() {
    setIsGenerating(true)
    setTimeout(() => {
      setFields(AI_GENERATED)
      setIsGenerating(false)
      setHasGenerated(true)
      setActiveTab('preview')
    }, 2000)
  }

  function handleFieldChange(key: string, value: string) {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, value } : f)))
  }

  async function handleCopy(key: string, value: string) {
    await navigator.clipboard.writeText(value)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  return (
    <div className="flex h-full flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
          <TabsList>
            <TabsTrigger value="edit" className="gap-1.5">
              <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Edit
            </TabsTrigger>
            <TabsTrigger value="preview" className="gap-1.5">
              <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Preview
            </TabsTrigger>
          </TabsList>
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="gap-1.5"
          >
            <Wand2 className="h-3.5 w-3.5" />
            {isGenerating ? 'Generating…' : 'AI generate'}
          </Button>
        </div>

        <TabsContent value="edit" className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="space-y-4 px-4 py-3">
              {isGenerating
                ? INITIAL_EMR.map((f) => (
                    <div key={f.key} className="space-y-1">
                      <Skeleton className="h-4 w-16 rounded" />
                      <Skeleton className="h-20 rounded-md" />
                    </div>
                  ))
                : fields.map((field) => (
                    <div key={field.key} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          {field.label}
                        </span>
                        {field.value && (
                          <button
                            onClick={() => handleCopy(field.key, field.value)}
                            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {copiedKey === field.key ? (
                              <Check className="h-3 w-3 text-primary" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            {copiedKey === field.key ? 'Copied' : 'Copy'}
                          </button>
                        )}
                      </div>
                      <Textarea
                        value={field.value}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        placeholder={`Enter ${field.label.toLowerCase()}…`}
                        className="min-h-[80px] resize-none"
                      />
                    </div>
                  ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="preview" className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="space-y-3 px-4 py-3">
              {!hasGenerated && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {'Tap "AI generate" to auto-fill the note'}
                </p>
              )}
              {fields
                .filter((f) => f.value)
                .map((field) => (
                  <div key={field.key} className="rounded-lg border border-border bg-card p-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <Badge variant="secondary" className="text-xs">
                        {field.label}
                      </Badge>
                      <button
                        onClick={() => handleCopy(field.key, field.value)}
                        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {copiedKey === field.key ? (
                          <Check className="h-3 w-3 text-primary" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{field.value}</p>
                  </div>
                ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}
