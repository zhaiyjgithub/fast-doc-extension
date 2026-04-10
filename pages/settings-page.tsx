import * as React from 'react'
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
  Globe,
  Shield,
  LogOut,
  ChevronRight,
} from 'lucide-react'

interface SettingsPageProps {
  isDark: boolean
  onToggleDark: (val: boolean) => void
  onLogout: () => void
  username?: string
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
}: SettingsPageProps) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 px-4 py-4">
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
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
        </div>

        <section className="space-y-1">
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
        </section>

        <Separator />

        <section className="space-y-1">
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
              icon={<Globe className="h-4 w-4" />}
              label="Language"
              description="English (US)"
              onClick={() => {}}
            >
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </SettingsRow>
            <SettingsRow
              icon={<Shield className="h-4 w-4" />}
              label="Privacy & security"
              onClick={() => {}}
            >
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </SettingsRow>
          </div>
        </section>

        <Separator />

        <section className="space-y-1">
          <h3 className="px-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Account
          </h3>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <SettingsRow
              icon={<User className="h-4 w-4" />}
              label="Profile"
              onClick={() => {}}
            >
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </SettingsRow>
          </div>
        </section>

        <Button
          variant="outline"
          className="w-full gap-2 text-destructive hover:text-destructive"
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>

        <p className="pb-2 text-center text-xs text-muted-foreground">FastDoc v1.0.0</p>
      </div>
    </ScrollArea>
  )
}
