'use client';

import React, { useEffect, useRef } from 'react';

interface DeliveryMapPickerProps {
  lat: number | null;
  lng: number | null;
  fallbackLat?: number;
  fallbackLng?: number;
  onSelectLocation: (lat: number, lng: number) => void;
}

declare global {
  interface Window {
    L?: any;
  }
}

function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.L) return Promise.resolve(window.L);

  return new Promise((resolve) => {
    if (!document.getElementById('leaflet-css-cdn')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css-cdn';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const existingScript = document.getElementById('leaflet-js-cdn') as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.L));
      return;
    }

    const script = document.createElement('script');
    script.id = 'leaflet-js-cdn';
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => resolve(null);
    document.body.appendChild(script);
  });
}

export function DeliveryMapPicker({
  lat,
  lng,
  fallbackLat = 25.618193,
  fallbackLng = 85.039305,
  onSelectLocation,
}: DeliveryMapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onSelectRef = useRef(onSelectLocation);
  onSelectRef.current = onSelectLocation;

  const centerLat = lat ?? fallbackLat;
  const centerLng = lng ?? fallbackLng;

  useEffect(() => {
    let mounted = true;

    loadLeaflet().then((L) => {
      if (!mounted || !L || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: [centerLat, centerLng],
        zoom: lat !== null && lng !== null ? 16 : 13,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      const pinIcon = L.divIcon({
        className: 'ceova-map-pin',
        html: `<div style="width:28px;height:28px;border-radius:9999px;background:#ea580c;border:3px solid #ffffff;box-shadow:0 4px 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><div style="width:8px;height:8px;border-radius:9999px;background:#ffffff;"></div></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([centerLat, centerLng], {
        draggable: true,
        icon: pinIcon,
      }).addTo(map);

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onSelectRef.current(
          Number(pos.lat.toFixed(6)),
          Number(pos.lng.toFixed(6))
        );
      });

      map.on('click', (e: any) => {
        const nextLat = Number(e.latlng.lat.toFixed(6));
        const nextLng = Number(e.latlng.lng.toFixed(6));
        marker.setLatLng([nextLat, nextLng]);
        onSelectRef.current(nextLat, nextLng);
      });

      mapRef.current = map;
      markerRef.current = marker;
    });

    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    if (lat === null || lng === null) return;
    markerRef.current.setLatLng([lat, lng]);
    mapRef.current.setView([lat, lng], Math.max(mapRef.current.getZoom(), 16), {
      animate: true,
    });
  }, [lat, lng]);

  return (
    <div className="space-y-1.5">
      <div
        ref={containerRef}
        className="w-full h-52 rounded-xl border border-slate-200 overflow-hidden bg-slate-100 z-0"
      />
      <p className="text-[11px] text-slate-500">
        Tap anywhere on the map or drag the orange pin to tag your exact delivery location.
      </p>
    </div>
  );
}
