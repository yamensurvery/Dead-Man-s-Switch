import { requireAdmin } from '@/lib/auth/requireAdmin';

export default async function EmailTestLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return <>{children}</>;
}
