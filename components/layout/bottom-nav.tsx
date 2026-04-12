import * as React from 'react'
import { motion } from 'motion/react'
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

const navBarVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] },
  },
}

const tabStagger = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.04, delayChildren: 0.06 },
  },
}

const tabItemVariants = {
  hidden: { opacity: 0, y: 6 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] },
  },
}

export function BottomNav({ tabs, value, onChange, className }: BottomNavProps) {
  return (
    <motion.nav
      className={cn(
        'mx-auto mb-2 flex h-14 w-[calc(100%-1.5rem)] max-w-full shrink-0 items-center justify-around rounded-2xl border border-border/50 bg-background/95 shadow-[0_2px_16px_rgba(0,0,0,0.06)] backdrop-blur-md dark:border-border/60 dark:bg-background/90 dark:shadow-[0_2px_20px_rgba(0,0,0,0.28)]',
        'pb-[calc(0.35rem+env(safe-area-inset-bottom))] pt-0.5',
        className,
      )}
      variants={navBarVariants}
      initial="hidden"
      animate="show"
    >
      <motion.div
        className="flex h-full w-full items-center justify-around"
        variants={tabStagger}
        initial="hidden"
        animate="show"
      >
        {tabs.map((tab) => {
          const active = value === tab.id
          return (
            <motion.button
              key={tab.id}
              type="button"
              variants={tabItemVariants}
              onClick={() => onChange(tab.id)}
              whileTap={{ scale: 0.94 }}
              whileHover={{ scale: active ? 1 : 1.02 }}
              transition={{ type: 'spring', stiffness: 520, damping: 28 }}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold',
                active ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              <motion.span
                className="[&_svg]:size-6"
                animate={{
                  scale: active ? 1.06 : 1,
                  opacity: active ? 1 : 0.85,
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              >
                {tab.icon}
              </motion.span>
              <span>{tab.label}</span>
              {active ? (
                <motion.span
                  layoutId="bottom-nav-active-indicator"
                  className="pointer-events-none absolute bottom-1 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-primary"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              ) : null}
            </motion.button>
          )
        })}
      </motion.div>
    </motion.nav>
  )
}
