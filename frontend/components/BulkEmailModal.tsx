"use client"
import { useState } from "react"
import { X, Send, Wand2, ChevronDown, Sparkles, Loader2, RefreshCw } from "lucide-react"
import { emailsApi, agentApi, type Room } from "@/lib/api"
import { useGmailCreds } from "./Settings"

interface Props {
  rooms: Room[]
  onClose: () => void
  onDone: (count: number) => void
}

const TEMPLATES = [
  {
    name: "Formal German",
    subject: "Zimmeranfrage – {city}",
    body: `Sehr geehrte Damen und Herren,

mit großem Interesse habe ich Ihre Zimmeranzeige gelesen. Ich bin Student/Studentin und suche dringend ein Zimmer in {city} für {rent} €/Monat.

Ich würde mich sehr über die Möglichkeit einer Besichtigung freuen und stehe für Rückfragen jederzeit zur Verfügung.

Mit freundlichen Grüßen`,
  },
  {
    name: "Friendly German",
    subject: "Interesse an Ihrem Zimmer in {city}",
    body: `Hallo,

ich habe Ihre Anzeige gefunden und bin sehr interessiert! Ich bin Student und suche ein Zimmer in {city} für ca. {rent} €/Monat.

Wäre eine Besichtigung möglich? Ich bin zeitlich sehr flexibel.

Viele Grüße`,
  },
  {
    name: "English",
    subject: "Room inquiry – {city}",
    body: `Hi,

I came across your listing and I'm very interested in the room in {city} at €{rent}/month.

I'm a student looking for accommodation as soon as possible. Would it be possible to arrange a viewing at your convenience?

Best regards`,
  },
]

export default function BulkEmailModal({ rooms, onClose, onDone }: Props) {
  const { creds } = useGmailCreds()
  const [subject, setSubject] = useState(TEMPLATES[0].subject)
  const [body, setBody] = useState(TEMPLATES[0].body)
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [showTemplates, setShowTemplates] = useState(false)
  const [aiInstruction, setAiInstruction] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiHistory, setAiHistory] = useState<{ role: string; content: string }[]>([])

  const roomsWithEmail = rooms.filter(r => r.email)

  const preview = (text: string, room: Room) =>
    text
      .replace(/\{city\}/g, room.city || "")
      .replace(/\{rent\}/g, String(room.rent_eur || ""))
      .replace(/\{street\}/g, room.street || "")

  const refineWithAI = async () => {
    if (!aiInstruction.trim()) return
    setAiLoading(true)
    const prompt = `Here is my current email draft:\n\nSubject: ${subject}\n\nBody:\n${body}\n\n---\nInstruction: ${aiInstruction}\n\nRewrite the email following the instruction. Return ONLY the updated body text, no subject line, no explanation.`
    const { reply } = await agentApi.chat(prompt, aiHistory)
    const newHistory = [
      ...aiHistory,
      { role: "user", content: prompt },
      { role: "assistant", content: reply },
    ]
    setAiHistory(newHistory)
    setBody(reply)
    setAiInstruction("")
    setAiLoading(false)
  }

  const send = async () => {
    if (!creds.email) {
      alert("Enter your email in Settings (⚙ gear icon) and connect Gmail first.")
      return
    }
    setSending(true)
    let sent = 0
    for (const room of roomsWithEmail) {
      try {
        await emailsApi.send({
          room_id: room.id,
          subject: preview(subject, room),
          body: preview(body, room),
          landlord_email: room.email!.split(";")[0].trim(),
          smtp_email: creds.email,
        })
        sent++
      } catch {}
      setProgress(Math.round((sent / roomsWithEmail.length) * 100))
    }
    setSending(false)
    onDone(sent)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[99999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Compose & Send</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              <span className="text-blue-600 font-medium">{roomsWithEmail.length} landlords</span>
              {rooms.length > roomsWithEmail.length && ` · ${rooms.length - roomsWithEmail.length} skipped (no email)`}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Template picker */}
          <div className="relative">
            <button onClick={() => setShowTemplates(v => !v)} className="btn-secondary w-full justify-between text-sm">
              <span className="flex items-center gap-2"><Wand2 size={14} />Load template</span>
              <ChevronDown size={14} className={showTemplates ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>
            {showTemplates && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-10 divide-y divide-gray-50">
                {TEMPLATES.map(t => (
                  <button key={t.name} className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors first:rounded-t-xl last:rounded-b-xl"
                    onClick={() => { setSubject(t.subject); setBody(t.body); setShowTemplates(false); setAiHistory([]) }}>
                    <div className="font-medium text-gray-800">{t.name}</div>
                    <div className="text-gray-400 text-xs mt-0.5 truncate">{t.subject}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Variables hint */}
          <div className="flex items-center gap-3 bg-blue-50 rounded-lg px-4 py-2.5 text-xs text-blue-700">
            <span className="font-medium shrink-0">Variables:</span>
            {["{city}", "{rent}", "{street}"].map(v => (
              <code key={v} className="bg-blue-100 px-1.5 py-0.5 rounded font-mono">{v}</code>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Subject</label>
            <input className="input" value={subject} onChange={e => setSubject(e.target.value)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Body</label>
            <textarea className="input h-36 resize-none text-sm leading-relaxed" value={body} onChange={e => setBody(e.target.value)} />
          </div>

          {/* AI Refinement */}
          <div className="border border-indigo-100 bg-indigo-50/40 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Sparkles size={15} className="text-indigo-500" />
              Refine with AI
            </div>
            <p className="text-xs text-gray-500">Tell the AI how to adjust the email — it rewrites the body for you.</p>
            <div className="flex gap-2">
              <input
                className="input bg-white flex-1 text-sm"
                placeholder="e.g. Make it more formal · Mention I am a KIT master student · I can move in immediately"
                value={aiInstruction}
                onChange={e => setAiInstruction(e.target.value)}
                onKeyDown={e => e.key === "Enter" && refineWithAI()}
              />
              <button onClick={refineWithAI} disabled={aiLoading || !aiInstruction.trim()} className="btn-primary shrink-0">
                {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              </button>
            </div>
            {aiHistory.length > 0 && (
              <button onClick={() => { setAiHistory([]); setAiInstruction("") }} className="text-xs text-gray-400 hover:text-gray-600">
                Clear AI history
              </button>
            )}
          </div>

          {/* Preview */}
          {roomsWithEmail[0] && (
            <details className="group">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 flex items-center gap-1.5 list-none">
                <ChevronDown size={13} className="group-open:rotate-180 transition-transform" />
                Preview for {roomsWithEmail[0].city} — {roomsWithEmail[0].email?.split(";")[0]}
              </summary>
              <div className="mt-2 bg-gray-50 rounded-lg p-4 border border-gray-100 text-sm">
                <div className="font-medium text-gray-700 mb-2">{preview(subject, roomsWithEmail[0])}</div>
                <pre className="whitespace-pre-wrap text-gray-600 font-sans text-sm leading-relaxed">{preview(body, roomsWithEmail[0])}</pre>
              </div>
            </details>
          )}

          {/* Progress */}
          {sending && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Sending emails…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={send} disabled={sending || roomsWithEmail.length === 0} className="btn-primary flex-1 justify-center text-sm">
            <Send size={14} />
            {sending ? "Sending…" : `Send to ${roomsWithEmail.length} landlord${roomsWithEmail.length !== 1 ? "s" : ""}`}
          </button>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  )
}
