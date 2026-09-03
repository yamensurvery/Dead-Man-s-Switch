import { requireAdmin } from '@/lib/auth/requireAdmin';

export default async function WasmTestLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return <>{children}</>;
}
