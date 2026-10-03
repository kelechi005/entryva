'use client';

import { NavigationScreen } from '@/components/visitor/NavigationScreen';

export default function NavigatePage({ params }: { params: { token: string } }) {
  return <NavigationScreen token={params.token} />;
}
