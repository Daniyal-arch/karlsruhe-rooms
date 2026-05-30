"use client"
import { useState, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { roomsApi, emailsApi, agentApi, type Room } from "@/lib/api"
import RoomCard from "@/components/RoomCard"
import BulkEmailModal from "@/components/BulkEmailModal"
import { useGmailCreds } from "@/components/Settings"
import {
  Search, Mail, X, CheckSquare, LayoutGrid, List, Loader2, Sparkles, RefreshCw
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
    if (!creds.email) {
      alert("Enter your email in Settings (⚙) and connect Gmail first.")
      return
    }
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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Contact Landlord</h2>
            <p className="text-sm text-gray-500 mt-0.5">{room.email?.split(";")[0]} · €{room.rent_eur}/mo · {room.city}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          {sent ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Mail size={22} className="text-green-600" />
              </div>
              <p className="font-medium text-gray-900">Email sent!</p>
              <p className="text-sm text-gray-500 mt-1">Check Emails tab to track the response.</p>
            </div>
          ) : (
            <>
              {/* AI Draft area */}
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3 space-y-2">
                <p className="text-xs font-medium text-gray-600 flex items-center gap-1.5"><Sparkles size={13} className="text-indigo-500" /> Tell AI how to write it</p>
                <div className="flex gap-2">
                  <input
                    className="input bg-white text-sm flex-1"
                    placeholder="e.g. Formal German · Mention I am a KIT student · I can move in immediately"
                    value={aiInstruction}
                    onChange={e => setAiInstruction(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && refineWithAI()}
                  />
                  <button onClick={refineWithAI} disabled={aiLoading} className="btn-primary shrink-0">
                    {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  </button>
                </div>
              </div>

              <textarea
                className="input h-40 resize-none text-sm leading-relaxed"
                placeholder="Email body will appear here after AI generates it, or type directly…"
                value={draft}
                onChange={e => setDraft(e.target.value)}
              />
              <button onClick={send} disabled={!draft || loading} className="btn-primary w-full justify-center">
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={15} />}
                Send from {creds.email || "your Gmail (set in ⚙️ Settings)"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Filters({ filters, onChange }: { filters: any; onChange: (f: any) => void }) {
  const set = (key: string, val: any) => onChange({ ...filters, [key]: val })

  return (
    <aside className="w-64 shrink-0">
      <div className="card p-5 space-y-5 sticky top-20">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm text-gray-900">Filters</span>
          <button onClick={() => onChange({ city: "", maxRent: 400, minRent: 0, setup: "", hasEmail: false })}
            className="text-xs text-blue-600 hover:underline">Reset</button>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">City</label>
          <input className="input" placeholder="e.g. Berlin, München…" value={filters.city} onChange={e => set("city", e.target.value)} />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Rent Range</label>
          <div className="flex items-center gap-2">
            <input type="number" className="input text-center" placeholder="Min" value={filters.minRent || ""} onChange={e => set("minRent", e.target.value ? Number(e.target.value) : 0)} />
            <span className="text-gray-400 text-sm shrink-0">–</span>
            <input type="number" className="input text-center" placeholder="Max" value={filters.maxRent || ""} onChange={e => set("maxRent", e.target.value ? Number(e.target.value) : 400)} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Furnishing</label>
          <div className="flex flex-col gap-1.5">
            {["", "möbliert", "teilmöbliert", "unmöbliert"].map(v => (
              <button
                key={v}
                onClick={() => set("setup", v)}
                className={`text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${filters.setup === v ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
              >
                {v || "Any"}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm text-gray-700">Email contacts only</span>
          <button
            onClick={() => set("hasEmail", !filters.hasEmail)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${filters.hasEmail ? "bg-blue-600" : "bg-gray-200"}`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${filters.hasEmail ? "translate-x-4.5" : "translate-x-0.5"}`} />
          </button>
        </label>
      </div>
    </aside>
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

  return (
    <div className="flex gap-6">
      <Filters filters={filters} onChange={f => { setFilters(f); setApplied(f) }} />

      <div className="flex-1 min-w-0 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9 bg-white" placeholder="Search across Germany — city, street, email…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button onClick={() => setApplied({ ...filters })} className="btn-primary shrink-0">
            <Search size={14} /> Search
          </button>
          <button
            onClick={() => { setSelectMode(v => !v); setSelected(new Set()) }}
            className={`btn-secondary shrink-0 ${selectMode ? "bg-blue-50 border-blue-200 text-blue-700" : ""}`}
          >
            <CheckSquare size={14} /> {selectMode ? "Cancel" : "Select"}
          </button>
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={() => setView("grid")} className={`p-2 ${view === "grid" ? "bg-gray-100" : "hover:bg-gray-50"}`}><LayoutGrid size={15} /></button>
            <button onClick={() => setView("list")} className={`p-2 ${view === "list" ? "bg-gray-100" : "hover:bg-gray-50"}`}><List size={15} /></button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            {isLoading ? "Loading…" : `${filtered.length} rooms found`}
            {selected.size > 0 && <span className="ml-2 text-blue-600 font-medium">{selected.size} selected</span>}
          </span>
          {bulkDone !== null && (
            <span className="text-green-600 font-medium text-sm">✓ {bulkDone} emails sent!</span>
          )}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-20 text-gray-400">
            <Search size={32} className="mb-3 opacity-40" />
            <p className="font-medium">No rooms found</p>
            <p className="text-sm mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className={view === "grid" ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4" : "flex flex-col gap-3"}>
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30">
          <div className="bg-gray-900 text-white rounded-2xl shadow-2xl px-6 py-3 flex items-center gap-4">
            <span className="text-sm font-medium">{selected.size} room{selected.size > 1 ? "s" : ""} selected</span>
            <button onClick={() => setBulkModal(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors">
              <Mail size={14} /> Send Bulk Email
            </button>
            <button onClick={() => { setSelected(new Set()); setSelectMode(false) }} className="text-gray-400 hover:text-white transition-colors">
              <X size={16} />
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
