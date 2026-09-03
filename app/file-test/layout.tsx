import { requireAdmin } from '@/lib/auth/requireAdmin';

export default async function FileTestLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return <>{children}</>;
}
