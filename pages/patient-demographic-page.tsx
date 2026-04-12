import * as React from 'react'
import { format, parseISO, isValid } from 'date-fns'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { motion, type Variants } from 'motion/react'
import { avatarFallbackClassForName } from '@/lib/avatar-fallback-by-name'
import type { PatientDemographic } from '@/lib/patient-demographic'
import { cn } from '@/lib/utils'

/** Aligned with `soap-page.tsx` list / item motion. */
const demographicPageListVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.055, delayChildren: 0.04 },
  },
}

const demographicPageItemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
  },
}

function formatDobDisplay(iso: string): string {
  const d = parseISO(iso)
  return isValid(d) ? format(d, 'MM/dd/yyyy') : iso
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <p className="text-sm font-medium text-foreground">{value || '—'}</p>
    </div>
  )
}

export function PatientDemographicPage({ demographic }: { demographic: PatientDemographic }) {
  const d = demographic

  return (
    <ScrollArea className="h-full min-h-0">
      <motion.div
        className="space-y-6 px-4 py-4 pb-24"
        variants={demographicPageListVariants}
        initial="hidden"
        animate="show"
      >
        <motion.div
          variants={demographicPageItemVariants}
          className="flex flex-col items-center gap-3 border-b border-border/60 pb-6"
        >
          <Avatar className="size-20 rounded-full">
            <AvatarFallback
              className={cn('text-lg font-semibold', avatarFallbackClassForName(d.displayName))}
            >
              {d.initials}
            </AvatarFallback>
          </Avatar>
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">{d.displayName}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              DOB {formatDobDisplay(d.dobIso)} · {d.gender}
            </p>
          </div>
        </motion.div>

        <motion.section variants={demographicPageItemVariants} className="space-y-4">
          <h2 className="text-sm font-bold text-foreground">Demographics</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" value={d.firstName} />
            <Field label="Last name" value={d.lastName} />
            <Field label="Gender" value={d.gender} />
            <Field label="Date of birth" value={formatDobDisplay(d.dobIso)} />
            <Field label="Mobile phone" value={d.mobilePhone} />
            <Field label="Email" value={d.email} />
          </div>
        </motion.section>

        <motion.section variants={demographicPageItemVariants} className="space-y-4">
          <h2 className="text-sm font-bold text-foreground">Address</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Address" value={d.address} />
            <Field label="City" value={d.city} />
            <Field label="State" value={d.state} />
            <Field label="ZIP code" value={d.zipCode} />
          </div>
        </motion.section>

        <motion.section variants={demographicPageItemVariants} className="space-y-4">
          <h2 className="text-sm font-bold text-foreground">Insurance</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Insurance ID" value={d.insuranceId} />
            <Field label="Insurance name" value={d.insuranceName} />
          </div>
        </motion.section>
      </motion.div>
    </ScrollArea>
  )
}
