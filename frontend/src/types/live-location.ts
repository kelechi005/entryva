export interface LiveLocationResponse {
  invitationActive: boolean;
  sharing: boolean;
  arrived: boolean;
  arrivedAt: string | null;
  position: {
    lat: number;
    lng: number;
    heading: number | null;
    accuracyM: number | null;
    updatedAt: string;
    ageSeconds: number;
  } | null;
  gate: { lat: number; lng: number; name: string } | null;
}
