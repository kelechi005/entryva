'use client';

// Thin wrapper around Mapbox GL JS. Loaded only in the browser (always
// imported through next/dynamic with ssr:false) because mapbox-gl needs
// `window`. It knows nothing about estates or visitors - callers hand it
// markers, an optional route line and an optional "fit these points" box.

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getMapboxToken } from '@/lib/mapbox';

export interface MapMarker {
  id: string;
  lng: number;
  lat: number;
  color: string;
  draggable?: boolean;
}

interface MapViewProps {
  center: [number, number]; // [lng, lat]
  zoom: number;
  markers: MapMarker[];
  /** [lng, lat] pairs drawn as a line. */
  route?: Array<[number, number]> | null;
  /** Fit the camera around these points whenever fitKey changes. */
  fitTo?: Array<[number, number]>;
  fitKey?: string | number;
  /** Move the camera here whenever flyKey changes. */
  flyTo?: { lng: number; lat: number; zoom?: number } | null;
  flyKey?: string | number;
  satellite?: boolean;
  /** Fires when the user stops moving the map; gives the middle of the screen. */
  onCenterChange?: (center: { lng: number; lat: number }) => void;
  onMarkerDragEnd?: (id: string, pos: { lng: number; lat: number }) => void;
  /** Keep the camera on this [lng, lat] as it changes (e.g. a moving visitor). */
  follow?: [number, number] | null;
  /** Zoom level to use when following starts. */
  followZoom?: number;
  /** Fires when the user drags or pinches the map themselves. */
  onUserMove?: () => void;
  className?: string;
}

const ROUTE_SOURCE = 'entryva-route';
const ROUTE_LAYER = 'entryva-route-line';

export default function MapView({
  center,
  zoom,
  markers,
  route,
  fitTo,
  fitKey,
  flyTo,
  flyKey,
  satellite,
  onCenterChange,
  onMarkerDragEnd,
  follow,
  followZoom,
  onUserMove,
  className = 'h-72 w-full',
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const loadedRef = useRef(false);
  const markerRefs = useRef<Map<string, mapboxgl.Marker>>(new Map());
  // Latest callbacks/props in refs so the map is created exactly once.
  const cbRef = useRef({ onCenterChange, onMarkerDragEnd, onUserMove });
  cbRef.current = { onCenterChange, onMarkerDragEnd, onUserMove };
  const followedOnce = useRef(false);
  const routeRef = useRef(route);
  routeRef.current = route;

  // Create the map once.
  useEffect(() => {
    const token = getMapboxToken();
    if (!containerRef.current || !token) return;
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: satellite ? 'mapbox://styles/mapbox/satellite-streets-v12' : 'mapbox://styles/mapbox/streets-v12',
      center,
      zoom,
      attributionControl: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      loadedRef.current = true;
      map.addSource(ROUTE_SOURCE, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
      });
      map.addLayer({
        id: ROUTE_LAYER,
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#5DA8FF', 'line-width': 6, 'line-opacity': 0.9 },
      });
      applyRoute(map, routeRef.current);
    });

    map.on('moveend', () => {
      const c = map.getCenter();
      cbRef.current.onCenterChange?.({ lng: c.lng, lat: c.lat });
    });
    // A finger drag or pinch means the visitor wants to look around.
    map.on('dragstart', () => cbRef.current.onUserMove?.());
    map.on('zoomstart', (e) => {
      if (e.originalEvent) cbRef.current.onUserMove?.();
    });

    const markersMap = markerRefs.current;
    return () => {
      markersMap.forEach((m) => m.remove());
      markersMap.clear();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- create once
  }, []);

  // Keep markers in sync (add / move / remove by id).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const existing = markerRefs.current;
    const wanted = new Set(markers.map((m) => m.id));

    existing.forEach((marker, id) => {
      if (!wanted.has(id)) {
        marker.remove();
        existing.delete(id);
      }
    });

    for (const m of markers) {
      const current = existing.get(m.id);
      if (current) {
        current.setLngLat([m.lng, m.lat]);
      } else {
        const marker = new mapboxgl.Marker({ color: m.color, draggable: Boolean(m.draggable) })
          .setLngLat([m.lng, m.lat])
          .addTo(map);
        if (m.draggable) {
          marker.on('dragend', () => {
            const p = marker.getLngLat();
            cbRef.current.onMarkerDragEnd?.(m.id, { lng: p.lng, lat: p.lat });
          });
        }
        existing.set(m.id, marker);
      }
    }
  }, [markers]);

  // Route line.
  useEffect(() => {
    const map = mapRef.current;
    if (map && loadedRef.current) applyRoute(map, route);
  }, [route]);

  // Fit camera when asked.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitTo || fitTo.length === 0) return;
    if (fitTo.length === 1) {
      map.easeTo({ center: fitTo[0], zoom: 16 });
      return;
    }
    const bounds = new mapboxgl.LngLatBounds(fitTo[0], fitTo[0]);
    fitTo.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, { padding: 60, maxZoom: 17, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when fitKey changes
  }, [fitKey]);

  // Follow a moving point (the visitor) smoothly.
  const followLng = follow ? follow[0] : null;
  const followLat = follow ? follow[1] : null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || followLng === null || followLat === null) {
      followedOnce.current = false;
      return;
    }
    const opts: mapboxgl.EaseToOptions = { center: [followLng, followLat], duration: 1000, essential: true };
    if (!followedOnce.current && followZoom !== undefined) opts.zoom = followZoom;
    map.easeTo(opts);
    followedOnce.current = true;
  }, [followLng, followLat, followZoom]);

  // Fly to a searched place.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTo) return;
    map.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: flyTo.zoom ?? 17, essential: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when flyKey changes
  }, [flyKey]);

  return <div ref={containerRef} className={`overflow-hidden rounded-2xl ${className}`} />;
}

function applyRoute(map: mapboxgl.Map, route: Array<[number, number]> | null | undefined) {
  const source = map.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
  source?.setData({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: route ?? [] },
  });
}
