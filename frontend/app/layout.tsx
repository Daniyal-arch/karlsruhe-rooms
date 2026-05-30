"use client"
import "./globals.css"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { Home, Map, Mail, Bot, Settings, Briefcase } from "lucide-react"
import SettingsModal from "@/components/Settings"

const NAV = [
  { href: "/",       label: "Rooms",  icon: Home },
  { href: "/map",    label: "Map",    icon: Map },
  { href: "/emails", label: "Emails", icon: Mail },
  { href: "/agent",  label: "Agent",  icon: Bot },
]

function Nav() {
  const path = usePathname()
  const [settings, setSettings] = useState(false)

  return (
    <>
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div className="max-w-7xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">S</div>
              <span className="font-semibold text-gray-900 text-[15px]">StudiBase</span>
            </Link>
            <nav className="hidden sm:flex items-center gap-1">
              {NAV.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    path === href ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                  }`}
                >
                  <Icon size={15} />
                  {label}
                </Link>
              ))}
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-300 cursor-not-allowed select-none" title="Coming soon">
                <Briefcase size={15} />
                Jobs
                <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full font-medium">Soon</span>
              </span>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden md:block text-xs text-gray-400">Rooms · Jobs · Germany</span>
            <button onClick={() => setSettings(true)} className="btn-ghost p-2 rounded-lg ml-2" title="Email settings">
              <Settings size={17} />
            </button>
          </div>
        </div>
      </header>
      {settings && <SettingsModal onClose={() => setSettings(false)} />}
    </>
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main className="max-w-7xl mx-auto px-5 py-6">{children}</main>
      </body>
    </html>
  )
}
