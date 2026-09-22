export interface AdminBuilding {
  id: string;
  name: string;
  code?: string | null;
}

export interface AdminApartment {
  id: string;
  flatNumber: string;
  status: 'VACANT' | 'OCCUPIED';
  building: { id: string; name: string };
}

export interface AdminResidentInvite {
  id: string;
  email: string;
  status: 'PENDING' | 'USED' | 'EXPIRED' | 'REVOKED';
  expiresAt: string;
  apartment: { flatNumber: string; building: { name: string } };
}

export interface AdminResident {
  id: string;
  displayName: string;
  phone?: string | null;
  apartment: { flatNumber: string; building: { name: string } };
  user: { email: string | null; phone: string | null; status: string };
}

export interface AdminSecurityOfficer {
  id: string;
  fullName: string;
  employeeCode: string;
  user: { email: string | null; phone: string | null; status: string };
}

export interface AdminAuditLog {
  id: string;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminOverview {
  totalResidents: number;
  totalApartments: number;
  totalSecurityOfficers: number;
  visitorsToday: number;
}

export interface AdminEstateSettings {
  id: string;
  name: string;
  address?: string | null;
  timezone: string;
  status: 'ACTIVE' | 'SUSPENDED';
}
