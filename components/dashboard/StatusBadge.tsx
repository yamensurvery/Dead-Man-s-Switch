// components/dashboard/StatusBadge.tsx
import type { SwitchStatus } from '@/lib/types'

const STATUS_CONFIG: Record<
  SwitchStatus,
  { text: string; dot: string; badgeText: string; badgeBg: string }
> = {
  active: {
    text: 'Active',
    dot: 'bg-[#4ADE80]',
    badgeText: 'text-[#4ADE80]',
    badgeBg: 'bg-[#4ADE80]/10',
  },
  grace_period: {
    text: 'Grace period',
    dot: 'bg-[#FBBF24]',
    badgeText: 'text-[#FBBF24]',
    badgeBg: 'bg-[#FBBF24]/10',
  },
  triggered: {
    text: 'Triggered',
    dot: 'bg-[#F87171]',
    badgeText: 'text-[#F87171]',
    badgeBg: 'bg-[#F87171]/10',
  },
  paused: {
    text: 'Paused',
    dot: 'bg-[#6B7280]',
    badgeText: 'text-[#9CA3AF]',
    badgeBg: 'bg-white/[0.06]',
  },
  cancelled: {
    text: 'Cancelled',
    dot: 'bg-[#6B7280]',
    badgeText: 'text-[#6B7280]',
    badgeBg: 'bg-white/[0.04]',
  },
}

export function StatusBadge({ status }: { status: SwitchStatus }) {
  const config = STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ${config.badgeBg} px-2.5 py-1 text-xs font-medium ${config.badgeText}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.text}
    </span>
  )
}