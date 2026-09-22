'use client';

// QR Scanner — mockup 6/7 (CLAUDE.md §17). Thin wrapper around html5-qrcode
// (already a project dependency): camera preview + scanning frame come
// from the library itself, this component owns the lifecycle (start/stop),
// permission-denied messaging, and handing exactly one decoded value back
// to the caller. "Do not trap the user" — permission denial always shows
// the manual-code fallback via onCameraUnavailable, never a dead end.
// Corner-bracket framing overlay added for the Dark Luxury Glassmorphism
// pass — purely visual, laid over the library's own DOM as absolutely
// positioned siblings so it never touches the #ELEMENT_ID container
// html5-qrcode manages itself.

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';

interface QrScannerProps {
  onScan: (decodedText: string) => void;
  onCameraUnavailable: () => void;
}

const ELEMENT_ID = 'gate-qr-scanner';

function CornerBracket({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute h-8 w-8 border-brass ${className}`}
    />
  );
}

export function QrScanner({ onScan, onCameraUnavailable }: QrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const hasScannedRef = useRef(false);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(ELEMENT_ID);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          // The camera keeps feeding frames while stop() is in flight —
          // only act on the first successful decode.
          if (hasScannedRef.current) return;
          hasScannedRef.current = true;
          onScan(decodedText);
        },
        // Per-frame "no QR found in this frame" callback — expected on
        // almost every frame, not an error worth surfacing.
        () => undefined,
      )
      .then(() => {
        if (!cancelled) setStarting(false);
      })
      .catch(() => {
        // NotAllowedError (permission denied), NotFoundError (no camera),
        // or any other start failure all resolve to the same UX: don't
        // trap the officer on a dead camera view, fall back to manual code.
        if (!cancelled) onCameraUnavailable();
      });

    return () => {
      cancelled = true;
      const current = scannerRef.current;
      if (current && current.getState() === Html5QrcodeScannerState.SCANNING) {
        current.stop().catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-[32px] border border-ink-100 bg-black shadow-card">
        <div id={ELEMENT_ID} className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />

        {!starting && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-[62%] w-[62%] max-w-[260px]">
              <CornerBracket className="left-0 top-0 rounded-tl-2xl border-l-[3px] border-t-[3px]" />
              <CornerBracket className="right-0 top-0 rounded-tr-2xl border-r-[3px] border-t-[3px]" />
              <CornerBracket className="bottom-0 left-0 rounded-bl-2xl border-b-[3px] border-l-[3px]" />
              <CornerBracket className="bottom-0 right-0 rounded-br-2xl border-b-[3px] border-r-[3px]" />
            </div>
          </div>
        )}

        {starting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white/70">
            Requesting camera access&hellip;
          </div>
        )}
      </div>
      <p className="text-center text-sm text-ink-400">
        Align the QR code within the frame.
        <br />
        Make sure it&rsquo;s well lit and clear.
      </p>
    </div>
  );
}
