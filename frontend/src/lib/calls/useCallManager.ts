'use client';

// Drives one-to-one voice calls between security officers. The backend
// (CallsGateway) is a deliberately thin relay — it forwards opaque
// signal payloads between two sockets and knows nothing about SDP or
// ICE. All WebRTC semantics live here.
//
// Signaling sequence (see calls.gateway.ts for the server side):
//   caller: call:invite -> server: call:ringing (caller) + call:incoming (callee)
//   caller (on call:ringing): create offer, send via call:signal
//   callee (on accept): create answer from the buffered offer, send via call:signal
//   both sides: exchange ICE candidates via call:signal as they trickle in
//
// Ontological note: an SDP offer or ICE candidate can arrive before the
// receiving side is ready for it (e.g. the offer is sent the instant the
// caller's phone starts ringing, but the callee hasn't tapped "Accept"
// yet). Both are queued and flushed once the receiving side's peer
// connection exists / has a remote description set — this is the
// standard WebRTC "glare" pattern, not a workaround.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { apiFetch } from '@/lib/api-client';
import type { AuthenticatedUser } from '@/types/auth';

// Fetched fresh from the backend right before each call (see
// fetchIceServers below) rather than hardcoded here — TURN credentials
// are short-lived and estate/officer-specific (see RealtimeService),
// unlike the free public STUN server this used to fall back to alone.
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await apiFetch<{ iceServers: RTCIceServer[] }>('/realtime/ice-servers');
    return res.iceServers;
  } catch {
    // A TURN outage or a hiccup fetching credentials shouldn't block
    // calling outright — same-network calls still work on STUN alone.
    return FALLBACK_ICE_SERVERS;
  }
}

function socketOrigin(): string {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';
  return apiBase.replace(/\/api\/?$/, '');
}

export interface OnlineOfficer {
  userId: string;
  displayName: string;
}

export type CallPhase = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

interface IncomingCallInfo {
  callId: string;
  fromUserId: string;
  fromName: string;
}

export interface CallManager {
  connected: boolean;
  officers: OnlineOfficer[];
  phase: CallPhase;
  incomingCall: IncomingCallInfo | null;
  peerName: string | null;
  errorMessage: string | null;
  connectedAt: number | null;
  startCall: (officer: OnlineOfficer) => void;
  acceptCall: () => void;
  declineCall: () => void;
  hangUp: () => void;
  muted: boolean;
  toggleMute: () => void;
}

