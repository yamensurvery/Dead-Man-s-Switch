// components/dashboard/CheckInButton.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { checkIn } from '@/app/actions/switch'

export function CheckInButton({ switchId }: { switchId: string }) {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCheckIn() {
    setIsPending(true)
    setError(null)
    try {
      await checkIn(switchId)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check-in failed')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div>
      <button
        onClick={handleCheckIn}
        disabled={isPending}
        className="rounded-lg bg-[#4ADE80] px-4 py-2.5 text-sm font-medium text-[#0B0E14] hover:bg-[#3FCE74] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? 'Checking in…' : 'Check in now'}
      </button>
      {error && <p className="mt-2 text-sm text-[#F87171]">{error}</p>}
    </div>
  )
}