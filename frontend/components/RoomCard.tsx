"use client"
import { Room } from "@/lib/api"
import { MapPin, Maximize2, Calendar, Mail, Phone, ExternalLink, CheckCircle2 } from "lucide-react"

const SETUP: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  "möbliert":     { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500", label: "Furnished" },
  "teilmöbliert": { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-400",   label: "Part-furnished" },
  "unmöbliert":   { bg: "bg-gray-100",   text: "text-gray-500",    dot: "bg-gray-400",    label: "Unfurnished" },
}

function getSetup(s?: string | null) {
  if (!s) return null
  const key = Object.keys(SETUP).find(k => s.toLowerCase().includes(k))
  return key ? SETUP[key] : { bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-400", label: s }
}

interface Props {
  room: Room
  selected?: boolean
  onSelect?: (id: string) => void
  onEmail?: (r: Room) => void
}

export default function RoomCard({ room, selected, onSelect, onEmail }: Props) {
  const setup = getSetup(room.setup)
  const hasEmail = !!room.email

  return (
    <div
      onClick={() => onSelect?.(room.id)}
      className={`card-hover group relative flex flex-col overflow-hidden ${onSelect ? "cursor-pointer" : ""}`}
      style={selected ? { borderColor: "var(--accent)", boxShadow: "0 0 0 3px var(--accent-dim), var(--shadow-sm)" } : {}}
    >
      {/* Top stripe */}
      <div
        className="h-[3px] w-full"
        style={{
          background: hasEmail
            ? "linear-gradient(90deg,#4f46e5,#7c3aed)"
            : "linear-gradient(90deg,#e5e7eb,#d1d5db)",
        }}
      />

      <div className="p-4 flex flex-col gap-3">
        {/* Price row */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-[22px] font-bold tracking-tight" style={{ color: "var(--text-1)" }}>
                €{room.rent_eur}
              </span>
              <span className="text-sm" style={{ color: "var(--text-3)" }}>/mo</span>
            </div>
            {room.extra_costs_eur && (
              <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                + €{room.extra_costs_eur} utilities · total €{room.total_eur}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            {setup && (
              <span className={`badge ${setup.bg} ${setup.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${setup.dot}`} />
                {setup.label}
              </span>
            )}
            {onSelect && (
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                  selected ? "opacity-100" : "opacity-0 group-hover:opacity-60"
                }`}
                style={{
                  background: selected ? "var(--accent)" : "white",
                  borderColor: selected ? "var(--accent)" : "var(--border-strong)",
                }}
              >
                {selected && <CheckCircle2 size={12} color="white" />}
              </div>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs" style={{ color: "var(--text-2)" }}>
          {room.size_m2 && (
            <span className="flex items-center gap-1">
              <Maximize2 size={11} style={{ color: "var(--text-3)" }} />
              {room.size_m2} m²
            </span>
          )}
          {(room.city || room.street) && (
            <span className="flex items-center gap-1 max-w-[160px] truncate">
              <MapPin size={11} style={{ color: "var(--text-3)" }} />
              <span className="truncate">{room.street ? `${room.street}, ` : ""}{room.city}</span>
            </span>
          )}
          {room.available_from && (
            <span className="flex items-center gap-1">
              <Calendar size={11} style={{ color: "var(--text-3)" }} />
              {room.available_from}
            </span>
          )}
        </div>

        {/* Transport */}
        {(room.bus_min || room.tram_min) && (
          <div className="flex gap-2">
            {room.bus_min && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md" style={{ background: "var(--surface-2)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
                🚌 {room.bus_min} min
              </span>
            )}
            {room.tram_min && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md" style={{ background: "var(--surface-2)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
                🚊 {room.tram_min} min
              </span>
            )}
          </div>
        )}

        {/* Contact + actions */}
        <div className="flex items-center gap-2 pt-2.5" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex-1 min-w-0">
            {room.email ? (
              <span className="flex items-center gap-1.5 text-[11px] truncate" style={{ color: "var(--text-3)" }}>
                <Mail size={11} className="text-indigo-500 shrink-0" />
                <span className="truncate">{room.email.split(";")[0]}</span>
              </span>
            ) : (room.phone || room.mobile) ? (
              <span className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>
                <Phone size={11} className="shrink-0" />
                {room.phone || room.mobile}
              </span>
            ) : (
              <span className="text-[11px]" style={{ color: "var(--border-strong)" }}>No contact listed</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {room.email && onEmail && (
              <button
                onClick={e => { e.stopPropagation(); onEmail(room) }}
                className="btn-primary py-1 px-2.5 text-xs"
              >
                Contact
              </button>
            )}
            <a
              href={room.listing_url}
              target="_blank"
              onClick={e => e.stopPropagation()}
              className="btn-secondary py-1 px-2"
            >
              <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
