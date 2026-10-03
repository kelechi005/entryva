'use client';

// Thin wrapper around Mapbox GL JS. Loaded only in the browser (always
// imported through next/dynamic with ssr:false) because mapbox-gl needs
// `window`. It knows nothing about estates or visitors - callers hand it
// markers, an optional route line and an optional "fit these points" box.

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAP_COLORS, getMapStyle, getMapboxToken } from '@/lib/mapbox';
import { circlePolygon } from '@/lib/geo';

export interface MapMarker {
  id: string;
  lng: number;
  lat: number;
  color: string;
  draggable?: boolean;
  /** 'car' draws a car that points the way `heading` (degrees, 0 = north). */
  icon?: 'car';
  heading?: number;
  /** Entryva-branded pins: the gate (with a label), the estate dot, the pulsing "you" dot. */
  kind?: 'gate' | 'estate' | 'me';
  label?: string;
}

/** A circle on the map, e.g. the "arrived" zone or the GPS accuracy ring. */
export interface MapZone {
  id: string;
  lng: number;
  lat: number;
  radiusM: number;
  color: string;
  dashed?: boolean;
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
  /** 'dark' = the Entryva look (dark map + glowing route). Default keeps the original light map. */
  theme?: 'dark';
  zones?: MapZone[];
  /** Space (px) kept clear when fitting, e.g. under a bottom panel. */
  fitPadding?: { top: number; bottom: number; left: number; right: number };
  /** Fires when the user stops moving the map; gives the middle of the screen. */
  onCenterChange?: (center: { lng: number; lat: number; zoom: number }) => void;
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
const ZONES_SOURCE = 'entryva-zones';

type GeoData = Parameters<mapboxgl.GeoJSONSource['setData']>[0];

function zonesToGeoJSON(zones: MapZone[]): GeoData {
  return {
    type: 'FeatureCollection',
    features: zones.map((z) => ({
      type: 'Feature',
      properties: { color: z.color, dashed: z.dashed ? 1 : 0 },
      geometry: { type: 'Polygon', coordinates: [circlePolygon({ lat: z.lat, lng: z.lng }, z.radiusM)] },
    })),
  } as GeoData;
}

// ---- Branded marker artwork (plain DOM; no extra CSS file needed) ----

let pulseStyleInjected = false;
function ensurePulseStyle() {
  if (pulseStyleInjected || typeof document === 'undefined') return;
  const style = document.createElement('style');
  style.textContent =
    '@keyframes entryva-pulse{0%{box-shadow:0 0 0 0 rgba(59,130,246,.55)}100%{box-shadow:0 0 0 18px rgba(59,130,246,0)}}';
  document.head.appendChild(style);
  pulseStyleInjected = true;
}

function brandedElement(m: MapMarker): HTMLElement {
  const el = document.createElement('div');
  el.style.position = 'relative';
  if (m.kind === 'gate') {
    el.style.cssText +=
      ';width:38px;height:38px;border-radius:50%;background:' + MAP_COLORS.gate +
      ';border:3px solid #fff;box-shadow:0 6px 18px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center';
    // Simple "gate" glyph: two posts and a bar.
    el.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M5 20V8M19 20V8M3 8h18M5 13h14"/></svg>';
  } else if (m.kind === 'estate') {
    el.style.cssText +=
      ';width:18px;height:18px;border-radius:50%;background:' + MAP_COLORS.estate +
      ';border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.5)';
  } else {
    ensurePulseStyle();
    el.style.cssText +=
      ';width:18px;height:18px;border-radius:50%;background:' + MAP_COLORS.me +
      ';border:3px solid #fff;animation:entryva-pulse 1.8s ease-out infinite';
  }
  if (m.label) {
    const pill = document.createElement('div');
    pill.textContent = m.label;
    pill.style.cssText =
      'position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%);white-space:nowrap;' +
      'padding:3px 10px;border-radius:999px;background:rgba(5,5,5,.85);color:#fff;' +
      'font:600 12px Inter,system-ui,sans-serif;border:1px solid rgba(255,255,255,.18);pointer-events:none';
    el.appendChild(pill);
  }
  return el;
}

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
  theme,
  zones,
  fitPadding,
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
  const markerSigs = useRef<Map<string, string>>(new Map());
  // Latest callbacks/props in refs so the map is created exactly once.
  const cbRef = useRef({ onCenterChange, onMarkerDragEnd, onUserMove });
  cbRef.current = { onCenterChange, onMarkerDragEnd, onUserMove };
  const followedOnce = useRef(false);
  const routeRef = useRef(route);
  routeRef.current = route;
  const zonesRef = useRef(zones);
  zonesRef.current = zones;

