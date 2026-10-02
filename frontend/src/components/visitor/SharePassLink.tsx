'use client';

// "Share link" on a Visitor history row. Shown only when this device still has
// the pass's link saved (see lib/pass-cache.ts); opens it on the pass screen.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { hasPass } from '@/lib/pass-cache';

export function SharePassLink({ id }: { id: string }) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    setAvailable(hasPass(id));
  }, [id]);

  if (!available) return null;
  return (
    <Link
      href={`/visitors/new?pass=${encodeURIComponent(id)}`}
      className="ml-3 mt-1 inline-block text-xs font-medium text-brass hover:underline"
    >
      Share link
    </Link>
  );
}
