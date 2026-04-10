import * as React from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, User } from 'lucide-react'

export interface Patient {
  id: string
  name: string
  dob: string
  gender?: '男' | '女' | '其他'
  idNumber?: string
}

interface PatientSearchSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (patient: Patient) => void
}

const MOCK_PATIENTS: Patient[] = [
  { id: '1', name: '张伟', dob: '1985-03-12', gender: '男', idNumber: '110101198503120000' },
  { id: '2', name: '李娜', dob: '1992-07-25', gender: '女', idNumber: '310101199207250000' },
  { id: '3', name: '王芳', dob: '1978-11-03', gender: '女', idNumber: '440101197811030000' },
  { id: '4', name: '赵磊', dob: '2001-01-18', gender: '男', idNumber: '110101200101180000' },
  { id: '5', name: '陈静', dob: '1965-09-30', gender: '女', idNumber: '320101196509300000' },
]

export function PatientSearchSheet({
  open,
  onOpenChange,
  onSelect,
}: PatientSearchSheetProps) {
  const [query, setQuery] = React.useState('')
  const [isLoading] = React.useState(false)

  const filtered = MOCK_PATIENTS.filter(
    (p) =>
      p.name.includes(query) ||
      (p.idNumber ?? '').includes(query),
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl p-0">
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle>选择患者</SheetTitle>
        </SheetHeader>
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索姓名或身份证号"
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <ScrollArea className="h-[calc(70vh-130px)]">
          <div className="space-y-1 px-4 pb-4">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))
              : filtered.map((patient) => (
                  <button
                    key={patient.id}
                    onClick={() => {
                      onSelect(patient)
                      onOpenChange(false)
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-accent"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{patient.name}</p>
                      <p className="text-xs text-muted-foreground">
                        DOB: {patient.dob} · {patient.gender}
                      </p>
                    </div>
                  </button>
                ))}
            {!isLoading && filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                未找到患者
              </p>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
