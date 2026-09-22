// Mirrors EntryExitService.listCurrentlyInside / listHistory in
// backend/src/modules/entry-exit/entry-exit.service.ts.

export interface CurrentVisitor {
  visitId: string;
  visitorName: string;
  apartmentLabel: string;
  enteredAt: string;
}

export type EntryExitType = 'ENTRY' | 'EXIT';

export interface EntryExitHistoryItem {
  id: string;
  type: EntryExitType;
  visitorName: string;
  apartmentLabel: string;
  occurredAt: string;
}
