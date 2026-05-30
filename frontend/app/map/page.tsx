"use client"
import dynamic from "next/dynamic"
import { useState, useMemo, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { roomsApi, type MapPin, type Room } from "@/lib/api"
import { haversineKm } from "@/lib/utils"
import BulkEmailModal from "@/components/BulkEmailModal"
import {
  Search, Ruler, Crosshair, Mail, SlidersHorizontal,
  MapPin as MapPinIcon, X, ChevronRight, Loader2, ChevronDown, ChevronUp
} from "lucide-react"

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false })

const qc = new QueryClient()

async function geocode(query: string): Promise<{ lat: number; lng: number; name: string } | null> {
  if (!query.trim()) return null
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ", Germany")}&format=json&limit=1`
  const res = await fetch(url, { headers: { "Accept-Language": "en" } })
  const data = await res.json()
  if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), name: data[0].display_name.split(",").slice(0, 2).join(",") }
  return null
}

function RoomRow({ pin, distance, onSelect, selected }: {
  pin: MapPin, distance: number, onSelect: (id: string) => void, selected: boolean
}) {
  return (
    <div
      onClick={() => onSelect(pin.id)}
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-gray-50 last:border-0 ${selected ? "bg-blue-50" : "hover:bg-gray-50"}`}
    >
      <div className={`w-2 h-2 rounded-full shrink-0 ${pin.has_email ? "bg-blue-500" : "bg-gray-300"}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm text-gray-900">€{pin.rent}/mo</span>
          <span className="text-xs text-blue-600 font-medium">{distance.toFixed(1)} km</span>
        </div>
        <div className="text-xs text-gray-500 truncate">{pin.city}{pin.setup ? ` · ${pin.setup}` : ""}</div>
      </div>
      {selected && <div className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />}
    </div>
  )
}

function MapPage() {
  const [centerInput, setCenterInput] = useState("")
  const [center, setCenter] = useState<[number, number]>([49.0069, 8.4037])
  const [centerName, setCenterName] = useState("Karlsruhe")
  const [radiusKm, setRadiusKm] = useState(5)
  const [mode, setMode] = useState<"measure" | "setcenter" | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [bulkRooms, setBulkRooms] = useState<Room[] | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [geoError, setGeoError] = useState("")
  const [bulkDone, setBulkDone] = useState<number | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  // Filters
  const [minRent, setMinRent] = useState("")
  const [maxRent, setMaxRent] = useState("")
  const [setup, setSetup] = useState("")
  const [hasEmail, setHasEmail] = useState(false)
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string | number | boolean>>({})

  const applyFilters = () => {
    const f: Record<string, string | number | boolean> = {}
    if (minRent) f.min_rent = Number(minRent)
    if (maxRent) f.max_rent = Number(maxRent)
    if (setup)   f.setup = setup
    if (hasEmail) f.has_email = true
    setAppliedFilters(f)
  }

  const clearFilters = () => {
    setMinRent(""); setMaxRent(""); setSetup(""); setHasEmail(false)
    setAppliedFilters({})
  }

  const activeFilterCount = Object.keys(appliedFilters).length

  const { data: pins = [] } = useQuery({
    queryKey: ["map-pins", appliedFilters],
    queryFn: () => roomsApi.pins(appliedFilters),
  })

  const { data: selectedRoom } = useQuery({
    queryKey: ["room", selectedId],
    queryFn: () => selectedId ? roomsApi.get(selectedId) : null,
    enabled: !!selectedId,
  })

  const pinsWithDist = useMemo(() =>
    pins.map(p => ({ ...p, dist: haversineKm(center[0], center[1], p.lat, p.lng) }))
      .sort((a, b) => a.dist - b.dist),
    [pins, center]
  )

  const inRadius = useMemo(() => pinsWithDist.filter(p => p.dist <= radiusKm), [pinsWithDist, radiusKm])

  const handleGeocode = async () => {
    if (!centerInput.trim()) return
    setGeocoding(true)
    setGeoError("")
    const result = await geocode(centerInput)
    if (result) {
      setCenter([result.lat, result.lng])
      setCenterName(result.name)
      setCenterInput("")
    } else {
      setGeoError("Location not found. Try a different query.")
    }
    setGeocoding(false)
  }

  const handleMapCenter = useCallback((pt: [number, number]) => {
    setCenter(pt)
    setCenterName(`${pt[0].toFixed(4)}, ${pt[1].toFixed(4)}`)
    setMode(null)
  }, [])

  const handleBulkEmail = async () => {
    const ids = inRadius.filter(p => p.has_email).map(p => p.id)
    if (!ids.length) return
    const rooms = await Promise.all(ids.map(id => roomsApi.get(id)))
    setBulkRooms(rooms)
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-7rem)]">
      {/* Left sidebar */}
      <div className="w-72 shrink-0 flex flex-col gap-3 overflow-y-auto">
        {/* Controls */}
        <div className="card p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Search location</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="input pl-8 text-sm"
                  placeholder="KIT Campus, Berlin…"
                  value={centerInput}
                  onChange={e => { setCenterInput(e.target.value); setGeoError("") }}
                  onKeyDown={e => e.key === "Enter" && handleGeocode()}
                />
              </div>
              <button onClick={handleGeocode} disabled={geocoding} className="btn-primary px-2.5 shrink-0">
                {geocoding ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} />}
              </button>
            </div>
            {geoError && <p className="text-xs text-red-500 mt-1">{geoError}</p>}
            {centerName && !geoError && (
              <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                <MapPinIcon size={11} /> {centerName}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Radius</label>
              <span className="text-sm font-semibold text-blue-600">{radiusKm} km</span>
            </div>
            <input
              type="range" min={1} max={30} step={1} value={radiusKm}
              onChange={e => setRadiusKm(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-300 mt-1">
              <span>1 km</span><span>30 km</span>
            </div>
          </div>

          {/* Filters toggle */}
          <button
            onClick={() => setShowFilters(v => !v)}
            className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wide py-1"
            style={{ color: "var(--text-3)" }}
          >
            <span className="flex items-center gap-1.5">
              <SlidersHorizontal size={12} />
              Filters
              {activeFilterCount > 0 && (
                <span className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{activeFilterCount}</span>
              )}
            </span>
            {showFilters ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {showFilters && (
            <div className="space-y-3 pt-1 pb-2" style={{ borderTop: "1px solid var(--border)" }}>
              {/* Price range */}
              <div>
                <div className="section-label mb-2">Price (€/mo)</div>
                <div className="flex items-center gap-2">
                  <input className="input text-center" placeholder="Min" value={minRent} onChange={e => setMinRent(e.target.value)} />
                  <span style={{ color: "var(--text-3)" }} className="text-xs shrink-0">–</span>
                  <input className="input text-center" placeholder="Max" value={maxRent} onChange={e => setMaxRent(e.target.value)} />
                </div>
              </div>

              {/* Furnishing */}
              <div>
                <div className="section-label mb-2">Furnishing</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[["", "Any"], ["möbliert", "Furnished"], ["teilmöbliert", "Part-furn."], ["unmöbliert", "Unfurnished"]].map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => setSetup(setup === val ? "" : val)}
                      className="text-xs py-1.5 px-2 rounded-lg transition-all text-center"
                      style={{
                        background: setup === val ? "var(--accent)" : "var(--surface-2)",
                        color: setup === val ? "white" : "var(--text-2)",
                        border: `1px solid ${setup === val ? "var(--accent)" : "var(--border)"}`,
                        fontWeight: setup === val ? 600 : 400,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Email only toggle */}
              <label className="flex items-center justify-between cursor-pointer py-0.5">
                <span className="text-sm" style={{ color: "var(--text-2)" }}>Email contact only</span>
                <button
                  onClick={() => setHasEmail(v => !v)}
                  className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
                  style={{ background: hasEmail ? "var(--accent)" : "var(--border-strong)" }}
                >
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${hasEmail ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
              </label>

              {/* Apply / Clear */}
              <div className="flex gap-2 pt-1">
                <button onClick={applyFilters} className="btn-primary flex-1 justify-center text-xs py-1.5">Apply filters</button>
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="btn-secondary text-xs py-1.5 px-3">Clear</button>
                )}
              </div>
            </div>
          )}

          {/* Mode buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setMode(m => m === "setcenter" ? null : "setcenter")}
              className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg border transition-colors font-medium ${mode === "setcenter" ? "bg-blue-600 text-white border-blue-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
            >
              <Crosshair size={13} /> Set on map
            </button>
            <button
              onClick={() => setMode(m => m === "measure" ? null : "measure")}
              className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg border transition-colors font-medium ${mode === "measure" ? "bg-amber-500 text-white border-amber-500" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
            >
              <Ruler size={13} /> Measure
            </button>
          </div>
        </div>

        {/* Stats + bulk email */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xl font-bold text-gray-900">{inRadius.length}</div>
              <div className="text-xs text-gray-500">rooms in radius</div>
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900">{inRadius.filter(p => p.has_email).length}</div>
              <div className="text-xs text-gray-500">with email</div>
            </div>
            {inRadius.length > 0 && (
              <div>
                <div className="text-xl font-bold text-gray-900">
                  €{Math.min(...inRadius.map(p => p.rent))}
                </div>
                <div className="text-xs text-gray-500">cheapest</div>
              </div>
            )}
          </div>
          {inRadius.filter(p => p.has_email).length > 0 && (
            <button onClick={handleBulkEmail} className="btn-primary w-full justify-center text-sm">
              <Mail size={14} /> Email all {inRadius.filter(p => p.has_email).length} in radius
            </button>
          )}
          {bulkDone !== null && (
            <p className="text-xs text-green-600 text-center mt-2 font-medium">✓ {bulkDone} emails sent</p>
          )}
        </div>

        {/* Room list in radius */}
        {inRadius.length > 0 && (
          <div className="card flex-1 overflow-y-auto divide-y divide-gray-50">
            <div className="px-4 py-2.5 border-b border-gray-100">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nearest rooms</span>
            </div>
            {inRadius.slice(0, 20).map(p => (
              <RoomRow key={p.id} pin={p} distance={p.dist} onSelect={setSelectedId} selected={selectedId === p.id} />
            ))}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <div className="rounded-xl overflow-hidden border border-gray-200 h-full" style={{ boxShadow: "var(--shadow-md)" }}>
          <MapView
            pins={pinsWithDist}
            center={center}
            radiusKm={radiusKm}
            mode={mode}
            onPinClick={setSelectedId}
            onCenterSet={handleMapCenter}
          />
        </div>

        {/* Selected room card */}
        {selectedRoom && (
          <div className="absolute top-4 right-4 z-[500] w-64 card p-4 space-y-2.5" style={{ boxShadow: "var(--shadow-lg)" }}>
            <div className="flex items-start justify-between">
              <span className="text-xl font-bold text-gray-900">€{selectedRoom.rent_eur}/mo</span>
              <button onClick={() => setSelectedId(null)} className="btn-ghost p-1"><X size={15} /></button>
            </div>
            <div className="text-sm text-gray-600 space-y-1">
              {selectedRoom.street && <div>{selectedRoom.street}</div>}
              <div>{selectedRoom.city} {selectedRoom.zip_code}</div>
              {selectedRoom.size_m2 && <div>{selectedRoom.size_m2} m² · {selectedRoom.setup}</div>}
              {selectedRoom.available_from && <div>From {selectedRoom.available_from}</div>}
              {selectedRoom.latitude && (
                <div className="text-blue-600 text-xs font-medium">
                  {haversineKm(center[0], center[1], selectedRoom.latitude, selectedRoom.longitude!).toFixed(1)} km from center
                </div>
              )}
            </div>
            {selectedRoom.email && (
              <div className="text-xs text-gray-500 truncate">{selectedRoom.email.split(";")[0]}</div>
            )}
            {selectedRoom.listing_url && (
              <a href={selectedRoom.listing_url} target="_blank" className="btn-secondary text-xs w-full justify-center">
                View listing
              </a>
            )}
          </div>
        )}
      </div>

      {bulkRooms && (
        <BulkEmailModal
          rooms={bulkRooms}
          onClose={() => setBulkRooms(null)}
          onDone={n => { setBulkRooms(null); setBulkDone(n); setTimeout(() => setBulkDone(null), 4000) }}
        />
      )}
    </div>
  )
}

export default function Page() {
  return <QueryClientProvider client={qc}><MapPage /></QueryClientProvider>
}
