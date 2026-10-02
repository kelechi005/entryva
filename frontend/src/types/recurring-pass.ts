export type RecurringRole = 'HOUSE_HELP' | 'DRIVER' | 'CLEANER' | 'DELIVERY' | 'OTHER';
export type RecurringPassStatus = 'ACTIVE' | 'PAUSED' | 'REVOKED' | 'EXPIRED';

export interface PassException {
  date: string; // YYYY-MM-DD
  type: 'SKIP' | 'EXTRA';
  startMinute: number | null;
  endMinute: number | null;
}

export interface RecurringPassView {
  id: string;
  fullName: string;
  phone: string | null;
  role: RecurringRole;
  days: number[]; // 0 = Sunday ... 6 = Saturday
  startMinute: number;
  endMinute: number;
  validFrom: string;
  validUntil: string;
  graceMinutes: number;
  status: RecurringPassStatus;
  phoneLinked: boolean;
  inside: boolean;
  upcomingExceptions: PassException[];
  createdAt: string;
}

export interface CreatedRecurringPass extends RecurringPassView {
  /** Shown once. Only its hash is stored on the server. */
  shareToken: string;
}

export interface CreateRecurringPassInput {
  fullName: string;
  phone?: string;
  role: RecurringRole;
  days: number[];
  startMinute: number;
  endMinute: number;
  validFrom: string;
  validUntil: string;
}

export interface PassScanRecord {
  id: string;
  at: string;
  localDate: string;
  direction: 'IN' | 'OUT' | null;
  result: 'ALLOWED' | 'DENIED';
  reason: string | null;
}

export interface RecurringScanResponse {
  allowed: boolean;
  message: string;
  reason?: string;
  direction?: 'IN' | 'OUT';
  duplicate?: boolean;
  overdue: boolean;
  previousVisitOpen: boolean;
  pass?: {
    id: string;
    fullName: string;
    role: RecurringRole;
    residentName: string | null;
    apartmentLabel: string | null;
    startMinute: number;
    endMinute: number;
  };
}

export interface PublicPassView {
  fullName: string;
  role: RecurringRole;
  status: RecurringPassStatus;
  residentName: string | null;
  apartmentLabel: string | null;
  days: number[];
  startMinute: number;
  endMinute: number;
  validFrom: string;
  validUntil: string;
  code: string | null;
  codeDate: string;
}
