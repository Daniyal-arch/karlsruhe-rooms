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
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isUser ? "bg-blue-600" : "bg-gray-800"}`}>
        {isUser ? <User size={14} className="text-white" /> : <Bot size={14} className="text-white" />}
      </div>
      <div className={`max-w-[82%] flex flex-col gap-2 ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap rounded-2xl ${
            isUser
              ? "bg-blue-600 text-white rounded-tr-sm"
              : "bg-white border text-gray-800 rounded-tl-sm"
          }`}
          style={isUser ? {} : { border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}
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
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.reply,
        map_pins: data.map_pins || undefined,
      }])
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Something went wrong. Please try again." }])
    }
    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="card p-4 mb-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--text-1)" }}>
          <Sparkles size={18} className="text-white" />
        </div>
        <div className="flex-1">
          <h1 className="font-semibold" style={{ color: "var(--text-1)" }}>AI Room Finder</h1>
          <p className="text-sm" style={{ color: "var(--text-3)" }}>DeepSeek · Searches live listings · Sends emails · Shows maps</p>
        </div>
        <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${creds.email ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${creds.email ? "bg-green-500" : "bg-gray-300"}`} />
          {creds.email ? "Gmail connected" : "No Gmail — set in ⚙"}
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
            <div className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center shrink-0">
              <Bot size={14} className="text-white" />
            </div>
            <div className="px-4 py-3 rounded-2xl rounded-tl-sm" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
              <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-3)" }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="pt-4 pb-2">
        <div className="flex items-center gap-3 p-2 pl-4 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow-md)" }}>
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
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
