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
        'flex h-16 w-full shrink-0 items-center justify-around border-t border-border bg-background',
        className,
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs transition-colors',
            value === tab.id
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
