"use client"
import dynamic from "next/dynamic"
import { useState } from "react"
import type { AgentMapPin } from "@/lib/api"
import { ExternalLink, Mail, X } from "lucide-react"

const MiniMap = dynamic(() => import("./MiniMapInner"), { ssr: false })

export default function ChatMap({ pins }: { pins: AgentMapPin[] }) {
  const [selected, setSelected] = useState<AgentMapPin | null>(null)

  const center: [number, number] = pins.length
    ? [pins.reduce((s, p) => s + p.lat, 0) / pins.length, pins.reduce((s, p) => s + p.lng, 0) / pins.length]
    : [49.0069, 8.4037]

  return (
    <div className="mt-2 rounded-xl overflow-hidden border" style={{ border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2" style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
        <span className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>
          {pins.length} room{pins.length !== 1 ? "s" : ""} on map
        </span>
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-3)" }}>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Has email</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400 inline-block" /> Phone only</span>
        </div>
      </div>

      {/* Map */}
      <div className="relative" style={{ height: 280 }}>
        <MiniMap pins={pins} center={center} onPinClick={id => setSelected(pins.find(p => p.id === id) || null)} />
      </div>

      {/* Selected pin detail */}
      {selected && (
        <div className="flex items-center gap-3 px-3 py-2.5" style={{ background: "var(--surface)", borderTop: "1px solid var(--border)" }}>
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>€{selected.rent}/mo</span>
            <span className="text-xs ml-2" style={{ color: "var(--text-3)" }}>{selected.city}{selected.size_m2 ? ` · ${selected.size_m2} m²` : ""}{selected.setup ? ` · ${selected.setup}` : ""}</span>
            {selected.email && (
              <div className="text-xs mt-0.5 truncate" style={{ color: "var(--text-3)" }}>
                <Mail size={10} className="inline mr-1 text-blue-500" />{selected.email.split(";")[0]}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {selected.url && (
              <a href={selected.url} target="_blank" className="btn-secondary py-1 px-2 text-xs">
                <ExternalLink size={11} /> View
              </a>
            )}
            <button onClick={() => setSelected(null)} className="btn-ghost p-1"><X size={14} /></button>
          </div>
        </div>
      )}
    </div>
  )
}
