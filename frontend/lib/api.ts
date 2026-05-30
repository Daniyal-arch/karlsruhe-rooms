import axios from "axios"

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
})

export interface Room {
  id: string
  listing_url: string
  rent_eur: number | null
  extra_costs_eur: number | null
  total_eur: number | null
  size_m2: number | null
  available_from: string | null
  setup: string | null
  city: string | null
  street: string | null
  zip_code: string | null
  district: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  facilities: string | null
  heating_type: string | null
  bus_min: number | null
  tram_min: number | null
  deposit_eur: number | null
  latitude: number | null
  longitude: number | null
  is_active: boolean
  last_seen: string | null
}

export interface MapPin {
  id: string
  rent: number
  lat: number
  lng: number
  city: string
  setup: string | null
  has_email: boolean
}

export interface EmailThread {
  id: string
  room_id: string
  landlord_email: string
  subject: string | null
  body: string | null
  sent_at: string | null
  reply_body: string | null
  reply_received_at: string | null
  ai_analysis: string | null
  ai_recommendation: string | null
  status: string
}

export const roomsApi = {
  list: (params: Record<string, string | number | boolean>) =>
    api.get<Room[]>("/rooms/", { params }).then(r => r.data),

  get: (id: string) => api.get<Room>(`/rooms/${id}`).then(r => r.data),

  pins: (params?: Record<string, string | number>) =>
    api.get<MapPin[]>("/rooms/map/pins", { params }).then(r => r.data),
}

export const emailsApi = {
  draft: (room_id: string, user_name: string) =>
    api.post<{ draft: string; to: string }>("/emails/draft", { room_id, user_name }).then(r => r.data),

  send: (payload: { room_id: string; subject: string; body: string; landlord_email: string; smtp_email?: string }) =>
    api.post<EmailThread>("/emails/send", payload).then(r => r.data),

  bulkSend: (payload: { room_ids: string[]; subject_template: string; body_template: string; smtp_email?: string }) =>
    api.post("/emails/bulk-send", payload).then(r => r.data),

  threads: (status?: string, sender_email?: string) =>
    api.get<EmailThread[]>("/emails/threads", { params: { ...(status && { status }), ...(sender_email && { sender_email }) } }).then(r => r.data),

  proceed: (id: string) => api.patch(`/emails/threads/${id}/proceed`).then(r => r.data),
  decline: (id: string) => api.patch(`/emails/threads/${id}/decline`).then(r => r.data),
}

export interface AgentMapPin {
  id: string; rent: number | null; lat: number; lng: number
  city: string | null; setup: string | null; has_email: boolean
  email: string | null; size_m2: number | null; available_from: string | null; url: string | null
}

export const agentApi = {
  chat: (message: string, history: { role: string; content: string }[], smtp_email = "", smtp_password = "") =>
    api.post<{ reply: string; map_pins?: AgentMapPin[] }>("/agent/chat", { message, history, smtp_email, smtp_password }).then(r => r.data),
}

export default api
