import json
from openai import OpenAI
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.config import settings
from app.models.room import Room
from app.models.email_thread import EmailThread  # noqa: F401 — also used inside tool calls

deepseek = OpenAI(api_key=settings.DEEPSEEK_API_KEY, base_url="https://api.deepseek.com")

SYSTEM_PROMPT = """You are StudiBase Assistant — an AI for students searching rooms and housing across Germany.

TOOLS: You have full access to search rooms, view details, send emails, and check email threads. Use them without hesitation.

MEMORY: Each room in search results has an `already_contacted` field. If true, skip that room when sending new emails and note it as "already contacted" when listing results. Never send a duplicate email to the same landlord.

CRITICAL RULES:
1. NEVER say "I can't send emails" or "I'm just a text assistant." You CAN send emails using send_inquiry_email. Always do it when asked.
2. If the user says "send", "contact", "email them", "write to" — call send_inquiry_email immediately. Search for the room first if you don't have the ID.
3. If Gmail is not connected, say: "To send emails, click the ⚙ Settings icon in the top navigation and connect your Gmail account."
4. Never refuse an action you have a tool for.

FORMATTING — match the style of Claude or GPT-4:
- Write in clean, natural prose. No bullet points unless listing 3+ items.
- No emojis. Ever.
- Use plain text, not bold markdown for everything. Bold only for critical info.
- For rooms, use a compact format: "Room in Karlsruhe — €252/mo, 12 m², furnished, available 28 May. Contact: benjamin.otto@web.de"
- After sending an email, confirm simply: "Done — email sent to landlord@email.de. You can track replies in the Emails tab."
- Respond in the language the user writes in.
- Be direct. No filler phrases like "Certainly!" or "Great question!"."""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_rooms",
            "description": "Search rooms in the database with optional filters. Returns up to 15 results sorted by best value.",
            "parameters": {
                "type": "object",
                "properties": {
                    "max_rent":   {"type": "integer", "description": "Maximum rent in EUR"},
                    "min_rent":   {"type": "integer", "description": "Minimum rent in EUR"},
                    "city":       {"type": "string",  "description": "City name (partial match)"},
                    "min_size":   {"type": "number",  "description": "Minimum size in m²"},
                    "max_size":   {"type": "number",  "description": "Maximum size in m²"},
                    "setup":      {"type": "string",  "description": "möbliert | teilmöbliert | unmöbliert"},
                    "has_email":  {"type": "boolean", "description": "Only rooms with email contact"},
                    "lat":        {"type": "number",  "description": "Latitude for proximity search"},
                    "lng":        {"type": "number",  "description": "Longitude for proximity search"},
                    "radius_km":  {"type": "number",  "description": "Search radius in km from lat/lng"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_room_details",
            "description": "Get full details of a specific room by its UUID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "room_id": {"type": "string", "description": "Room UUID"}
                },
                "required": ["room_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "send_inquiry_email",
            "description": "Send an inquiry email to a landlord for a specific room. Use when user explicitly wants to contact a landlord.",
            "parameters": {
                "type": "object",
                "properties": {
                    "room_id":        {"type": "string", "description": "Room UUID"},
                    "landlord_email": {"type": "string", "description": "Landlord email address"},
                    "subject":        {"type": "string", "description": "Email subject line"},
                    "body":           {"type": "string", "description": "Email body in German or English"},
                    "smtp_email": {"type": "string", "description": "User Gmail address (used to look up their connected OAuth token)"},
                },
                "required": ["room_id", "landlord_email", "subject", "body"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "show_on_map",
            "description": "Render an interactive map in the chat showing room locations. Call this when user asks to see rooms on a map, wants to visualize locations, or asks 'where are these rooms'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "room_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Room UUIDs to plot. Search first if you don't have IDs yet.",
                    },
                },
                "required": ["room_ids"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "send_bulk_emails",
            "description": "Send inquiry emails to multiple rooms at once. Use when user says 'email all', 'contact all', or wants to reach multiple landlords.",
            "parameters": {
                "type": "object",
                "properties": {
                    "room_ids":   {"type": "array", "items": {"type": "string"}, "description": "List of room UUIDs to email"},
                    "subject":    {"type": "string", "description": "Email subject (same for all)"},
                    "body":       {"type": "string", "description": "Email body in German — personalize with city/rent if possible"},
                    "smtp_email": {"type": "string", "description": "User Gmail for OAuth lookup"},
                },
                "required": ["room_ids", "subject", "body"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_email_threads",
            "description": "Show the user's sent email threads and any replies received.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "description": "Filter by status: sent | replied | proceeded | declined"}
                },
            },
        },
    },
]


_map_pins_store: dict = {}   # per-request side channel for map pins


def _execute_tool(name: str, args: dict, db: Session, smtp_email: str = "", smtp_password: str = "") -> str:
    if name == "search_rooms":
        q = db.query(Room).filter(Room.is_active == True)
        if args.get("city"):
            q = q.filter(Room.city.ilike(f"%{args['city']}%"))
        if args.get("max_rent"):
            q = q.filter(Room.rent_eur <= args["max_rent"])
        if args.get("min_rent"):
            q = q.filter(Room.rent_eur >= args["min_rent"])
        if args.get("min_size"):
            q = q.filter(Room.size_m2 >= args["min_size"])
        if args.get("max_size"):
            q = q.filter(Room.size_m2 <= args["max_size"])
        if args.get("setup"):
            q = q.filter(Room.setup.ilike(f"%{args['setup']}%"))
        if args.get("has_email"):
            q = q.filter(Room.email != None, Room.email != "")
        if args.get("lat") and args.get("lng") and args.get("radius_km"):
            point = func.ST_SetSRID(func.ST_MakePoint(args["lng"], args["lat"]), 4326)
            q = q.filter(
                func.ST_DWithin(func.ST_Geography(Room.location), func.ST_Geography(point), args["radius_km"] * 1000)
            )
        rooms = q.order_by(Room.rent_eur.asc()).limit(15).all()
        if not rooms:
            return "No rooms found matching those criteria."

        # Mark rooms already emailed by this user
        already_emailed = set()
        if smtp_email:
            from app.models.email_thread import EmailThread
            threads = db.query(EmailThread.room_id).filter(
                EmailThread.sender_email == smtp_email
            ).all()
            already_emailed = {str(t.room_id) for t in threads}

        return json.dumps([{
            "id": str(r.id), "rent": r.rent_eur, "extra_costs": r.extra_costs_eur,
            "total": r.total_eur, "size_m2": r.size_m2, "city": r.city,
            "street": r.street, "zip": r.zip_code, "setup": r.setup,
            "available_from": r.available_from, "email": r.email,
            "phone": r.phone or r.mobile, "deposit": r.deposit_eur,
            "restrictions": r.restrictions, "facilities": r.facilities,
            "bus_min": r.bus_min, "tram_min": r.tram_min, "url": r.listing_url,
            "already_contacted": str(r.id) in already_emailed,
        } for r in rooms], ensure_ascii=False)

    if name == "get_room_details":
        from uuid import UUID
        room = db.query(Room).filter(Room.id == UUID(args["room_id"])).first()
        if not room:
            return "Room not found."
        return json.dumps({
            "id": str(room.id), "rent": room.rent_eur, "extra_costs": room.extra_costs_eur,
            "total": room.total_eur, "deposit": room.deposit_eur, "size_m2": room.size_m2,
            "setup": room.setup, "facilities": room.facilities, "city": room.city,
            "street": room.street, "zip": room.zip_code, "district": room.district,
            "email": room.email, "phone": room.phone, "mobile": room.mobile,
            "available_from": room.available_from, "restrictions": room.restrictions,
            "electricity": room.electricity, "heating": room.heating,
            "bus_min": room.bus_min, "tram_min": room.tram_min, "url": room.listing_url,
        }, ensure_ascii=False)

    if name == "send_inquiry_email":
        from datetime import datetime, timezone
        from app.services.email_service import send_email
        from app.services.gmail_oauth import is_connected
        from uuid import UUID
        room = db.query(Room).filter(Room.id == UUID(args["room_id"])).first()
        if not room:
            return "Room not found."
        sender = args.get("smtp_email") or smtp_email
        if not sender:
            return json.dumps({"error": "no_email", "message": "No user email provided. Ask the user to enter their email in Settings."})
        if not is_connected(sender, db):
            return json.dumps({"error": "not_connected", "message": f"Gmail not connected for {sender}. Ask the user to click Connect Gmail in the Settings (gear icon)."})
        try:
            send_email(args["landlord_email"], args["subject"], args["body"], sender, db)
            thread = EmailThread(
                room_id=UUID(args["room_id"]),
                sender_email=sender,
                landlord_email=args["landlord_email"],
                subject=args["subject"],
                body=args["body"],
                sent_at=datetime.now(timezone.utc),
                status="sent",
            )
            db.add(thread)
            db.commit()
            return json.dumps({"success": True, "to": args["landlord_email"], "thread_id": str(thread.id)})
        except Exception as e:
            return json.dumps({"success": False, "error": str(e)})

    if name == "show_on_map":
        from uuid import UUID
        pins = []
        for rid in args.get("room_ids", []):
            try:
                room = db.query(Room).filter(Room.id == UUID(rid)).first()
                if room and room.latitude and room.longitude:
                    pins.append({
                        "id": str(room.id), "rent": room.rent_eur,
                        "lat": room.latitude, "lng": room.longitude,
                        "city": room.city, "setup": room.setup,
                        "has_email": bool(room.email),
                        "email": room.email, "size_m2": room.size_m2,
                        "available_from": room.available_from,
                        "url": room.listing_url,
                    })
            except Exception:
                pass
        if not pins:
            return "No geocoded rooms found to show on the map."
        # Store pins so run_agent can return them alongside the text reply
        _map_pins_store["pins"] = pins
        return json.dumps({"map_ready": True, "count": len(pins)})

    if name == "send_bulk_emails":
        from datetime import datetime, timezone
        from app.services.email_service import send_email
        from app.services.gmail_oauth import is_connected
        from uuid import UUID
        sender = args.get("smtp_email") or smtp_email
        if not sender or not is_connected(sender, db):
            return json.dumps({"error": "not_connected", "message": "Gmail not connected. Ask user to connect via ⚙ Settings."})
        results = []
        for rid in args.get("room_ids", []):
            try:
                room = db.query(Room).filter(Room.id == UUID(rid)).first()
                if not room or not room.email:
                    results.append({"id": rid, "status": "skipped", "reason": "no email"})
                    continue
                already = db.query(EmailThread).filter(
                    EmailThread.room_id == UUID(rid),
                    EmailThread.sender_email == sender
                ).first()
                if already:
                    results.append({"id": rid, "status": "skipped", "reason": "already contacted"})
                    continue
                send_email(room.email.split(";")[0].strip(), args["subject"], args["body"], sender, db)
                thread = EmailThread(
                    room_id=UUID(rid), sender_email=sender,
                    landlord_email=room.email.split(";")[0].strip(),
                    subject=args["subject"], body=args["body"],
                    sent_at=datetime.now(timezone.utc), status="sent"
                )
                db.add(thread)
                db.commit()
                results.append({"id": rid, "status": "sent", "to": room.email})
            except Exception as e:
                results.append({"id": rid, "status": "error", "error": str(e)})
        sent = sum(1 for r in results if r["status"] == "sent")
        return json.dumps({"sent": sent, "total": len(args["room_ids"]), "results": results})

    if name == "list_email_threads":
        q = db.query(EmailThread)
        if args.get("status"):
            q = q.filter(EmailThread.status == args["status"])
        threads = q.order_by(EmailThread.sent_at.desc()).limit(10).all()
        if not threads:
            return "No email threads found."
        return json.dumps([{
            "id": str(t.id), "to": t.landlord_email, "subject": t.subject,
            "status": t.status, "sent_at": str(t.sent_at),
            "has_reply": bool(t.reply_body),
            "ai_recommendation": t.ai_recommendation,
        } for t in threads], ensure_ascii=False)

    return "Unknown tool."


def run_agent(user_message: str, chat_history: list[dict], db: Session,
              smtp_email: str = "", smtp_password: str = "") -> dict:
    _map_pins_store.clear()

    system = SYSTEM_PROMPT
    if smtp_email:
        system += f"\n\nUSER GMAIL: {smtp_email} (OAuth connected — you can send emails immediately). Do NOT ask for credentials."

    messages = [{"role": "system", "content": system}]
    messages.extend(chat_history[-12:])
    messages.append({"role": "user", "content": user_message})

    for _ in range(8):
        response = deepseek.chat.completions.create(
            model="deepseek-chat",
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
        )
        msg = response.choices[0].message
        if msg.tool_calls:
            messages.append(msg)
            for tc in msg.tool_calls:
                result = _execute_tool(tc.function.name, json.loads(tc.function.arguments), db, smtp_email, smtp_password)
                messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
        else:
            return {
                "reply": msg.content or "",
                "map_pins": _map_pins_store.get("pins") or None,
            }

    return {"reply": "Unable to complete the request. Please try again.", "map_pins": None}
