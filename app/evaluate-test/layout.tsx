import { requireAdmin } from '@/lib/auth/requireAdmin';

export default async function EvaluateTestLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return <>{children}</>;
}
