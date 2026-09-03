import { requireAdmin } from '@/lib/auth/requireAdmin';

export default async function CryptoTestLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return <>{children}</>;
}
