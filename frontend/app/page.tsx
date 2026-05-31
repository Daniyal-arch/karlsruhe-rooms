"use client"
import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { roomsApi, emailsApi, agentApi, type Room } from "@/lib/api"
import RoomCard from "@/components/RoomCard"
import BulkEmailModal from "@/components/BulkEmailModal"
import { useGmailCreds } from "@/components/Settings"
import {
  Search, Mail, X, CheckSquare, LayoutGrid, List,
  Loader2, Sparkles, RefreshCw, SlidersHorizontal
} from "lucide-react"

const qc = new QueryClient()

function SingleEmailModal({ room, onClose }: { room: Room; onClose: () => void }) {
  const { creds } = useGmailCreds()
  const [draft, setDraft] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [aiInstruction, setAiInstruction] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiHistory, setAiHistory] = useState<{ role: string; content: string }[]>([])

  const loadDraft = async () => {
    setLoading(true)
    const r = await emailsApi.draft(room.id, creds.email || "")
    setDraft(r.draft)
    setLoading(false)
  }

  const refineWithAI = async () => {
    if (!aiInstruction.trim() && !draft) return
    setAiLoading(true)
    const prompt = draft
      ? `Here is my current email draft:\n\n${draft}\n\n---\nInstruction: ${aiInstruction || "Make it professional and polite"}\n\nRewrite the email following the instruction. Return ONLY the updated body text.`
      : `Write a room inquiry email for a room in ${room.city || "Germany"} costing €${room.rent_eur}/month. Instruction: ${aiInstruction}. Return ONLY the email body.`
    const { reply } = await agentApi.chat(prompt, aiHistory)
    setAiHistory(prev => [...prev, { role: "user", content: prompt }, { role: "assistant", content: reply }])
    setDraft(reply)
    setAiInstruction("")
    setAiLoading(false)
  }

  const send = async () => {
    if (!creds.email) { alert("Enter your email in Settings and connect Gmail first."); return }
    setLoading(true)
    await emailsApi.send({
      room_id: room.id,
      subject: `Zimmeranfrage – ${room.city || ""}`,
      body: draft,
      landlord_email: room.email!.split(";")[0].trim(),
      smtp_email: creds.email,
    })
    setLoading(false)
    setSent(true)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ background: "rgba(12,14,26,0.98)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "var(--shadow-xl)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <h2 className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>Contact Landlord</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
              {room.email?.split(";")[0]} · €{room.rent_eur}/mo · {room.city}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={17} /></button>
        </div>
        <div className="p-5 space-y-4">
          {sent ? (
            <div className="text-center py-8">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ background: "var(--green-dim)" }}
              >
                <Mail size={20} style={{ color: "var(--green)" }} />
              </div>
              <p className="font-semibold" style={{ color: "var(--text-1)" }}>Email sent!</p>
              <p className="text-sm mt-1" style={{ color: "var(--text-3)" }}>Check the Emails tab to track responses.</p>
            </div>
          ) : (
            <>
              <div
                className="rounded-xl p-3 space-y-2"
                style={{ background: "rgba(124,111,247,0.07)", border: "1px solid rgba(124,111,247,0.15)" }}
              >
                <p className="text-xs font-medium flex items-center gap-1.5" style={{ color: "var(--text-2)" }}>
                  <Sparkles size={12} style={{ color: "var(--accent)" }} />
                  Tell AI how to write it
                </p>
                <div className="flex gap-2">
                  <input
                    className="input text-sm flex-1"
                    placeholder="e.g. Formal German · KIT student · Move in immediately"
                    value={aiInstruction}
                    onChange={e => setAiInstruction(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && refineWithAI()}
                  />
                  <button onClick={refineWithAI} disabled={aiLoading} className="btn-primary shrink-0 px-3">
                    {aiLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  </button>
                </div>
                {!draft && (
                  <button onClick={loadDraft} disabled={loading} className="text-xs" style={{ color: "var(--accent)" }}>
                    {loading ? "Generating…" : "or auto-generate draft"}
                  </button>
                )}
              </div>
              <textarea
                className="input h-40 resize-none text-sm leading-relaxed"
                placeholder="Email body — AI will generate or type directly…"
                value={draft}
                onChange={e => setDraft(e.target.value)}
              />
              <button onClick={send} disabled={!draft || loading} className="btn-primary w-full justify-center">
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                Send from {creds.email || "your Gmail (set in Settings)"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function FiltersPanel({ filters, onChange, onClose }: { filters: any; onChange: (f: any) => void; onClose?: () => void }) {
  const set = (key: string, val: any) => onChange({ ...filters, [key]: val })
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>Filters</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onChange({ city: "", maxRent: 400, minRent: 0, setup: "", hasEmail: false })}
            className="text-xs" style={{ color: "var(--accent)" }}
          >
            Reset
          </button>
          {onClose && <button onClick={onClose} className="btn-ghost p-1"><X size={15} /></button>}
        </div>
      </div>

      <div>
        <label className="section-label block mb-2">City</label>
        <input className="input" placeholder="e.g. Berlin, Karlsruhe…" value={filters.city} onChange={e => set("city", e.target.value)} />
      </div>

      <div>
        <label className="section-label block mb-2">Rent Range (€/mo)</label>
        <div className="flex items-center gap-2">
          <input type="number" className="input text-center" placeholder="Min" value={filters.minRent || ""} onChange={e => set("minRent", e.target.value ? Number(e.target.value) : 0)} />
          <span style={{ color: "var(--text-3)" }} className="text-sm shrink-0">–</span>
          <input type="number" className="input text-center" placeholder="Max" value={filters.maxRent || ""} onChange={e => set("maxRent", e.target.value ? Number(e.target.value) : 400)} />
        </div>
      </div>

      <div>
        <label className="section-label block mb-2">Furnishing</label>
        <div className="flex flex-col gap-1.5">
          {["", "möbliert", "teilmöbliert", "unmöbliert"].map(v => (
            <button
              key={v}
              onClick={() => set("setup", v)}
              className="text-left px-3 py-2 rounded-lg text-sm transition-all"
              style={{
                background: filters.setup === v ? "rgba(124,111,247,0.15)" : "rgba(255,255,255,0.03)",
                color: filters.setup === v ? "var(--accent)" : "var(--text-2)",
                border: `1px solid ${filters.setup === v ? "rgba(124,111,247,0.3)" : "var(--border)"}`,
                fontWeight: filters.setup === v ? 600 : 400,
              }}
            >
              {v || "Any"}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center justify-between cursor-pointer">
        <span className="text-sm" style={{ color: "var(--text-2)" }}>Email contacts only</span>
        <button
          onClick={() => set("hasEmail", !filters.hasEmail)}
          className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0"
          style={{ background: filters.hasEmail ? "var(--accent)" : "rgba(255,255,255,0.1)" }}
        >
          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${filters.hasEmail ? "translate-x-4.5" : "translate-x-0.5"}`} />
        </button>
      </label>
    </div>
  )
}

function RoomsContent() {
  const [filters, setFilters] = useState({ city: "", maxRent: 400, minRent: 0, setup: "", hasEmail: false })
  const [applied, setApplied] = useState(filters)
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [emailRoom, setEmailRoom] = useState<Room | null>(null)
  const [bulkModal, setBulkModal] = useState(false)
  const [bulkDone, setBulkDone] = useState<number | null>(null)
  const [view, setView] = useState<"grid" | "list">("grid")
  const [mobileFilters, setMobileFilters] = useState(false)

  const { data: rooms = [], isLoading } = useQuery({
    queryKey: ["rooms", applied],
    queryFn: () => roomsApi.list({
      ...(applied.city && { city: applied.city }),
      max_rent: applied.maxRent,
      ...(applied.minRent && { min_rent: applied.minRent }),
      ...(applied.setup && { setup: applied.setup }),
      ...(applied.hasEmail && { has_email: true }),
    }),
  })

  const filtered = useMemo(() =>
    search ? rooms.filter(r =>
      [r.city, r.street, r.email, r.zip_code, r.district]
        .join(" ").toLowerCase().includes(search.toLowerCase())
    ) : rooms,
    [rooms, search]
  )

  const selectedRooms = filtered.filter(r => selected.has(r.id))

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBulkDone = (count: number) => {
    setBulkModal(false)
    setBulkDone(count)
    setSelected(new Set())
    setSelectMode(false)
    setTimeout(() => setBulkDone(null), 4000)
  }

  const applyAndClose = (f: any) => {
    setFilters(f)
    setApplied(f)
    setMobileFilters(false)
  }

  return (
    <div className="flex gap-5">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-60 shrink-0">
        <div className="card p-5 sticky top-20">
          <FiltersPanel filters={filters} onChange={f => { setFilters(f); setApplied(f) }} />
        </div>
      </aside>

      <div className="flex-1 min-w-0 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
            <input
              className="input pl-9"
              placeholder="Search city, street, email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Mobile filter button */}
          <button
            onClick={() => setMobileFilters(true)}
            className="lg:hidden btn-secondary shrink-0 gap-1.5"
          >
            <SlidersHorizontal size={14} />
            <span className="hidden sm:inline">Filters</span>
          </button>

          <button
            onClick={() => { setSelectMode(v => !v); setSelected(new Set()) }}
            className={`btn-secondary shrink-0 ${selectMode ? "!border-indigo-500/30 !text-indigo-400" : ""}`}
            style={selectMode ? { background: "rgba(124,111,247,0.1)" } : {}}
          >
            <CheckSquare size={14} />
            <span className="hidden sm:inline">{selectMode ? "Cancel" : "Select"}</span>
          </button>

          <div
            className="flex rounded-lg overflow-hidden shrink-0"
            style={{ border: "1px solid var(--border-strong)" }}
          >
            <button
              onClick={() => setView("grid")}
              className="p-2 transition-colors"
              style={{ background: view === "grid" ? "var(--surface-2)" : "transparent", color: view === "grid" ? "var(--text-1)" : "var(--text-3)" }}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setView("list")}
              className="p-2 transition-colors"
              style={{ background: view === "list" ? "var(--surface-2)" : "transparent", color: view === "list" ? "var(--text-1)" : "var(--text-3)" }}
            >
              <List size={14} />
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center justify-between text-sm" style={{ color: "var(--text-3)" }}>
          <span>
            {isLoading ? "Loading…" : `${filtered.length} rooms found`}
            {selected.size > 0 && (
              <span className="ml-2 font-medium" style={{ color: "var(--accent)" }}>{selected.size} selected</span>
            )}
          </span>
          {bulkDone !== null && (
            <span className="font-medium text-sm" style={{ color: "var(--green)" }}>
              {bulkDone} emails sent!
            </span>
          )}
        </div>

        {/* Room grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24" style={{ color: "var(--text-3)" }}>
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-20" style={{ color: "var(--text-3)" }}>
            <Search size={32} className="mb-3 opacity-30" />
            <p className="font-medium" style={{ color: "var(--text-2)" }}>No rooms found</p>
            <p className="text-sm mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className={view === "grid"
            ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
            : "flex flex-col gap-3"
          }>
            {filtered.map(room => (
              <RoomCard
                key={room.id}
                room={room}
                selected={selected.has(room.id)}
                onSelect={selectMode ? toggleSelect : undefined}
                onEmail={selectMode ? undefined : setEmailRoom}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-30">
          <div
            className="flex items-center gap-4 px-5 py-3 rounded-2xl"
            style={{
              background: "rgba(12,14,26,0.95)",
              border: "1px solid var(--border-strong)",
              boxShadow: "var(--shadow-xl)",
              backdropFilter: "blur(16px)",
            }}
          >
            <span className="text-sm font-medium" style={{ color: "var(--text-1)" }}>
              {selected.size} room{selected.size > 1 ? "s" : ""} selected
            </span>
            <button onClick={() => setBulkModal(true)} className="btn-primary text-sm py-1.5">
              <Mail size={13} /> Bulk Email
            </button>
            <button onClick={() => { setSelected(new Set()); setSelectMode(false) }} className="btn-ghost p-1">
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Mobile filter drawer */}
      {mobileFilters && (
        <div
          className="fixed inset-0 z-50 flex items-end lg:hidden"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
          onClick={() => setMobileFilters(false)}
        >
          <div
            className="w-full rounded-t-2xl p-5"
            style={{ background: "rgba(12,14,26,0.98)", border: "1px solid rgba(255,255,255,0.08)", maxHeight: "85vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}
          >
            <FiltersPanel
              filters={filters}
              onChange={f => setFilters(f)}
              onClose={() => setMobileFilters(false)}
            />
            <button
              onClick={() => applyAndClose(filters)}
              className="btn-primary w-full justify-center mt-5"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {emailRoom && <SingleEmailModal room={emailRoom} onClose={() => setEmailRoom(null)} />}
      {bulkModal && <BulkEmailModal rooms={selectedRooms} onClose={() => setBulkModal(false)} onDone={handleBulkDone} />}
    </div>
  )
}

export default function Page() {
  return (
    <QueryClientProvider client={qc}>
      <RoomsContent />
    </QueryClientProvider>
  )
}
