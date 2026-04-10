import * as React from 'react'
import { cn } from '@/lib/utils'

interface AppShellProps {
  children: React.ReactNode
  className?: string
}

export function AppShell({ children, className }: AppShellProps) {
  return (
    <div className={cn('flex h-screen w-full flex-col overflow-hidden bg-background', className)}>
      {children}
    </div>
  )
}
