"use client";

import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { MapPin } from "@/lib/trip-types";

/**
 * Zoomable city map (OpenStreetMap tiles — free, no key) showing the itinerary
 * pins with day badges, plus a fly-to when you select a day. Uses custom
 * divIcon markers so we avoid Leaflet's bundled-marker asset path entirely.
 */

const KIND_COLOR: Record<string, string> = {
  origin: "#1c91ec",
  destination: "#34a853",
  attraction: "#1c6cb4",
  restaurant: "#a76451",
  hotel: "#34a853",
  activity: "#1c91ec",
};

function pinIcon(pin: MapPin, active: boolean): L.DivIcon {
  const color = KIND_COLOR[pin.kind] ?? "#1c6cb4";
  const size = active ? 18 : 13;
  const badge =
    pin.day != null
      ? `<span style="position:absolute;top:-6px;right:-6px;background:${color};color:#fff;border-radius:999px;font:700 9px/1.4 sans-serif;padding:0 4px;box-shadow:0 1px 3px rgba(0,0,0,.3)">${pin.day}</span>`
      : "";
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:${size}px;height:${size}px;">
             <span style="display:block;width:100%;height:100%;border-radius:999px;background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></span>
             ${badge}
           </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FlyTo({ center, selectedDay }: { center: { lat: number; lon: number }; selectedDay: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (selectedDay != null) {
      // handled by parent via center update; keep map responsive to center change
    }
    map.flyTo([center.lat, center.lon], map.getZoom(), { duration: 0.8 });
  }, [center, selectedDay, map]);
  return null;
}

export type CityMapProps = {
  center: { lat: number; lon: number; label?: string };
  pins: MapPin[];
  selectedDay?: number | null;
  className?: string;
};

export function CityMap({ center, pins, selectedDay = null, className = "" }: CityMapProps) {
  // Focus on the selected day's pins when a day is chosen, else the city center.
  const dayPins = selectedDay != null ? pins.filter((p) => p.day === selectedDay) : [];
  const focus =
    dayPins.length > 0
      ? {
          lat: dayPins.reduce((s, p) => s + p.lat, 0) / dayPins.length,
          lon: dayPins.reduce((s, p) => s + p.lon, 0) / dayPins.length,
        }
      : { lat: center.lat, lon: center.lon };

  return (
    <div className={`relative z-0 h-full w-full ${className}`}>
      <MapContainer
        center={[center.lat, center.lon]}
        zoom={12}
        scrollWheelZoom
        zoomControl
        className="h-full w-full"
        style={{ background: "#e7eef5" }}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <FlyTo center={focus} selectedDay={selectedDay} />
        {pins.map((pin, i) => (
          <Marker
            key={`${pin.kind}-${pin.label}-${i}`}
            position={[pin.lat, pin.lon]}
            icon={pinIcon(pin, selectedDay != null && pin.day === selectedDay)}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              <span className="text-[12px] font-semibold">
                {pin.day != null ? `Day ${pin.day} · ` : ""}
                {pin.label}
              </span>
            </Tooltip>
            <Popup>
              <div className="max-w-[180px]">
                {pin.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pin.image_url}
                    alt={pin.label}
                    className="mb-1.5 h-20 w-full rounded object-cover"
                    loading="lazy"
                  />
                )}
                <p className="text-[12.5px] font-semibold">{pin.label}</p>
                <p className="text-[11px] text-gray-500 capitalize">{pin.kind}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

export default CityMap;
