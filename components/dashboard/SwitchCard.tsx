// components/dashboard/SwitchCard.tsx
import Link from 'next/link'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import type { SwitchStatus } from '@/lib/types'


interface SwitchCardProps {
  id: string
  label: string
  status: SwitchStatus
  nextDeadlineAt: string | null
  recipientCount: number
}

const EDGE_COLOR: Record<SwitchStatus, string> = {
  active: 'before:bg-[#2A3038]',
  grace_period: 'before:bg-[#FBBF24]',
  triggered: 'before:bg-[#F87171]',
  paused: 'before:bg-[#2A3038]',
  cancelled: 'before:bg-[#2A3038]',
}

function daysRemainingLabel(nextDeadlineAt: string | null): string {
  if (!nextDeadlineAt) return 'No deadline'

  const deadline = new Date(nextDeadlineAt).getTime()
  const now = Date.now()
  const diffMs = deadline - now
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return 'Overdue'
  if (diffDays === 0) return 'Due today'
  if (diffDays === 1) return '1 day left'
  return `${diffDays} days left`
}

export function SwitchCard({ id, label, status, nextDeadlineAt, recipientCount }: SwitchCardProps) {
  return (
    <Link
      href={`/dashboard/switches/${id}`}
      className={`
        relative flex items-center justify-between gap-4 rounded-xl
        bg-white/[0.02] border border-white/[0.06] pl-6 pr-5 py-4
        hover:bg-white/[0.04] hover:border-white/[0.1] transition-colors
        before:absolute before:left-0 before:top-0 before:h-full before:w-[3px]
        before:rounded-l-xl ${EDGE_COLOR[status]}
      `}
    >
      <div className="min-w-0">
        <p className="text-[15px] font-medium text-[#E8EAED] truncate">{label}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <StatusBadge status={status} />
          <span className="text-xs text-[#6B7280]">
            {recipientCount} {recipientCount === 1 ? 'recipient' : 'recipients'}
          </span>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm font-medium text-[#E8EAED]">
          {daysRemainingLabel(nextDeadlineAt)}
        </p>
      </div>
    </Link>
  )
}