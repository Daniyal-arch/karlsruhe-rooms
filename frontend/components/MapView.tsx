"use client"
import { useEffect, useState, forwardRef, useImperativeHandle } from "react"
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap, useMapEvents } from "react-leaflet"
import type { MapPin } from "@/lib/api"
import { haversineKm } from "@/lib/utils"
import "leaflet/dist/leaflet.css"
import L from "leaflet"

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

function roomIcon(inRadius: boolean, hasEmail: boolean) {
  const bg = inRadius ? (hasEmail ? "#2563eb" : "#7c3aed") : "#9ca3af"
  const size = inRadius ? 34 : 26
  return L.divIcon({
    className: "",
    html: `<div style="background:${bg};color:white;border-radius:50%;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;font-size:${inRadius ? 11 : 9}px;font-weight:700;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25);transition:all 0.2s">€</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function measureIcon(label: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:#f59e0b;color:white;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)">${label}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

function centerIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="background:#dc2626;color:white;border-radius:50%;width:18px;height:18px;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

function FlyTo({ lat, lng, zoom }: { lat: number; lng: number; zoom?: number }) {
  const map = useMap()
  useEffect(() => {
    if (isNaN(lat) || isNaN(lng)) return
    map.flyTo([lat, lng], zoom ?? map.getZoom(), { duration: 1 })
  }, [lat, lng])
  return null
}

function MapClickHandler({ mode, onMeasurePoint, onCenterSet }: {
  mode: "measure" | "setcenter" | null
  onMeasurePoint: (pt: [number, number]) => void
  onCenterSet: (pt: [number, number]) => void
}) {
  useMapEvents({
    click(e) {
      const pt: [number, number] = [e.latlng.lat, e.latlng.lng]
      if (mode === "measure") onMeasurePoint(pt)
      if (mode === "setcenter") onCenterSet(pt)
    }
  })
  return null
}

export interface MapViewHandle {
  getMap: () => L.Map | null
}

interface Props {
  pins: MapPin[]
  center: [number, number]
  radiusKm?: number
  mode?: "measure" | "setcenter" | null
  onPinClick?: (id: string) => void
  onCenterSet?: (pt: [number, number]) => void
}

export default function MapView({ pins, center, radiusKm, mode, onPinClick, onCenterSet }: Props) {
  const [measurePts, setMeasurePts] = useState<[number, number][]>([])

  const handleMeasure = (pt: [number, number]) => {
    setMeasurePts(prev => prev.length >= 2 ? [pt] : [...prev, pt])
  }

  const measuredKm = measurePts.length === 2
    ? haversineKm(measurePts[0][0], measurePts[0][1], measurePts[1][0], measurePts[1][1])
    : null

  return (
    <div className="relative w-full h-full">
      <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%", borderRadius: "12px" }}>
        <TileLayer
          attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FlyTo lat={center[0]} lng={center[1]} />
        <MapClickHandler mode={mode || null} onMeasurePoint={handleMeasure} onCenterSet={onCenterSet || (() => {})} />

        {/* Search center marker */}
        <Marker position={center} icon={centerIcon()}>
          <Popup><div className="text-xs font-medium">Search center</div></Popup>
        </Marker>

        {/* Radius circle */}
        {radiusKm && radiusKm > 0 && (
          <Circle
            center={center}
            radius={radiusKm * 1000}
            pathOptions={{ color: "#2563eb", fillColor: "#2563eb", fillOpacity: 0.06, weight: 2, dashArray: "6 4" }}
          />
        )}

        {/* Room pins */}
        {pins.filter(pin => !isNaN(pin.lat) && !isNaN(pin.lng)).map(pin => {
          const dist = haversineKm(center[0], center[1], pin.lat, pin.lng)
          const inRadius = !radiusKm || dist <= radiusKm
          return (
            <Marker
              key={pin.id}
              position={[pin.lat, pin.lng]}
              icon={roomIcon(inRadius, pin.has_email)}
              eventHandlers={{ click: () => onPinClick?.(pin.id) }}
            >
              <Popup>
                <div className="text-sm space-y-1 min-w-[140px]">
                  <div className="font-semibold text-gray-900">€{pin.rent}/mo</div>
                  <div className="text-gray-500">{pin.city}</div>
                  {pin.setup && <div className="text-gray-400 text-xs">{pin.setup}</div>}
                  <div className="text-blue-600 text-xs font-medium">{dist.toFixed(1)} km from center</div>
                  {pin.has_email && <div className="text-xs text-green-600">Has email contact</div>}
                </div>
              </Popup>
            </Marker>
          )
        })}

        {/* Measurement markers + line */}
        {measurePts.map((pt, i) => (
          <Marker key={i} position={pt} icon={measureIcon(String(i + 1))} />
        ))}
        {measurePts.length === 2 && (
          <Polyline positions={measurePts} pathOptions={{ color: "#f59e0b", weight: 2, dashArray: "6 3" }} />
        )}
      </MapContainer>

      {/* Distance label overlay */}
      {measuredKm !== null && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] bg-amber-500 text-white px-4 py-2 rounded-full text-sm font-semibold shadow-lg">
          Distance: {measuredKm < 1 ? `${(measuredKm * 1000).toFixed(0)} m` : `${measuredKm.toFixed(2)} km`}
        </div>
      )}

      {/* Mode cursor hint */}
      {mode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-gray-900/80 text-white px-4 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm">
          {mode === "measure" ? "Click two points to measure distance" : "Click to set search center"}
        </div>
      )}
    </div>
  )
}
