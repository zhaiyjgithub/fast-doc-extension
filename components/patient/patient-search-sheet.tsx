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
  gender?: 'Male' | 'Female' | 'Other'
  idNumber?: string
}

interface PatientSearchSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (patient: Patient) => void
}

const MOCK_PATIENTS: Patient[] = [
  { id: '1', name: 'James Wilson', dob: '1985-03-12', gender: 'Male', idNumber: 'MRN-100842' },
  { id: '2', name: 'Sarah Chen', dob: '1992-07-25', gender: 'Female', idNumber: 'MRN-100903' },
  { id: '3', name: 'Emily Rodriguez', dob: '1978-11-03', gender: 'Female', idNumber: 'MRN-100721' },
  { id: '4', name: 'Michael Torres', dob: '2001-01-18', gender: 'Male', idNumber: 'MRN-101012' },
  { id: '5', name: 'Lisa Park', dob: '1965-09-30', gender: 'Female', idNumber: 'MRN-100655' },
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
          <SheetTitle>Select patient</SheetTitle>
        </SheetHeader>
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or MRN"
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
                No patients found
              </p>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
