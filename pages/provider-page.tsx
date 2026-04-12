import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { motion, type Variants } from 'motion/react'
import { avatarFallbackClassForName } from '@/lib/avatar-fallback-by-name'
import type { ProviderProfile } from '@/lib/mock-provider'
import { providerDisplayName, providerInitials } from '@/lib/mock-provider'
import { cn } from '@/lib/utils'

const providerPageListVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.055, delayChildren: 0.04 },
  },
}

const providerPageItemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
  },
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

export function ProviderPage({ provider }: { provider: ProviderProfile }) {
  const displayName = providerDisplayName(provider)
  const initials = providerInitials(provider)

  return (
    <ScrollArea className="h-full min-h-0 bg-background">
      <motion.div
        className="space-y-5 px-4 py-4 pb-24"
        variants={providerPageListVariants}
        initial="hidden"
        animate="show"
      >
        <motion.div
          variants={providerPageItemVariants}
          className="flex flex-col items-center gap-4 rounded-2xl border border-border/70 bg-card p-6 shadow-sm ring-1 ring-border/25"
        >
          <Avatar className="size-20 rounded-full ring-2 ring-border/40">
            <AvatarFallback
              className={cn('text-lg font-semibold', avatarFallbackClassForName(displayName))}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight text-foreground">{displayName}</h1>
            <p className="mt-1 text-sm font-medium text-foreground/70">{provider.specialty}</p>
          </div>
        </motion.div>

        <motion.section
          variants={providerPageItemVariants}
          className="space-y-3 rounded-2xl border border-border/70 bg-card p-4 shadow-sm ring-1 ring-border/25"
        >
          <h2 className="border-b border-border/50 pb-2 text-xs font-bold uppercase tracking-widest text-foreground/75">
            Details
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" value={provider.firstName} />
            <Field label="Last name" value={provider.lastName} />
            <Field label="Specialty" value={provider.specialty} />
            <Field label="Email" value={provider.email} />
            <Field label="Clinic name" value={provider.clinicName} />
            <Field label="Site label" value={provider.siteLabel} />
          </div>
        </motion.section>
      </motion.div>
    </ScrollArea>
  )
}
