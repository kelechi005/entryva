'use client';

// Full-screen map for setting the estate's location and visitor entrance.
// Deliberately outside the (admin) layout so the map gets the whole screen;
// the backend still only lets an estate admin read or change this.

import { LocationEditor } from '@/components/location/LocationEditor';

export default function EstateLocationPage() {
  return <LocationEditor />;
}
