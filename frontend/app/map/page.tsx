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
  MapPin as MapPinIcon, X, ChevronRight, Loader2,
  ChevronDown, ChevronUp, ChevronLeft
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

function RoomRow({ pin, distance, onSelect, selected }: { pin: MapPin; distance: number; onSelect: (id: string) => void; selected: boolean }) {
  return (
    <div
      onClick={() => onSelect(pin.id)}
      className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b last:border-0 ${selected ? "bg-indigo-50" : "hover:bg-gray-50"}`}
      style={{ borderColor: "var(--border)" }}
    >
      <div className={`w-2 h-2 rounded-full shrink-0 ${pin.has_email ? "bg-indigo-500" : "bg-gray-300"}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>€{pin.rent}/mo</span>
          <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>{distance.toFixed(1)} km</span>
        </div>
        <div className="text-xs truncate" style={{ color: "var(--text-3)" }}>{pin.city}{pin.setup ? ` · ${pin.setup}` : ""}</div>
      </div>
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
  const [showSidebar, setShowSidebar] = useState(false) // mobile sidebar toggle
  const [sheetExpanded, setSheetExpanded] = useState(false) // mobile bottom sheet

  const [minRent, setMinRent] = useState("")
  const [maxRent, setMaxRent] = useState("")
  const [setup, setSetup] = useState("")
  const [hasEmail, setHasEmail] = useState(false)
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string | number | boolean>>({})

  const applyFilters = () => {
    const f: Record<string, string | number | boolean> = {}
    if (minRent) f.min_rent = Number(minRent)
    if (maxRent) f.max_rent = Number(maxRent)
    if (setup) f.setup = setup
    if (hasEmail) f.has_email = true
    setAppliedFilters(f)
    setShowFilters(false)
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
    setGeocoding(true); setGeoError("")
    const result = await geocode(centerInput)
    if (result) { setCenter([result.lat, result.lng]); setCenterName(result.name); setCenterInput("") }
    else setGeoError("Location not found.")
    setGeocoding(false)
  }

  const handleMapCenter = useCallback((pt: [number, number]) => {
    setCenter(pt); setCenterName(`${pt[0].toFixed(4)}, ${pt[1].toFixed(4)}`); setMode(null)
  }, [])

  const handleBulkEmail = async () => {
    const ids = inRadius.filter(p => p.has_email).map(p => p.id)
    if (!ids.length) return
    const rooms = await Promise.all(ids.map(id => roomsApi.get(id)))
    setBulkRooms(rooms)
  }

  const controlsPanel = (
    <div className="space-y-4">
      {/* Search */}
      <div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
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
          <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "var(--text-3)" }}>
            <MapPinIcon size={11} /> {centerName}
          </p>
        )}
      </div>

      {/* Radius */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="section-label">Radius</span>
          <span className="text-sm font-semibold" style={{ color: "var(--accent)" }}>{radiusKm} km</span>
        </div>
        <input type="range" min={1} max={30} step={1} value={radiusKm}
          onChange={e => setRadiusKm(Number(e.target.value))}
          className="w-full accent-indigo-600" />
        <div className="flex justify-between text-xs mt-1" style={{ color: "var(--text-3)" }}>
          <span>1 km</span><span>30 km</span>
        </div>
      </div>

      {/* Filters toggle */}
      <button
        onClick={() => setShowFilters(v => !v)}
        className="w-full flex items-center justify-between py-1"
      >
        <span className="section-label flex items-center gap-1.5">
          <SlidersHorizontal size={12} /> Filters
          {activeFilterCount > 0 && (
            <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{activeFilterCount}</span>
          )}
        </span>
        {showFilters ? <ChevronUp size={13} style={{ color: "var(--text-3)" }} /> : <ChevronDown size={13} style={{ color: "var(--text-3)" }} />}
      </button>

      {showFilters && (
        <div className="space-y-3 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
          <div>
            <div className="section-label mb-2">Price (€/mo)</div>
            <div className="flex items-center gap-2">
              <input className="input text-center" placeholder="Min" value={minRent} onChange={e => setMinRent(e.target.value)} />
              <span style={{ color: "var(--text-3)" }} className="text-xs shrink-0">–</span>
              <input className="input text-center" placeholder="Max" value={maxRent} onChange={e => setMaxRent(e.target.value)} />
            </div>
          </div>
          <div>
            <div className="section-label mb-2">Furnishing</div>
            <div className="grid grid-cols-2 gap-1.5">
              {[["", "Any"], ["möbliert", "Furnished"], ["teilmöbliert", "Part-furn."], ["unmöbliert", "Unfurnished"]].map(([val, label]) => (
                <button key={val} onClick={() => setSetup(setup === val ? "" : val)}
                  className="text-xs py-1.5 px-2 rounded-lg transition-all text-center"
                  style={{
                    background: setup === val ? "var(--accent)" : "var(--surface-2)",
                    color: setup === val ? "white" : "var(--text-2)",
                    border: `1px solid ${setup === val ? "var(--accent)" : "var(--border)"}`,
                  }}
                >{label}</button>
              ))}
            </div>
          </div>
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-sm" style={{ color: "var(--text-2)" }}>Email only</span>
            <button onClick={() => setHasEmail(v => !v)}
              className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0"
              style={{ background: hasEmail ? "var(--accent)" : "var(--border-strong)" }}>
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${hasEmail ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
          </label>
          <div className="flex gap-2">
            <button onClick={applyFilters} className="btn-primary flex-1 justify-center text-xs py-1.5">Apply</button>
            {activeFilterCount > 0 && <button onClick={clearFilters} className="btn-secondary text-xs py-1.5 px-3">Clear</button>}
          </div>
        </div>
      )}

      {/* Mode buttons */}
      <div className="flex gap-2">
        <button onClick={() => setMode(m => m === "setcenter" ? null : "setcenter")}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg border transition-colors font-medium ${mode === "setcenter" ? "bg-indigo-600 text-white border-indigo-600" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
          <Crosshair size={13} /> Set on map
        </button>
        <button onClick={() => setMode(m => m === "measure" ? null : "measure")}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg border transition-colors font-medium ${mode === "measure" ? "bg-amber-500 text-white border-amber-500" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
          <Ruler size={13} /> Measure
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* ── DESKTOP layout ── */}
      <div className="hidden sm:flex gap-4 h-[calc(100vh-7rem)]">
        {/* Sidebar */}
        <div className="w-72 shrink-0 flex flex-col gap-3 overflow-y-auto">
          <div className="card p-4">{controlsPanel}</div>

          {/* Stats */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <div><div className="text-xl font-bold" style={{ color: "var(--text-1)" }}>{inRadius.length}</div><div className="text-xs" style={{ color: "var(--text-3)" }}>in radius</div></div>
              <div><div className="text-xl font-bold" style={{ color: "var(--text-1)" }}>{inRadius.filter(p => p.has_email).length}</div><div className="text-xs" style={{ color: "var(--text-3)" }}>with email</div></div>
              {inRadius.length > 0 && <div><div className="text-xl font-bold" style={{ color: "var(--text-1)" }}>€{Math.min(...inRadius.map(p => p.rent))}</div><div className="text-xs" style={{ color: "var(--text-3)" }}>cheapest</div></div>}
            </div>
            {inRadius.filter(p => p.has_email).length > 0 && (
              <button onClick={handleBulkEmail} className="btn-primary w-full justify-center text-sm">
                <Mail size={14} /> Email all {inRadius.filter(p => p.has_email).length}
              </button>
            )}
            {bulkDone !== null && <p className="text-xs text-green-600 text-center mt-2 font-medium">✓ {bulkDone} emails sent</p>}
          </div>

          {inRadius.length > 0 && (
            <div className="card flex-1 overflow-y-auto">
              <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="section-label">Nearest rooms</span>
              </div>
              {inRadius.slice(0, 20).map(p => (
                <RoomRow key={p.id} pin={p} distance={p.dist} onSelect={setSelectedId} selected={selectedId === p.id} />
              ))}
            </div>
          )}
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          <div className="rounded-xl overflow-hidden h-full" style={{ border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}>
            <MapView pins={pinsWithDist} center={center} radiusKm={radiusKm} mode={mode} onPinClick={setSelectedId} onCenterSet={handleMapCenter} />
          </div>
          {selectedRoom && (
            <div className="absolute top-4 right-4 z-[500] w-64 card p-4 space-y-2.5" style={{ boxShadow: "var(--shadow-lg)" }}>
              <div className="flex items-start justify-between">
                <span className="text-xl font-bold" style={{ color: "var(--text-1)" }}>€{selectedRoom.rent_eur}/mo</span>
                <button onClick={() => setSelectedId(null)} className="btn-ghost p-1"><X size={15} /></button>
              </div>
              <div className="text-sm space-y-1" style={{ color: "var(--text-2)" }}>
                {selectedRoom.street && <div>{selectedRoom.street}</div>}
                <div>{selectedRoom.city} {selectedRoom.zip_code}</div>
                {selectedRoom.size_m2 && <div>{selectedRoom.size_m2} m²{selectedRoom.setup ? ` · ${selectedRoom.setup}` : ""}</div>}
                {selectedRoom.available_from && <div>From {selectedRoom.available_from}</div>}
                {selectedRoom.latitude && (
                  <div className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                    {haversineKm(center[0], center[1], selectedRoom.latitude, selectedRoom.longitude!).toFixed(1)} km away
                  </div>
                )}
              </div>
              {selectedRoom.listing_url && (
                <a href={selectedRoom.listing_url} target="_blank" className="btn-secondary text-xs w-full justify-center">View listing</a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── MOBILE layout ── */}
      <div className="sm:hidden -mx-4 relative" style={{ height: "calc(100vh - 8rem)" }}>

        {/* Full-screen map */}
        <div className="absolute inset-0">
          <MapView pins={pinsWithDist} center={center} radiusKm={radiusKm} mode={mode} onPinClick={id => { setSelectedId(id); setSheetExpanded(true) }} onCenterSet={handleMapCenter} />
        </div>

        {/* Floating search bar at top */}
        <div className="absolute top-3 left-3 right-3 z-[500]">
          <div className="bg-white rounded-xl shadow-lg p-2 flex gap-2" style={{ border: "1px solid var(--border)" }}>
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
              <input
                className="w-full text-sm outline-none pl-8 pr-2 py-1.5 bg-transparent"
                style={{ color: "var(--text-1)" }}
                placeholder="Search location…"
                value={centerInput}
                onChange={e => { setCenterInput(e.target.value); setGeoError("") }}
                onKeyDown={e => e.key === "Enter" && handleGeocode()}
              />
            </div>
            <button onClick={handleGeocode} disabled={geocoding} className="btn-primary px-2.5 py-1.5 shrink-0">
              {geocoding ? <Loader2 size={13} className="animate-spin" /> : <ChevronRight size={13} />}
            </button>
            <button
              onClick={() => setShowSidebar(true)}
              className="btn-secondary px-2.5 py-1.5 shrink-0 relative"
            >
              <SlidersHorizontal size={14} />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-indigo-600 text-white text-[9px] rounded-full flex items-center justify-center font-bold">{activeFilterCount}</span>
              )}
            </button>
          </div>
          {geoError && (
            <p className="text-xs text-red-500 mt-1 bg-white rounded-lg px-3 py-1 shadow">{geoError}</p>
          )}
          {centerName && !geoError && (
            <p className="text-xs mt-1 bg-white rounded-lg px-3 py-1 shadow flex items-center gap-1" style={{ color: "var(--text-3)" }}>
              <MapPinIcon size={10} /> {centerName}
            </p>
          )}
        </div>

        {/* Floating mode buttons */}
        <div className="absolute top-20 right-3 z-[500] flex flex-col gap-2">
          <button
            onClick={() => setMode(m => m === "setcenter" ? null : "setcenter")}
            className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-colors ${mode === "setcenter" ? "bg-indigo-600 text-white" : "bg-white text-gray-600"}`}
            style={{ border: "1px solid var(--border)" }}
          >
            <Crosshair size={16} />
          </button>
          <button
            onClick={() => setMode(m => m === "measure" ? null : "measure")}
            className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-colors ${mode === "measure" ? "bg-amber-500 text-white" : "bg-white text-gray-600"}`}
            style={{ border: "1px solid var(--border)" }}
          >
            <Ruler size={16} />
          </button>
        </div>

        {/* Bottom sheet */}
        <div
          className="absolute bottom-0 left-0 right-0 z-[500] bg-white rounded-t-2xl"
          style={{
            border: "1px solid var(--border)",
            boxShadow: "0 -4px 24px rgba(0,0,0,0.1)",
            maxHeight: sheetExpanded ? "65%" : "auto",
            transition: "max-height 0.3s ease",
            overflow: "hidden",
          }}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1" onClick={() => setSheetExpanded(v => !v)}>
            <div className="w-10 h-1 rounded-full bg-gray-200" />
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-between px-4 py-2" onClick={() => setSheetExpanded(v => !v)}>
            <div className="flex items-center gap-4">
              <div>
                <span className="text-base font-bold" style={{ color: "var(--text-1)" }}>{inRadius.length}</span>
                <span className="text-xs ml-1" style={{ color: "var(--text-3)" }}>rooms</span>
              </div>
              <div>
                <span className="text-base font-bold" style={{ color: "var(--text-1)" }}>{inRadius.filter(p => p.has_email).length}</span>
                <span className="text-xs ml-1" style={{ color: "var(--text-3)" }}>with email</span>
              </div>
              {inRadius.length > 0 && (
                <div>
                  <span className="text-base font-bold" style={{ color: "var(--text-1)" }}>€{Math.min(...inRadius.map(p => p.rent))}</span>
                  <span className="text-xs ml-1" style={{ color: "var(--text-3)" }}>cheapest</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {inRadius.filter(p => p.has_email).length > 0 && (
                <button onClick={e => { e.stopPropagation(); handleBulkEmail() }} className="btn-primary py-1.5 px-3 text-xs">
                  <Mail size={12} /> Email {inRadius.filter(p => p.has_email).length}
                </button>
              )}
              {sheetExpanded ? <ChevronDown size={16} style={{ color: "var(--text-3)" }} /> : <ChevronUp size={16} style={{ color: "var(--text-3)" }} />}
            </div>
          </div>

          {/* Radius slider in sheet */}
          <div className="px-4 pb-2">
            <div className="flex items-center gap-3">
              <span className="text-xs shrink-0" style={{ color: "var(--text-3)" }}>Radius</span>
              <input type="range" min={1} max={30} step={1} value={radiusKm}
                onChange={e => setRadiusKm(Number(e.target.value))}
                className="flex-1 accent-indigo-600" />
              <span className="text-xs font-semibold shrink-0" style={{ color: "var(--accent)" }}>{radiusKm} km</span>
            </div>
          </div>

          {/* Expandable room list */}
          {sheetExpanded && (
            <div className="overflow-y-auto" style={{ maxHeight: "calc(65vh - 130px)", borderTop: "1px solid var(--border)" }}>
              {bulkDone !== null && <p className="text-xs text-green-600 text-center py-2 font-medium">✓ {bulkDone} emails sent</p>}
              {inRadius.length === 0 ? (
                <p className="text-center py-6 text-sm" style={{ color: "var(--text-3)" }}>No rooms in this radius</p>
              ) : (
                inRadius.slice(0, 20).map(p => (
                  <RoomRow key={p.id} pin={p} distance={p.dist} onSelect={id => { setSelectedId(id); setSheetExpanded(false) }} selected={selectedId === p.id} />
                ))
              )}
            </div>
          )}
        </div>

        {/* Selected room popup (mobile) */}
        {selectedRoom && (
          <div className="absolute top-20 left-3 z-[500] w-56 card p-3 space-y-2" style={{ boxShadow: "var(--shadow-lg)" }}>
            <div className="flex items-start justify-between">
              <span className="font-bold" style={{ color: "var(--text-1)" }}>€{selectedRoom.rent_eur}/mo</span>
              <button onClick={() => setSelectedId(null)} className="btn-ghost p-0.5"><X size={13} /></button>
            </div>
            <div className="text-xs space-y-0.5" style={{ color: "var(--text-2)" }}>
              {selectedRoom.city && <div>{selectedRoom.city}</div>}
              {selectedRoom.size_m2 && <div>{selectedRoom.size_m2} m²</div>}
            </div>
            {selectedRoom.listing_url && (
              <a href={selectedRoom.listing_url} target="_blank" className="btn-secondary text-xs w-full justify-center py-1">View</a>
            )}
          </div>
        )}
      </div>

      {/* Mobile controls drawer */}
      {showSidebar && (
        <div
          className="sm:hidden fixed inset-0 z-[600] flex items-end"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={() => setShowSidebar(false)}
        >
          <div
            className="w-full bg-white rounded-t-2xl p-5 space-y-4"
            style={{ maxHeight: "80vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold" style={{ color: "var(--text-1)" }}>Controls</h3>
              <button onClick={() => setShowSidebar(false)} className="btn-ghost p-1"><X size={17} /></button>
            </div>
            {controlsPanel}
          </div>
        </div>
      )}

      {bulkRooms && (
        <BulkEmailModal
          rooms={bulkRooms}
          onClose={() => setBulkRooms(null)}
          onDone={n => { setBulkRooms(null); setBulkDone(n); setTimeout(() => setBulkDone(null), 4000) }}
        />
      )}
    </>
  )
}

export default function Page() {
  return <QueryClientProvider client={qc}><MapPage /></QueryClientProvider>
}
