import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !ADMIN_EMAIL || user.email !== ADMIN_EMAIL) {
    redirect('/dashboard');
  }

  return <>{children}</>;
}