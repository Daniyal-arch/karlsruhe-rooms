"use client"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { emailsApi, type EmailThread } from "@/lib/api"
import { useGmailCreds } from "@/components/Settings"
import { CheckCircle, XCircle, Clock, Mail, ChevronDown, ChevronUp, Inbox, TrendingUp } from "lucide-react"

const qc = new QueryClient()

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  sent:      { bg: "bg-blue-50",  text: "text-blue-700",  dot: "bg-blue-500",  label: "Sent" },
  replied:   { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", label: "Replied" },
  proceeded: { bg: "bg-green-50", text: "text-green-700", dot: "bg-green-500", label: "Proceeding" },
  declined:  { bg: "bg-gray-50",  text: "text-gray-500",  dot: "bg-gray-300",  label: "Declined" },
}

const REC_STYLE: Record<string, string> = {
  proceed: "text-green-700 bg-green-50",
  decline: "text-red-700 bg-red-50",
  needs_more_info: "text-amber-700 bg-amber-50",
}

function ThreadCard({ thread }: { thread: EmailThread }) {
  const qc = useQueryClient()
  const proceed = useMutation({ mutationFn: () => emailsApi.proceed(thread.id), onSuccess: () => qc.invalidateQueries({ queryKey: ["threads"] }) })
  const decline = useMutation({ mutationFn: () => emailsApi.decline(thread.id), onSuccess: () => qc.invalidateQueries({ queryKey: ["threads"] }) })
  const [expanded, setExpanded] = useState(false)
  const s = STATUS_CONFIG[thread.status] || STATUS_CONFIG.sent

  let analysis: Record<string, string> | null = null
  try { if (thread.ai_analysis) analysis = JSON.parse(thread.ai_analysis.replace(/'/g, '"')) } catch {}

  return (
    <div className="card overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${s.dot}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-gray-900 truncate">{thread.landlord_email}</span>
                  <span className={`badge ${s.bg} ${s.text}`}>{s.label}</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{thread.subject}</p>
              </div>
              {thread.sent_at && (
                <span className="text-xs text-gray-400 shrink-0 flex items-center gap-1">
                  <Clock size={11} />
                  {new Date(thread.sent_at).toLocaleDateString("en-GB")}
                </span>
              )}
            </div>

            {/* AI Analysis */}
            {analysis && (
              <div className={`mt-3 flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${REC_STYLE[analysis.recommendation] || "bg-gray-50 text-gray-600"}`}>
                <TrendingUp size={13} className="shrink-0 mt-0.5" />
                <span>
                  <strong className="capitalize">{analysis.recommendation?.replace(/_/g, " ")}</strong>
                  {analysis.reason && ` — ${analysis.reason}`}
                </span>
              </div>
            )}

            {/* Reply preview */}
            {thread.reply_body && (
              <div className="mt-3">
                <button
                  onClick={() => setExpanded(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 mb-2"
                >
                  {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {expanded ? "Hide reply" : "View landlord reply"}
                </button>
                {expanded && (
                  <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap">
                    {thread.reply_body}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            {thread.status === "replied" && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => proceed.mutate()}
                  className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
                >
                  <CheckCircle size={12} /> Proceed with this room
                </button>
                <button
                  onClick={() => decline.mutate()}
                  className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 text-xs px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <XCircle size={12} /> Decline
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function EmailsPage() {
  const { creds } = useGmailCreds()
  const [tab, setTab] = useState("")
  const { data: threads = [], isLoading } = useQuery({
    queryKey: ["threads", tab, creds.email],
    queryFn: () => emailsApi.threads(tab || undefined, creds.email || undefined),
  })

  const tabs = [
    { key: "", label: "All" },
    { key: "sent", label: "Sent" },
    { key: "replied", label: "Replied" },
    { key: "proceeded", label: "Proceeding" },
    { key: "declined", label: "Declined" },
  ]

  const counts = tabs.reduce((acc, t) => {
    acc[t.key] = t.key === "" ? threads.length : threads.filter(x => x.status === t.key).length
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Email Threads</h1>
        <p className="text-sm text-gray-500 mt-1">Track replies and AI analysis of landlord responses</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {tabs.slice(1).map(t => (
          <div key={t.key} className="card p-4 text-center cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setTab(t.key)}>
            <div className="text-2xl font-bold text-gray-900">{counts[t.key]}</div>
            <div className="text-xs text-gray-500 mt-1">{t.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            {t.label}
            {counts[t.key] > 0 && tab !== t.key && (
              <span className="ml-1.5 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{counts[t.key]}</span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
      ) : threads.length === 0 ? (
        <div className="card flex flex-col items-center py-16 text-gray-400">
          <Inbox size={32} className="mb-3 opacity-40" />
          <p className="font-medium">No email threads yet</p>
          <p className="text-sm mt-1">Contact landlords from the Rooms page</p>
        </div>
      ) : (
        <div className="space-y-3">
          {threads.map(t => <ThreadCard key={t.id} thread={t} />)}
        </div>
      )}
    </div>
  )
}

export default function Page() {
  return <QueryClientProvider client={qc}><EmailsPage /></QueryClientProvider>
}
