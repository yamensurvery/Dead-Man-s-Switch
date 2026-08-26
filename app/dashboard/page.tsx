// app/dashboard/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { SwitchCard } from '@/components/dashboard/SwitchCard'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: switches, error } = await supabase
    .from('switches')
    .select('id, label, status, next_deadline_at, threshold, recipients(count)')
    .eq('user_id', user.id)
    .order('next_deadline_at', { ascending: true })

  if (error) {
    console.error('Failed to load switches:', error)
  }

  const hasSwitches = switches && switches.length > 0

  return (
    <div className="min-h-screen bg-[#0B0E14]">
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto max-w-4xl px-6 py-8 flex items-center justify-between">
          <div>
            <p className="text-[13px] font-medium tracking-wide text-[#6B7280] uppercase">
              Signed in as {user.email}
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-[#E8EAED] tracking-tight">
              Your switches
            </h1>
          </div>
          <Link
            href="/dashboard/switches/new"
            className="rounded-lg bg-[#E8EAED] px-4 py-2.5 text-sm font-medium text-[#0B0E14] hover:bg-white transition-colors"
          >
            New switch
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        {hasSwitches ? (
          <div className="flex flex-col gap-3">
            {switches.map((s) => (
              <SwitchCard
                key={s.id}
                id={s.id}
                label={s.label}
                status={s.status}
                nextDeadlineAt={s.next_deadline_at}
                recipientCount={s.recipients?.[0]?.count ?? 0}
              />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-white/[0.08] px-8 py-16 text-center">
      <h2 className="text-lg font-medium text-[#E8EAED]">Nothing is being watched yet</h2>
      <p className="mt-2 text-sm text-[#6B7280] max-w-sm mx-auto">
        Create a switch to start protecting a message or file behind a check-in schedule.
      </p>
      <Link
        href="/dashboard/switches/new"
        className="mt-6 inline-block rounded-lg bg-[#E8EAED] px-4 py-2.5 text-sm font-medium text-[#0B0E14] hover:bg-white transition-colors"
      >
        Create your first switch
      </Link>
    </div>
  )
}