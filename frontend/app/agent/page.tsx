"use client"
import { useState, useRef, useEffect } from "react"
import { agentApi, type AgentMapPin } from "@/lib/api"
import { useGmailCreds } from "@/components/Settings"
import { Send, Bot, User, Loader2, Sparkles } from "lucide-react"
import dynamic from "next/dynamic"

const ChatMap = dynamic(() => import("@/components/ChatMap"), { ssr: false })

interface Message {
  role: "user" | "assistant"
  content: string
  map_pins?: AgentMapPin[]
}

const SUGGESTIONS = [
  "Find furnished rooms under €300",
  "Show all rooms on a map",
  "Which cities have the cheapest rooms?",
  "Email the 3 cheapest rooms with email contact",
]

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user"
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isUser ? "bg-indigo-600" : "bg-gray-100"}`}
        style={{ border: "1px solid var(--border)" }}
      >
        {isUser ? <User size={13} color="white" /> : <Bot size={13} style={{ color: "var(--text-2)" }} />}
      </div>
      <div className={`max-w-[82%] flex flex-col gap-2 ${isUser ? "items-end" : "items-start"}`}>
        <div
          className="px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap rounded-2xl"
          style={isUser ? {
            background: "var(--accent)",
            color: "white",
            borderTopRightRadius: "4px",
          } : {
            background: "white",
            color: "var(--text-1)",
            border: "1px solid var(--border)",
            borderTopLeftRadius: "4px",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          {msg.content}
        </div>
        {msg.map_pins && msg.map_pins.length > 0 && (
          <div className="w-full max-w-md">
            <ChatMap pins={msg.map_pins} />
          </div>
        )}
      </div>
    </div>
  )
}

export default function AgentPage() {
  const { creds } = useGmailCreds()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages, loading])

  const send = async (text?: string) => {
    const msg = (text || input).trim()
    if (!msg || loading) return
    const next: Message[] = [...messages, { role: "user", content: msg }]
    setMessages(next)
    setInput("")
    setLoading(true)
    try {
      const history = next.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
      const data = await agentApi.chat(msg, history, creds.email, "")
      setMessages(prev => [...prev, { role: "assistant", content: data.reply, map_pins: data.map_pins || undefined }])
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong. Please try again." }])
    }
    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-10rem)]">
      {/* Header */}
      <div className="card p-4 mb-4 flex items-center gap-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)", boxShadow: "0 4px 12px rgba(79,70,229,0.3)" }}
        >
          <Sparkles size={18} color="white" />
        </div>
        <div className="flex-1">
          <h1 className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>AI Room Finder</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
            DeepSeek · Searches live listings · Sends emails · Shows maps
          </p>
        </div>
        <div
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full shrink-0 ${creds.email ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-400"}`}
        >
          <div className={`w-1.5 h-1.5 rounded-full ${creds.email ? "bg-emerald-500" : "bg-gray-300"}`} />
          <span className="hidden sm:inline">{creds.email ? "Gmail connected" : "No Gmail — set in Settings"}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-center text-sm py-4" style={{ color: "var(--text-3)" }}>
              Ask me anything — I can search rooms, show maps, and send emails
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="card text-left px-4 py-3 text-sm hover:shadow-md transition-all"
                  style={{ color: "var(--text-2)" }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}
        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0" style={{ border: "1px solid var(--border)" }}>
              <Bot size={13} style={{ color: "var(--text-2)" }} />
            </div>
            <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white" style={{ border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
              <Loader2 size={15} className="animate-spin" style={{ color: "var(--text-3)" }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="pt-4 pb-1">
        <div
          className="flex items-center gap-3 p-2 pl-4 rounded-xl bg-white"
          style={{ border: "1px solid var(--border-strong)", boxShadow: "var(--shadow-md)" }}
        >
          <input
            ref={inputRef}
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: "var(--text-1)" }}
            placeholder="Search rooms, show on map, send emails…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          />
          <button onClick={() => send()} disabled={loading || !input.trim()} className="btn-primary py-2 px-3 shrink-0">
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
