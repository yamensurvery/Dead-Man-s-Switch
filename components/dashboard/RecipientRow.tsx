// components/dashboard/RecipientRow.tsx
interface RecipientRowProps {
  name: string
  deliveryMethod: string
  notifiedAt: string | null
}

export function RecipientRow({ name, deliveryMethod, notifiedAt }: RecipientRowProps) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/[0.02] border border-white/[0.06] px-4 py-3">
      <div>
        <p className="text-sm text-[#E8EAED]">{name}</p>
        <p className="text-xs text-[#6B7280] capitalize">{deliveryMethod}</p>
      </div>
      <span className="text-xs text-[#6B7280]">
        {notifiedAt ? `Notified ${new Date(notifiedAt).toLocaleDateString()}` : 'Not notified'}
      </span>
    </div>
  )
}