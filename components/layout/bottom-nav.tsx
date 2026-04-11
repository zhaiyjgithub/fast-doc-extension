import * as React from 'react'
import { cn } from '@/lib/utils'

export interface NavTab {
  id: string
  label: string
  icon: React.ReactNode
}

interface BottomNavProps {
  tabs: NavTab[]
  value: string
  onChange: (id: string) => void
  className?: string
}

export function BottomNav({ tabs, value, onChange, className }: BottomNavProps) {
  return (
    <nav
      className={cn(
        'flex h-14 w-full shrink-0 items-center justify-around rounded-t-2xl border-t border-border/40 bg-background/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur-md dark:shadow-[0_-4px_12px_rgba(0,0,0,0.2)]',
        className,
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            'relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold transition-colors duration-200',
            value === tab.id
              ? 'text-foreground after:absolute after:-bottom-0.5 after:left-1/2 after:h-1 after:w-8 after:-translate-x-1/2 after:rounded-full after:bg-primary'
              : 'text-muted-foreground hover:text-primary',
          )}
        >
          <span className="[&_svg]:size-6">{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
