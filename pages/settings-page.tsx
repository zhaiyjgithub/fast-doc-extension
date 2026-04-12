import * as React from 'react'
import { motion, type Variants } from 'motion/react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Moon,
  Sun,
  User,
  Bell,
  Shield,
  LogOut,
  ChevronRight,
  Package,
  Mail,
} from 'lucide-react'

const APP_VERSION = '1.0.0'
const CONTACT_EMAIL = 'support@fastdoc.app'

const settingsPageListVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.055, delayChildren: 0.04 },
  },
}

const settingsPageItemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
  },
}

interface SettingsPageProps {
  isDark: boolean
  onToggleDark: (val: boolean) => void
  onLogout: () => void
  username?: string
  /** Opens full provider profile (demo). */
  onOpenProvider?: () => void
}

interface SettingsRowProps {
  icon: React.ReactNode
  label: string
  description?: string
  children?: React.ReactNode
  onClick?: () => void
}

function SettingsRow({ icon, label, description, children, onClick }: SettingsRowProps) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-accent"
      onClick={onClick}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </Tag>
  )
}

export function SettingsPage({
  isDark,
  onToggleDark,
  onLogout,
  username = 'Physician',
  onOpenProvider,
}: SettingsPageProps) {
  return (
    <ScrollArea className="h-full">
      <motion.div
        className="space-y-5 px-4 py-4"
        variants={settingsPageListVariants}
        initial="hidden"
        animate="show"
      >
        <motion.div
          variants={settingsPageItemVariants}
          className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"
        >
          <Avatar className="h-14 w-14">
            <AvatarFallback className="text-lg font-semibold">
              {username.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">{username}</p>
            <Badge variant="secondary" className="mt-1 text-xs">
              Attending physician
            </Badge>
          </div>
        </motion.div>

        <motion.section variants={settingsPageItemVariants} className="space-y-1">
          <h3 className="px-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Account
          </h3>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <SettingsRow
              icon={<User className="h-4 w-4" />}
              label="Profile"
              description="Provider details"
              onClick={() => onOpenProvider?.()}
            >
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </SettingsRow>
          </div>
        </motion.section>

        <motion.div variants={settingsPageItemVariants}>
          <Separator />
        </motion.div>

        <motion.section variants={settingsPageItemVariants} className="space-y-1">
          <h3 className="px-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            General
          </h3>
          <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border">
            <SettingsRow
              icon={<Bell className="h-4 w-4" />}
              label="Notifications"
              description="Push and alerts"
              onClick={() => {}}
            >
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </SettingsRow>
            <SettingsRow
              icon={<Shield className="h-4 w-4" />}
              label="Privacy Policy"
              onClick={() => {}}
            >
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </SettingsRow>
            <SettingsRow
              icon={<Shield className="h-4 w-4" />}
              label="Terms of Service"
              onClick={() => {}}
            >
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </SettingsRow>
            <SettingsRow
              icon={<Package className="h-4 w-4" />}
              label="App version"
            >
              <span className="text-xs tabular-nums text-muted-foreground">
                v{APP_VERSION}
              </span>
            </SettingsRow>
          </div>
        </motion.section>

        <motion.div variants={settingsPageItemVariants}>
          <Separator />
        </motion.div>

        <motion.section variants={settingsPageItemVariants} className="space-y-1">
          <h3 className="px-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Appearance
          </h3>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <SettingsRow
              icon={isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              label="Dark mode"
              description={isDark ? 'Currently: dark' : 'Currently: light'}
            >
              <Switch
                id="dark-mode"
                checked={isDark}
                onCheckedChange={onToggleDark}
              />
            </SettingsRow>
          </div>
        </motion.section>

        <motion.div variants={settingsPageItemVariants}>
          <Separator />
        </motion.div>

        <motion.section variants={settingsPageItemVariants} className="space-y-1">
          <h3 className="px-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Contact
          </h3>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <SettingsRow
              icon={<Mail className="h-4 w-4" />}
              label="Support email"
              description={CONTACT_EMAIL}
              onClick={() => {
                window.location.href = `mailto:${CONTACT_EMAIL}`
              }}
            >
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </SettingsRow>
          </div>
        </motion.section>

        <motion.div variants={settingsPageItemVariants}>
          <Button
            variant="outline"
            className="w-full gap-2 text-destructive hover:text-destructive"
            onClick={onLogout}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </motion.div>
      </motion.div>
    </ScrollArea>
  )
}
