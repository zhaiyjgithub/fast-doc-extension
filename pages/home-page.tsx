import * as React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PatientBanner } from '@/components/layout/patient-banner'
import { Mic, FileText, ClipboardList, ChevronRight, Clock } from 'lucide-react'
import type { Patient } from '@/components/patient/patient-search-sheet'

interface RecentRecord {
  id: string
  type: 'Recording' | 'Note' | 'EMR'
  title: string
  time: string
  status: 'Complete' | 'Draft' | 'Pending review'
}

interface HomePageProps {
  patient: Patient | null
  onChangePatient: () => void
  onNavigate: (page: 'recording' | 'notes' | 'emr') => void
}

const MOCK_RECORDS: RecentRecord[] = [
  { id: '1', type: 'Recording', title: 'Visit recording — James Wilson', time: '10 min ago', status: 'Complete' },
  { id: '2', type: 'Note', title: 'Follow-up — Sarah Chen', time: '1 hour ago', status: 'Draft' },
  { id: '3', type: 'EMR', title: 'Admission note — Emily Rodriguez', time: 'Yesterday', status: 'Pending review' },
]

const STATUS_VARIANT: Record<RecentRecord['status'], 'default' | 'secondary' | 'outline'> = {
  Complete: 'default',
  Draft: 'secondary',
  'Pending review': 'outline',
}

export function HomePage({ patient, onChangePatient, onNavigate }: HomePageProps) {
  return (
    <div className="flex h-full flex-col">
      {patient && (
        <PatientBanner
          name={patient.name}
          dob={patient.dob}
          onDismiss={onChangePatient}
        />
      )}
      <ScrollArea className="flex-1">
        <div className="space-y-5 px-4 py-4">
          <section className="space-y-2">
            <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Quick actions
            </h2>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => onNavigate('recording')}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm font-medium transition-colors hover:bg-accent"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Mic className="h-5 w-5 text-primary" />
                </div>
                Record
              </button>
              <button
                onClick={() => onNavigate('notes')}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm font-medium transition-colors hover:bg-accent"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                Notes
              </button>
              <button
                onClick={() => onNavigate('emr')}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm font-medium transition-colors hover:bg-accent"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <ClipboardList className="h-5 w-5 text-primary" />
                </div>
                EMR
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Recent activity
            </h2>
            <div className="space-y-2">
              {MOCK_RECORDS.map((record) => (
                <Card key={record.id} className="cursor-pointer transition-colors hover:bg-accent/50">
                  <CardContent className="flex items-center gap-3 p-3">
                    <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium">{record.title}</p>
                      <p className="text-xs text-muted-foreground">{record.time}</p>
                    </div>
                    <Badge variant={STATUS_VARIANT[record.status]}>{record.status}</Badge>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}
