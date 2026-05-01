'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BTW } from '@/lib/btw';

export default function StarRedirectClient({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => { router.replace(to); }, [to, router]);
  return (
    <div style={{ background: BTW.sky[0], position: 'fixed', inset: 0 }} />
  );
}