  // Create the map once.
  useEffect(() => {
    const token = getMapboxToken();
    if (!containerRef.current || !token) return;
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: satellite
        ? getMapStyle('admin')
        : theme === 'dark'
          ? getMapStyle('visitor')
          : 'mapbox://styles/mapbox/streets-v12',
      center,
      zoom,
      attributionControl: true,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      loadedRef.current = true;

      // Circles (arrival zone, GPS accuracy) sit under the route line.
      map.addSource(ZONES_SOURCE, { type: 'geojson', data: zonesToGeoJSON(zonesRef.current ?? []) });
      map.addLayer({
        id: 'zones-fill',
        type: 'fill',
        source: ZONES_SOURCE,
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.14 },
      });
      map.addLayer({
        id: 'zones-line-solid',
        type: 'line',
        source: ZONES_SOURCE,
        filter: ['==', ['get', 'dashed'], 0],
        paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-opacity': 0.8 },
      });
      map.addLayer({
        id: 'zones-line-dashed',
        type: 'line',
        source: ZONES_SOURCE,
        filter: ['==', ['get', 'dashed'], 1],
        paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [2, 2] },
      });

      map.addSource(ROUTE_SOURCE, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
      });
      if (theme === 'dark') {
        // A dark outline keeps the bright route line readable on any map.
        map.addLayer({
          id: 'entryva-route-casing',
          type: 'line',
          source: ROUTE_SOURCE,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#050505', 'line-width': 10, 'line-opacity': 0.7 },
        });
      }
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
      cbRef.current.onCenterChange?.({ lng: c.lng, lat: c.lat, zoom: map.getZoom() });
    });
    // A finger drag or pinch means the visitor wants to look around.
    map.on('dragstart', () => cbRef.current.onUserMove?.());
    map.on('zoomstart', (e) => {
      // Only a finger or wheel zoom counts, not the map's own animated zoom.
      if ((e as unknown as { originalEvent?: unknown }).originalEvent) cbRef.current.onUserMove?.();
    });

    const markersMap = markerRefs.current;
    const sigsMap = markerSigs.current;
    return () => {
      markersMap.forEach((m) => m.remove());
      markersMap.clear();
      sigsMap.clear();
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
        markerSigs.current.delete(id);
      }
    });

    for (const m of markers) {
      // A branded marker whose look changed (e.g. the gate was renamed) is re-drawn.
      const sig = `${m.kind ?? ''}|${m.label ?? ''}`;
      let current = existing.get(m.id);
      if (current && markerSigs.current.get(m.id) !== sig) {
        current.remove();
        existing.delete(m.id);
        current = undefined;
      }
      if (current) {
        current.setLngLat([m.lng, m.lat]);
        if (m.icon === 'car') current.setRotation(m.heading ?? 0);
      } else {
        markerSigs.current.set(m.id, sig);
        const marker = (
          m.kind
            ? new mapboxgl.Marker({ element: brandedElement(m), draggable: Boolean(m.draggable) })
            : m.icon === 'car'
              ? new mapboxgl.Marker({ element: carElement(m.color), rotation: m.heading ?? 0, rotationAlignment: 'map' })
              : new mapboxgl.Marker({ color: m.color, draggable: Boolean(m.draggable) })
        )
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

  // Circles (arrival zone, GPS accuracy).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    (map.getSource(ZONES_SOURCE) as mapboxgl.GeoJSONSource | undefined)?.setData(zonesToGeoJSON(zones ?? []));
  }, [zones]);

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
    map.fitBounds(bounds, { padding: fitPadding ?? 60, maxZoom: 17, duration: 600 });
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
    const opts: Parameters<mapboxgl.Map['easeTo']>[0] = {
      center: [followLng, followLat],
      duration: 1000,
      essential: true,
    };
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

  // Rounded by default (card maps); a caller passing its own `rounded-*` class (e.g. full-screen) opts out.
  return (
    <div ref={containerRef} className={`overflow-hidden ${className.includes('rounded') ? '' : 'rounded-2xl'} ${className}`} />
  );
}

// A top-down car that points up (north); the marker rotation turns it.
function carElement(color: string): HTMLElement {
  const el = document.createElement('div');
  el.style.width = '34px';
  el.style.height = '34px';
  el.innerHTML =
    '<svg viewBox="0 0 24 24" width="34" height="34" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="12" cy="12" r="11" fill="white" opacity="0.92"/>' +
    '<rect x="7.5" y="3.5" width="9" height="17" rx="3.5" fill="' + color + '"/>' +
    '<rect x="9" y="6.5" width="6" height="3.5" rx="1" fill="white" opacity="0.9"/>' +
    '<rect x="9" y="15" width="6" height="2.5" rx="1" fill="white" opacity="0.6"/>' +
    '</svg>';
  return el;
}

function applyRoute(map: mapboxgl.Map, route: Array<[number, number]> | null | undefined) {
  const source = map.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
  source?.setData({
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: route ?? [] },
  });
}
