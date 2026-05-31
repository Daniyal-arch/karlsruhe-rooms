"use client"
import { useState, useEffect } from "react"
import { X, Mail, CheckCircle2, Loader2, LogOut, ExternalLink } from "lucide-react"
import api from "@/lib/api"

const EMAIL_KEY = "studinest_user_email"
const CONNECTED_KEY = "studinest_gmail_connected"

export function useUserEmail() {
  const [email, setEmailState] = useState("")
  const [gmailConnected, setGmailConnected] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(EMAIL_KEY) || ""
    const connected = localStorage.getItem(CONNECTED_KEY) === "true"
    setEmailState(saved)
    setGmailConnected(connected)
  }, [])

  const setEmail = (e: string) => {
    setEmailState(e)
    localStorage.setItem(EMAIL_KEY, e)
  }
  const setConnected = (v: boolean) => {
    setGmailConnected(v)
    localStorage.setItem(CONNECTED_KEY, String(v))
  }

  return { email, setEmail, gmailConnected, setConnected }
}

export function useGmailCreds() {
  const { email, gmailConnected } = useUserEmail()
  return { creds: { email, password: "", connected: gmailConnected } }
}

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { email, setEmail, gmailConnected, setConnected } = useUserEmail()
  const [inputEmail, setInputEmail] = useState(email)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "gmail_connected") {
        setEmail(event.data.email)
        setConnected(true)
        setConnecting(false)
      }
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [])

  useEffect(() => {
    if (!email) return
    api.get(`/auth/gmail/status?email=${encodeURIComponent(email)}`)
      .then(r => setConnected(r.data.connected))
      .catch(() => {})
  }, [email])

  const connectGmail = async () => {
    if (!inputEmail.trim()) return
    setEmail(inputEmail.trim())
    setConnecting(true)
    try {
      const { data } = await api.get(`/auth/gmail?email=${encodeURIComponent(inputEmail.trim())}`)
      const popup = window.open(data.url, "Connect Gmail", "width=600,height=700,left=300,top=100")
      if (!popup) { alert("Popup blocked — please allow popups for this site."); setConnecting(false) }
    } catch { setConnecting(false) }
  }

  const disconnect = async () => {
    await api.delete(`/auth/gmail/disconnect?email=${encodeURIComponent(email)}`)
    setConnected(false)
    localStorage.removeItem(CONNECTED_KEY)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white p-6 space-y-5 rounded-t-2xl sm:rounded-2xl"
        style={{ boxShadow: "var(--shadow-xl)", border: "1px solid var(--border)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--text-1)" }}>Settings</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
              Connect Gmail to send emails from your account
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={17} /></button>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-2)" }}>
            Your Email Address
          </label>
          <div className="relative">
            <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
            <input
              className="input pl-9"
              placeholder="you@gmail.com"
              value={inputEmail}
              onChange={e => setInputEmail(e.target.value)}
              onBlur={() => inputEmail && setEmail(inputEmail)}
            />
          </div>
        </div>

        <div
          className="rounded-xl p-4"
          style={{
            background: gmailConnected ? "var(--green-dim)" : "var(--surface-2)",
            border: `1px solid ${gmailConnected ? "#a7f3d0" : "var(--border)"}`,
          }}
        >
          {gmailConnected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={18} style={{ color: "var(--green)" }} className="shrink-0" />
                <div>
                  <p className="font-medium text-sm" style={{ color: "var(--text-1)" }}>Gmail connected</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                    {email} · Emails sent from your account
                  </p>
                </div>
              </div>
              <button onClick={disconnect} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-3)" }}>
                <LogOut size={12} /> Disconnect
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="font-medium text-sm" style={{ color: "var(--text-2)" }}>Not connected</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
                  Connect Gmail so emails come directly from your account — no passwords needed.
                </p>
              </div>
              <button onClick={connectGmail} disabled={connecting || !inputEmail.trim()} className="btn-primary w-full justify-center">
                {connecting
                  ? <><Loader2 size={14} className="animate-spin" /> Waiting for Google…</>
                  : <><ExternalLink size={14} /> Connect Gmail</>}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-1" style={{ color: "var(--text-3)" }}>
          <p className="text-xs font-medium" style={{ color: "var(--text-2)" }}>How it works</p>
          <p className="text-xs">1. Click Connect Gmail → Google login popup opens</p>
          <p className="text-xs">2. Sign in and allow StudiBase to send emails</p>
          <p className="text-xs">3. Done — landlords receive emails from your Gmail directly</p>
        </div>

        <button onClick={onClose} className="btn-secondary w-full justify-center">Done</button>
      </div>
    </div>
  )
}
