// The local equivalent of VerificationService.evaluateAndRecord() on the
// backend (see verification.service.ts), run entirely on-device when the
// gate has no connectivity. Mirrors the same outcome logic so an officer
// sees a consistent experience whether or not the network is up —
// CLAUDE.md §25 "The UI must clearly indicate when verification is
// offline," not that offline verification should look or behave
// differently beyond that.
//
// Every cached record's signature is re-verified here, at scan time —
// not just once when it was cached (see manifest.ts) — because
// IndexedDB is writable by anyone with access to the device and must
// never be trusted on its own (CLAUDE.md §25 "Do not trust arbitrary
// client-side JSON").

import { sha256Hex, importOfflinePublicKey, verifyManifestEntry } from './crypto';
import { getAllManifestEntries, getManifestMeta, hasQueuedAllow } from './db';
import type { SignedOfflineManifestEntry } from './manifest-types';
import type { VerificationOutcome, VerificationResult } from '@/types/verification';

export interface OfflineVerificationResult extends VerificationResult {
  offline: true;
}

async function findMatch(
  rawValue: string,
  method: 'QR' | 'MANUAL_CODE',
  entries: SignedOfflineManifestEntry[],
): Promise<SignedOfflineManifestEntry | null> {
  if (method === 'MANUAL_CODE') {
    const normalized = rawValue.trim().toUpperCase();
    const hash = await sha256Hex(normalized);
    return entries.find((e) => e.displayCodeHash === hash) ?? null;
  }
  const hash = await sha256Hex(rawValue);
  return entries.find((e) => e.secureTokenHash === hash) ?? null;
}

export async function verifyOffline(
  rawValue: string,
  method: 'QR' | 'MANUAL_CODE',
): Promise<OfflineVerificationResult> {
  const { publicKeyPem } = await getManifestMeta();
  if (!publicKeyPem) {
    // Never successfully synced a manifest on this device — there is
    // nothing to check a scan against, so it can only be reported as
    // not found rather than guessed at.
    return { outcome: 'NOT_FOUND', offline: true };
  }

  const entries = await getAllManifestEntries();
  const match = await findMatch(rawValue, method, entries);
  if (!match) {
    return { outcome: 'NOT_FOUND', offline: true };
  }

  // Re-verify the signature now, against this record specifically —
  // don't assume that because it's sitting in the manifest store it must
  // have passed verification when it was written.
  const { signature, ...unsigned } = match;
  const publicKey = await importOfflinePublicKey(publicKeyPem);
  const signatureOk = await verifyManifestEntry(unsigned, signature, publicKey);
  if (!signatureOk) {
    // eslint-disable-next-line no-console
    console.error('Offline manifest entry failed signature verification — treating as not found.');
    return { outcome: 'NOT_FOUND', offline: true };
  }

  const now = Date.now();
  const alreadyUsedLocally =
    match.entryPolicy === 'ONE_TIME' &&
    (match.status === 'USED' || (await hasQueuedAllow(match.invitationId)));

  let outcome: VerificationOutcome;
  if (match.status === 'REVOKED' || match.status === 'CANCELLED') {
    outcome = 'REVOKED';
  } else if (alreadyUsedLocally) {
    outcome = 'ALREADY_USED';
  } else if (new Date(match.validUntil).getTime() < now) {
    outcome = 'EXPIRED';
  } else if (new Date(match.validFrom).getTime() > now) {
    outcome = 'NOT_YET_VALID';
  } else {
    outcome = 'VALID';
  }

  return {
    outcome,
    offline: true,
    invitation: {
      invitationId: match.invitationId,
      visitorName: match.visitorName,
      residentName: match.residentName,
      residentPhone: match.residentPhone,
      apartmentLabel: match.apartmentLabel,
      validUntil: match.validUntil,
      status: match.status,
      entryPolicy: match.entryPolicy,
    },
  };
}