export function useCallManager(): CallManager {
  const [connected, setConnected] = useState(false);
  const [rawOfficers, setRawOfficers] = useState<OnlineOfficer[]>([]);
  const [ownUserId, setOwnUserId] = useState<string | null>(null);
  const [phase, setPhase] = useState<CallPhase>('idle');
  const [incomingCall, setIncomingCall] = useState<IncomingCallInfo | null>(null);
  const [peerName, setPeerName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  // Timestamp (Date.now()) the call actually connected — drives the
  // elapsed-time display on the full-screen call UI. Set once per call
  // (guarded against being overwritten by a second 'connected' event —
  // onconnectionstatechange can fire 'connected' more than once, e.g.
  // after an ICE restart) and cleared in cleanup().
  const [connectedAt, setConnectedAt] = useState<number | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callIdRef = useRef<string | null>(null);
  const peerUserIdRef = useRef<string | null>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const iceQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescriptionSetRef = useRef(false);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    callIdRef.current = null;
    peerUserIdRef.current = null;
    pendingOfferRef.current = null;
    iceQueueRef.current = [];
    remoteDescriptionSetRef.current = false;
    setMuted(false);
    setConnectedAt(null);
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }, []);

  const endCall = useCallback(
    (nextPhase: CallPhase = 'idle') => {
      cleanup();
      setIncomingCall(null);
      setPeerName(null);
      setPhase(nextPhase);
      if (nextPhase === 'ended') {
        // Give the UI a moment to show "Call ended" before resetting to
        // idle, rather than the call bar just vanishing instantly.
        setTimeout(() => setPhase('idle'), 1500);
      }
    },
    [cleanup],
  );

  const sendSignal = useCallback((toUserId: string, callId: string, data: unknown) => {
    socketRef.current?.emit('call:signal', { toUserId, callId, data });
  }, []);

  const createPeerConnection = useCallback(
    (peerUserId: string, callId: string, iceServers: RTCIceServer[]): RTCPeerConnection => {
      const pc = new RTCPeerConnection({ iceServers });

      pc.onicecandidate = (e) => {
        if (e.candidate) sendSignal(peerUserId, callId, { kind: 'ice', candidate: e.candidate });
      };

      pc.ontrack = (e) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = e.streams[0];
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setPhase('connected');
          setConnectedAt((prev) => prev ?? Date.now());
        }
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          if (pc.connectionState === 'failed') setErrorMessage('Call connection failed.');
          endCall('ended');
        }
      };

      return pc;
    },
    [endCall, sendSignal],
  );

  const attachLocalAudio = useCallback(async (pc: RTCPeerConnection) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
  }, []);

  const flushQueuedSignal = useCallback(async (pc: RTCPeerConnection) => {
    for (const candidate of iceQueueRef.current) {
      await pc.addIceCandidate(candidate).catch(() => undefined);
    }
    iceQueueRef.current = [];
  }, []);

  // --- socket lifecycle -----------------------------------------------

  useEffect(() => {
    // Known before the socket connects, not derived from it — the
    // gateway broadcasts one shared presence list to the whole estate
    // room and has no per-recipient view of "which one of these is you",
    // so filtering out the viewer's own entry happens here, client-side.
    // Kept as state (not a ref) so the very first presence:update — which
    // can arrive before this fetch resolves — still gets re-filtered
    // once we know our own ID, instead of briefly showing "yourself".
    apiFetch<AuthenticatedUser>('/auth/me')
      .then((me) => setOwnUserId(me.userId))
      .catch(() => undefined);

    const socket = io(`${socketOrigin()}/calls`, { withCredentials: true });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('presence:update', (list: OnlineOfficer[]) => setRawOfficers(list));

    socket.on('call:incoming', (info: IncomingCallInfo) => {
      callIdRef.current = info.callId;
      peerUserIdRef.current = info.fromUserId;
      setIncomingCall(info);
      setPeerName(info.fromName);
      setPhase('ringing');
    });

    socket.on('call:ringing', ({ callId, toUserId }: { callId: string; toUserId: string }) => {
      callIdRef.current = callId;
      peerUserIdRef.current = toUserId;
      // The offer was created and buffered in startCall() before we knew
      // the callId — send it now that we do.
      if (pendingOfferRef.current) {
        sendSignal(toUserId, callId, { kind: 'offer', sdp: pendingOfferRef.current });
        pendingOfferRef.current = null;
      }
    });

    socket.on('call:unavailable', () => {
      setErrorMessage('That officer is no longer online.');
      endCall('ended');
    });

    socket.on('call:signal', async ({ data }: { data: any }) => {
      const pc = pcRef.current;
      if (data.kind === 'offer') {
        // Buffered until the callee explicitly accepts (see acceptCall) —
        // we never auto-answer just because an offer arrived.
        pendingOfferRef.current = data.sdp;
        return;
      }
      if (data.kind === 'answer') {
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        remoteDescriptionSetRef.current = true;
        await flushQueuedSignal(pc);
        return;
      }
      if (data.kind === 'ice') {
        if (!pc || !remoteDescriptionSetRef.current) {
          iceQueueRef.current.push(data.candidate);
        } else {
          await pc.addIceCandidate(data.candidate).catch(() => undefined);
        }
      }
    });

    socket.on('call:declined', () => {
      setErrorMessage('Call declined.');
      endCall('ended');
    });
    socket.on('call:cancelled', () => endCall('idle'));
    socket.on('call:hangup', () => endCall('ended'));
    socket.on('call:peer-disconnected', ({ userId }: { userId: string }) => {
      if (userId === peerUserIdRef.current) {
        setErrorMessage('Connection to the other officer was lost.');
        endCall('ended');
      }
    });

    return () => {
      socket.disconnect();
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- actions ----------------------------------------------------------

  const startCall = useCallback(
    async (officer: OnlineOfficer) => {
      setErrorMessage(null);
      setPeerName(officer.displayName);
      setPhase('calling');
      try {
        const iceServers = await fetchIceServers();
        const pc = createPeerConnection(officer.userId, '', iceServers); // callId filled in once known
        pcRef.current = pc;
        peerUserIdRef.current = officer.userId;
        await attachLocalAudio(pc);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        pendingOfferRef.current = offer;
        socketRef.current?.emit('call:invite', { toUserId: officer.userId });
      } catch (err) {
        setErrorMessage(
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Microphone access is needed to make a call.'
            : 'Could not start the call.',
        );
        endCall('ended');
      }
    },
    [attachLocalAudio, createPeerConnection, endCall],
  );

  const acceptCall = useCallback(async () => {
    if (!incomingCall) return;
    const { callId, fromUserId } = incomingCall;
    setIncomingCall(null);
    setErrorMessage(null);
    try {
      const iceServers = await fetchIceServers();
      const pc = createPeerConnection(fromUserId, callId, iceServers);
      pcRef.current = pc;
      await attachLocalAudio(pc);

      if (pendingOfferRef.current) {
        await pc.setRemoteDescription(new RTCSessionDescription(pendingOfferRef.current));
        remoteDescriptionSetRef.current = true;
        pendingOfferRef.current = null;
        await flushQueuedSignal(pc);
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(fromUserId, callId, { kind: 'answer', sdp: answer });
      socketRef.current?.emit('call:accept', { callId, toUserId: fromUserId });
      setPhase('connected');
      setConnectedAt((prev) => prev ?? Date.now());
    } catch {
      setErrorMessage(
        'Could not answer the call — check microphone permissions.',
      );
      socketRef.current?.emit('call:decline', { callId, toUserId: fromUserId });
      endCall('idle');
    }
  }, [attachLocalAudio, createPeerConnection, endCall, flushQueuedSignal, incomingCall, sendSignal]);

  const declineCall = useCallback(() => {
    if (!incomingCall) return;
    socketRef.current?.emit('call:decline', { callId: incomingCall.callId, toUserId: incomingCall.fromUserId });
    endCall('idle');
  }, [endCall, incomingCall]);

  const hangUp = useCallback(() => {
    const callId = callIdRef.current;
    const peerUserId = peerUserIdRef.current;
    if (callId && peerUserId) {
      const event = phase === 'calling' ? 'call:cancel' : 'call:hangup';
      socketRef.current?.emit(event, { callId, toUserId: peerUserId });
    }
    endCall('idle');
  }, [endCall, phase]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((track) => (track.enabled = !next));
    setMuted(next);
  }, [muted]);

  // Detached <audio> element for remote playback — not rendered in any
  // component tree, so it survives navigation between /gate and
  // /history without the call dropping.
  useEffect(() => {
    const el = document.createElement('audio');
    el.autoplay = true;
    remoteAudioRef.current = el;
    return () => {
      el.remove();
    };
  }, []);

  const officers = useMemo(
    () => rawOfficers.filter((o) => o.userId !== ownUserId),
    [rawOfficers, ownUserId],
  );

  return {
    connected,
    officers,
    phase,
    incomingCall,
    peerName,
    errorMessage,
    connectedAt,
    startCall,
    acceptCall,
    declineCall,
    hangUp,
    muted,
    toggleMute,
  };
}
