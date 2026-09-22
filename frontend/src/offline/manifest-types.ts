// Mirrors OfflineManifestEntry / SignedOfflineManifestEntry in
// backend/src/modules/offline-sync/offline-sync.service.ts. Split into
// its own file (rather than living in manifest.ts) so db.ts can import
// the type without a circular dependency on the module that reads/writes
// the DB.

export interface OfflineManifestEntry {
  invitationId: string;
  secureTokenHash: string;
  displayCodeHash: string;
  visitorName: string;
  residentName: string;
  residentPhone: string | null;
  apartmentLabel: string;
  validFrom: string;
  validUntil: string;
  entryPolicy: string;
  status: string;
  issuedAt: string;
}

export interface SignedOfflineManifestEntry extends OfflineManifestEntry {
  signature: string;
}

export interface ManifestResponse {
  issuedAt: string;
  publicKey: string;
  entries: SignedOfflineManifestEntry[];
}
