import { cn } from '@/lib/utils'

/** ICD / CPT pill colors aligned with AI EMR SOAP (`border-l-violet-500` ICD, `border-l-teal-500` CPT). */
const icdBadgeClass =
  'rounded-md bg-violet-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-violet-950 ring-1 ring-violet-500/25 dark:bg-violet-950/50 dark:text-violet-100 dark:ring-violet-400/30'

const cptBadgeClass =
  'rounded-md bg-teal-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-teal-950 ring-1 ring-teal-500/25 dark:bg-teal-950/50 dark:text-teal-100 dark:ring-teal-400/30'

export function EncounterCodeBadges({
  icdCodes,
  cptCodes,
  className,
}: {
  icdCodes: string[]
  cptCodes: string[]
  className?: string
}) {
  return (
    <div className={cn('mt-2 space-y-1.5', className)}>
      <div className="flex flex-wrap gap-1" aria-label="ICD codes">
        {icdCodes.map((code) => (
          <span key={`icd-${code}`} className={icdBadgeClass}>
            {code}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-1" aria-label="CPT codes">
        {cptCodes.map((code) => (
          <span key={`cpt-${code}`} className={cptBadgeClass}>
            {code}
          </span>
        ))}
      </div>
    </div>
  )
}
