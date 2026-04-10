import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Wand2, Copy, Check } from 'lucide-react'

interface EMRField {
  key: string
  label: string
  value: string
}

const INITIAL_EMR: EMRField[] = [
  { key: 'chiefComplaint', label: '主诉', value: '' },
  { key: 'presentIllness', label: '现病史', value: '' },
  { key: 'pastHistory', label: '既往史', value: '' },
  { key: 'physicalExam', label: '体格检查', value: '' },
  { key: 'diagnosis', label: '诊断', value: '' },
  { key: 'treatment', label: '处理意见', value: '' },
]

const AI_GENERATED: EMRField[] = [
  { key: 'chiefComplaint', label: '主诉', value: '头痛、发热3天' },
  { key: 'presentIllness', label: '现病史', value: '患者3天前无明显诱因出现头痛，以额部为主，呈持续性胀痛，伴发热，体温最高38.5°C，无畏寒、寒战，无咳嗽、流涕，无恶心、呕吐，自服布洛芬后体温可暂时下降。' },
  { key: 'pastHistory', label: '既往史', value: '高血压病史5年，规律服药，控制良好。否认糖尿病、冠心病等其他慢性病史。' },
  { key: 'physicalExam', label: '体格检查', value: '体温38.2°C，血压135/85mmHg，心率88次/分，呼吸18次/分。神志清楚，咽部轻度充血，扁桃体无肿大，双肺呼吸音清，心律齐，腹软无压痛。' },
  { key: 'diagnosis', label: '诊断', value: '1. 上呼吸道感染\n2. 高血压病（1级，低危）' },
  { key: 'treatment', label: '处理意见', value: '1. 对乙酰氨基酚0.5g 口服 必要时（发热时）\n2. 多饮水，注意休息\n3. 监测血压，继续原降压方案\n4. 3天后随访，如症状加重随时就诊' },
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
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, value } : f)),
    )
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
            <TabsTrigger value="edit">编辑</TabsTrigger>
            <TabsTrigger value="preview">预览</TabsTrigger>
          </TabsList>
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="gap-1.5"
          >
            <Wand2 className="h-3.5 w-3.5" />
            {isGenerating ? 'AI生成中…' : 'AI生成'}
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
                            {copiedKey === field.key ? '已复制' : '复制'}
                          </button>
                        )}
                      </div>
                      <Textarea
                        value={field.value}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        placeholder={`请输入${field.label}…`}
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
                  点击「AI生成」自动填写病历
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
