// Mirrors EstateLocationService (backend/src/modules/estate-location).

// Admin view: GET/PUT /admin/estate/location
export interface EstateLocation {
  configured: boolean;
  estateName: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  mainGateName: string | null;
  mainGateLatitude: number | null;
  mainGateLongitude: number | null;
  entranceInstructions: string | null;
  arrivalRadiusMeters: number;
}

export interface UpdateEstateLocationInput {
  latitude: number;
  longitude: number;
  mainGateName: string;
  mainGateLatitude: number;
  mainGateLongitude: number;
  entranceInstructions?: string;
  arrivalRadiusMeters?: number;
}

// Visitor view: GET /invitations/public/:token/location
// Only the entrance - never the estate centre, address or any resident data.
export interface PublicEntrance {
  estateName: string;
  gateName: string;
  latitude: number;
  longitude: number;
  instructions: string | null;
  arrivalRadiusMeters: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}
