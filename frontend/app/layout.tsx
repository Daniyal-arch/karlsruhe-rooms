"use client"
import "./globals.css"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Home, Map, Mail, Bot, Settings } from "lucide-react"
import SettingsModal from "@/components/Settings"

const NAV = [
  { href: "/",       label: "Rooms",  icon: Home },
  { href: "/map",    label: "Map",    icon: Map },
  { href: "/agent",  label: "Agent",  icon: Bot },
  { href: "/emails", label: "Emails", icon: Mail },
]

function Nav() {
  const path = usePathname()
  const [settings, setSettings] = useState(false)

  return (
    <>
      {/* Top bar */}
      <header
        className="sticky top-0 z-40 bg-white"
        style={{ borderBottom: "1px solid var(--border)", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-7">
            <Link href="/" className="flex items-center gap-2.5 shrink-0">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)", boxShadow: "0 2px 6px rgba(79,70,229,0.3)" }}
              >
                S
              </div>
              <span className="font-semibold text-[15px]" style={{ color: "var(--text-1)" }}>StudiBase</span>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden sm:flex items-center gap-0.5">
              {NAV.map(({ href, label, icon: Icon }) => {
                const active = path === href
                return (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                    style={{
                      background: active ? "var(--accent-dim)" : "transparent",
                      color: active ? "var(--accent)" : "var(--text-3)",
                    }}
                  >
                    <Icon size={14} />
                    {label}
                  </Link>
                )
              })}
              <span
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm select-none"
                style={{ color: "var(--border-strong)" }}
                title="Coming soon"
              >
                Jobs
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                  style={{ background: "var(--surface-2)", color: "var(--text-3)" }}
                >
                  Soon
                </span>
              </span>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden lg:block text-xs" style={{ color: "var(--text-3)" }}>
              Rooms · Jobs · Germany
            </span>
            <button onClick={() => setSettings(true)} className="btn-ghost p-2" title="Settings">
              <Settings size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 sm:hidden z-40 bg-white"
        style={{
          borderTop: "1px solid var(--border)",
          boxShadow: "0 -2px 12px rgba(0,0,0,0.06)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex items-center justify-around px-2 py-2">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = path === href
            return (
              <Link
                key={href}
                href={href}
                className="flex flex-col items-center gap-0.5 py-1 px-4 rounded-xl transition-all"
                style={{ color: active ? "var(--accent)" : "var(--text-3)" }}
              >
                <Icon size={20} strokeWidth={active ? 2.2 : 1.7} />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            )
          })}
          <button
            onClick={() => setSettings(true)}
            className="flex flex-col items-center gap-0.5 py-1 px-4 rounded-xl"
            style={{ color: "var(--text-3)" }}
          >
            <Settings size={20} strokeWidth={1.7} />
            <span className="text-[10px] font-medium">Settings</span>
          </button>
        </div>
      </nav>

      {settings && <SettingsModal onClose={() => setSettings(false)} />}
    </>
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main className="max-w-7xl mx-auto px-4 sm:px-5 py-5 pb-24 sm:pb-8">
          {children}
        </main>
      </body>
    </html>
  )
}
