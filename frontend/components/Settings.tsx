"use client"
import { useState, useEffect } from "react"
import { Settings, X, Mail, CheckCircle2, Loader2, LogOut, ExternalLink } from "lucide-react"
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

// Legacy compat — other components import useGmailCreds
export function useGmailCreds() {
  const { email, gmailConnected } = useUserEmail()
  return { creds: { email, password: "", connected: gmailConnected } }
}

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { email, setEmail, gmailConnected, setConnected } = useUserEmail()
  const [inputEmail, setInputEmail] = useState(email)
  const [connecting, setConnecting] = useState(false)
  const [checking, setChecking] = useState(false)

  // Listen for OAuth popup success message
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

  // Check connection status on open
  useEffect(() => {
    if (!email) return
    setChecking(true)
    api.get(`/auth/gmail/status?email=${encodeURIComponent(email)}`)
      .then(r => setConnected(r.data.connected))
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [email])

  const connectGmail = async () => {
    if (!inputEmail.trim()) return
    setEmail(inputEmail.trim())
    setConnecting(true)
    try {
      const { data } = await api.get(`/auth/gmail?email=${encodeURIComponent(inputEmail.trim())}`)
      const popup = window.open(data.url, "Connect Gmail", "width=600,height=700,left=300,top=100")
      if (!popup) {
        alert("Popup blocked — please allow popups for this site.")
        setConnecting(false)
      }
    } catch {
      setConnecting(false)
    }
  }

  const disconnect = async () => {
    await api.delete(`/auth/gmail/disconnect?email=${encodeURIComponent(email)}`)
    setConnected(false)
    localStorage.removeItem(CONNECTED_KEY)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
            <p className="text-sm text-gray-500 mt-0.5">Connect Gmail to send emails directly from your account</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>

        <div className="space-y-5">
          {/* Email input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Your Email Address</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="input pl-9"
                placeholder="you@gmail.com"
                value={inputEmail}
                onChange={e => setInputEmail(e.target.value)}
                onBlur={() => inputEmail && setEmail(inputEmail)}
              />
            </div>
          </div>

          {/* Gmail connection status */}
          <div className={`rounded-xl p-4 border ${gmailConnected ? "bg-green-50 border-green-100" : "bg-gray-50 border-gray-100"}`}>
            {gmailConnected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={20} className="text-green-600 shrink-0" />
                  <div>
                    <p className="font-medium text-sm text-gray-900">Gmail connected</p>
                    <p className="text-xs text-gray-500 mt-0.5">{email} · Emails sent directly from your account</p>
                  </div>
                </div>
                <button onClick={disconnect} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 transition-colors">
                  <LogOut size={13} /> Disconnect
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="font-medium text-sm text-gray-700">Not connected</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Connect Gmail so emails come directly from your account — no passwords, no app setup.
                    One click, works forever.
                  </p>
                </div>
                <button
                  onClick={connectGmail}
                  disabled={connecting || !inputEmail.trim()}
                  className="btn-primary w-full justify-center"
                >
                  {connecting ? (
                    <><Loader2 size={15} className="animate-spin" /> Waiting for Google…</>
                  ) : (
                    <><ExternalLink size={15} /> Connect Gmail</>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* How it works */}
          <div className="text-xs text-gray-400 space-y-1">
            <p className="font-medium text-gray-500">How it works</p>
            <p>1. Click Connect Gmail → Google login popup opens</p>
            <p>2. Sign in and allow StudiBase to send emails</p>
            <p>3. Done — landlords receive emails from your Gmail directly</p>
            <p className="text-gray-300 pt-1">We only request permission to send. We cannot read your emails.</p>
          </div>
        </div>

        <button onClick={onClose} className="btn-secondary w-full justify-center mt-5">Done</button>
      </div>
    </div>
  )
}
