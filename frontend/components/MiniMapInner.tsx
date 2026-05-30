"use client"
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet"
import { useEffect } from "react"
import type { AgentMapPin } from "@/lib/api"
import "leaflet/dist/leaflet.css"
import L from "leaflet"

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

function pinIcon(hasEmail: boolean) {
  const color = hasEmail ? "#3b5bdb" : "#868e96"
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};color:white;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.25)">€</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

function FitBounds({ pins }: { pins: AgentMapPin[] }) {
  const map = useMap()
  useEffect(() => {
    if (pins.length === 0) return
    if (pins.length === 1) {
      map.setView([pins[0].lat, pins[0].lng], 14)
    } else {
      const bounds = L.latLngBounds(pins.map(p => [p.lat, p.lng]))
      map.fitBounds(bounds, { padding: [30, 30] })
    }
  }, [pins.length])
  return null
}

interface Props { pins: AgentMapPin[]; center: [number, number]; onPinClick: (id: string) => void }

export default function MiniMapInner({ pins, center, onPinClick }: Props) {
  return (
    <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }} zoomControl={true}>
      <TileLayer
        attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds pins={pins} />
      {pins.map(pin => (
        <Marker
          key={pin.id}
          position={[pin.lat, pin.lng]}
          icon={pinIcon(pin.has_email)}
          eventHandlers={{ click: () => onPinClick(pin.id) }}
        >
          <Popup>
            <div className="text-sm">
              <div className="font-semibold">€{pin.rent}/mo</div>
              <div className="text-gray-500 text-xs">{pin.city}{pin.size_m2 ? ` · ${pin.size_m2}m²` : ""}</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
