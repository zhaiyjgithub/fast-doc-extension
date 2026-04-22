import { differenceInYears, format, isValid, parseISO } from 'date-fns'
import { motion, type Variants } from 'motion/react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { avatarFallbackClassForName } from '@/lib/avatar-fallback-by-name'
import type { Patient } from '@/components/patient/patient-search-sheet'
import { cn } from '@/lib/utils'

const pageListVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.055, delayChildren: 0.04 },
  },
}

const pageItemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
  },
}

function initialsFromDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const a = parts[0]?.[0]
    const b = parts[parts.length - 1]?.[0]
    if (a && b) return (a + b).toUpperCase()
  }
  const one = parts[0] ?? name.trim()
  if (one.length >= 2) return one.slice(0, 2).toUpperCase()
  return (one[0] ?? '?').toUpperCase()
}

function formatDobDisplay(value: string): string {
  const parsed = parseISO(value)
  if (!isValid(parsed)) return value
  return format(parsed, 'MM/dd/yyyy')
}

function ageFromDob(value: string): string | null {
  const parsed = parseISO(value)
  if (!isValid(parsed)) return null
  const age = differenceInYears(new Date(), parsed)
  if (!Number.isFinite(age) || age < 0) return null
  return `${age}y`
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <p className="wrap-break-word text-sm font-medium text-foreground">{value?.trim() || '—'}</p>
    </div>
  )
}

export function PatientDetailsPage({ patient }: { patient: Patient }) {
  const name = `${patient.firstName} ${patient.lastName}`.trim() || 'Unknown patient'
  const patientId = patient.clinicPatientId?.trim() || patient.mrn?.trim() || patient.id
  const dob = patient.dateOfBirth?.trim() ? formatDobDisplay(patient.dateOfBirth) : null
  const age = patient.dateOfBirth?.trim() ? ageFromDob(patient.dateOfBirth) : null

  return (
    <ScrollArea className="h-full min-h-0 bg-background">
      <motion.div
        className="space-y-5 px-4 py-4 pb-24"
        variants={pageListVariants}
        initial="hidden"
        animate="show"
      >
        <motion.div
          variants={pageItemVariants}
          className="flex flex-col items-center gap-4 rounded-2xl border border-border/70 bg-card p-6 shadow-sm ring-1 ring-border/25"
        >
          <Avatar className="size-20 rounded-full ring-2 ring-border/40">
            <AvatarFallback
              className={cn('text-lg font-semibold', avatarFallbackClassForName(name))}
            >
              {initialsFromDisplayName(name)}
            </AvatarFallback>
          </Avatar>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight text-foreground">{name}</h1>
            <p className="mt-1 text-sm font-medium text-foreground/70">
              {[dob ? `DOB: ${dob}` : null, age, patient.gender ?? null].filter(Boolean).join(' · ') || '—'}
            </p>
            <p className="mt-1 text-xs font-medium text-muted-foreground">Patient ID: {patientId}</p>
          </div>
        </motion.div>

        <motion.section
          variants={pageItemVariants}
          className="space-y-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm ring-1 ring-border/25"
        >
          <h2 className="border-b border-border/50 pb-2 text-xs font-bold uppercase tracking-widest text-foreground/75">
            Patient Profile
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" value={patient.firstName} />
            <Field label="Last name" value={patient.lastName} />
            <Field label="Gender" value={patient.gender ?? null} />
            <Field label="Date of birth" value={dob} />
            <Field label="Primary language" value={patient.primaryLanguage ?? null} />
            <Field label="Clinic patient ID" value={patient.clinicPatientId ?? null} />
            <Field label="MRN" value={patient.mrn ?? null} />
            <Field label="Clinic name" value={patient.clinicName ?? null} />
            <Field label="Clinic ID" value={patient.clinicId ?? null} />
            <Field label="Division ID" value={patient.divisionId ?? null} />
            <Field label="Clinic system" value={patient.clinicSystem ?? null} />
          </div>
        </motion.section>

        <motion.section
          variants={pageItemVariants}
          className="space-y-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm ring-1 ring-border/25"
        >
          <h2 className="border-b border-border/50 pb-2 text-xs font-bold uppercase tracking-widest text-foreground/75">
            Demographics
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone" value={patient.demographics?.phone ?? null} />
            <Field label="Email" value={patient.demographics?.email ?? null} />
            <Field label="Address" value={patient.demographics?.addressLine1 ?? null} />
            <Field label="City" value={patient.demographics?.city ?? null} />
            <Field label="State" value={patient.demographics?.state ?? null} />
            <Field label="ZIP code" value={patient.demographics?.zipCode ?? null} />
            <Field label="Country" value={patient.demographics?.country ?? null} />
          </div>
        </motion.section>
      </motion.div>
    </ScrollArea>
  )
}
