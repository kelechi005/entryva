'use client';

// One socket + one RTCPeerConnection for the whole security portal — if
// each page created its own useCallManager, navigating from /gate to
// /history mid-call would tear down the call. This context is mounted
// once in (security)/layout.tsx, above both pages.

import { createContext, useContext } from 'react';
import { CallManager, useCallManager } from './useCallManager';

const CallContext = createContext<CallManager | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const manager = useCallManager();
  return <CallContext.Provider value={manager}>{children}</CallContext.Provider>;
}

export function useCall(): CallManager {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within a CallProvider.');
  return ctx;
}
