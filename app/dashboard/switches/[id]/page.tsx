// app/dashboard/switches/[id]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { RecipientRow } from '@/components/dashboard/RecipientRow'
import { CheckInButton } from '@/components/dashboard/CheckInButton'

export default async function SwitchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: switchData, error: switchError } = await supabase
    .from('switches')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (switchError || !switchData) notFound()

  const { data: recipients, error: recipientsError } = await supabase
    .from('recipients')
    .select('id, name, delivery_method, notified_at')
    .eq('switch_id', id)

  const { data: files, error: filesError } = await supabase
    .from('encrypted_files')
    .select('id, file_name, file_size, created_at')
    .eq('switch_id', id)

  if (recipientsError) console.error('Failed to load recipients:', recipientsError)
  if (filesError) console.error('Failed to load files:', filesError)

  return (
    <div className="min-h-screen bg-[#0B0E14]">
      <header className="border-b border-white/[0.06]">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <Link
            href="/dashboard"
            className="text-sm text-[#6B7280] hover:text-[#9CA3AF] transition-colors"
          >
            ← Back to switches
          </Link>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-[#E8EAED] tracking-tight">
                {switchData.label}
                </h1>
                <StatusBadge status={switchData.status} />
            </div>
            {switchData.status !== 'triggered' && switchData.status !== 'cancelled' && (
                <CheckInButton switchId={switchData.id} />
            )}
            </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10 flex flex-col gap-8">
        <Section title="Overview">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Check-in interval" value={`${switchData.check_in_interval_days} days`} />
            <Field label="Grace period" value={`${switchData.grace_period_days} days`} />
            <Field
              label="Last checked in"
              value={formatDate(switchData.last_checked_in_at)}
            />
            <Field
              label="Next deadline"
              value={formatDate(switchData.next_deadline_at)}
            />
            <Field
              label="Threshold"
              value={`${switchData.threshold} of ${recipients?.length ?? 0} recipients`}
            />
            {switchData.triggered_at && (
              <Field label="Triggered at" value={formatDate(switchData.triggered_at)} />
            )}
          </dl>
        </Section>

        <Section title={`Recipients (${recipients?.length ?? 0})`}>
          {recipients && recipients.length > 0 ? (
            <div className="flex flex-col gap-2">
              {recipients.map((r) => (
                <RecipientRow
                  key={r.id}
                  name={r.name}
                  deliveryMethod={r.delivery_method}
                  notifiedAt={r.notified_at}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#6B7280]">No recipients configured.</p>
          )}
        </Section>

        <Section title={`Files (${files?.length ?? 0})`}>
          {files && files.length > 0 ? (
            <div className="flex flex-col gap-2">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between rounded-lg bg-white/[0.02] border border-white/[0.06] px-4 py-3"
                >
                  <span className="text-sm text-[#E8EAED] truncate">{f.file_name}</span>
                  <span className="text-xs text-[#6B7280] shrink-0 ml-4">
                    {formatFileSize(f.file_size)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[#6B7280]">No files attached.</p>
          )}
        </Section>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-medium text-[#9CA3AF] uppercase tracking-wide mb-3">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[#6B7280]">{label}</dt>
      <dd className="mt-0.5 text-sm text-[#E8EAED]">{value}</dd>
    </div>
  )
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}