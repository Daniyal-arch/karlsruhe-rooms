import json
from openai import OpenAI
from sqlalchemy.orm import Session
from app.config import settings

groq = OpenAI(api_key=settings.GROQ_API_KEY, base_url="https://api.groq.com/openai/v1")


def draft_inquiry(room: dict, user_name: str = "") -> str:
    prompt = (
        f"Write a short, polite room inquiry email in German (3-4 sentences). "
        f"Room: €{room.get('rent')}/mo, {room.get('size')}m², {room.get('city')}, "
        f"available from {room.get('available_from')}. "
        f"Sender: {user_name or 'a student'}. End with a greeting."
    )
    resp = groq.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.choices[0].message.content


def analyze_reply(original_body: str, reply_body: str) -> dict:
    resp = groq.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "Analyze a landlord reply to a room inquiry. "
                    "Return valid JSON only with keys: "
                    "recommendation (proceed|decline|needs_more_info), "
                    "reason (string), key_info (string), sentiment (positive|neutral|negative)."
                ),
            },
            {"role": "user", "content": f"Original:\n{original_body}\n\nReply:\n{reply_body}"},
        ],
    )
    try:
        return json.loads(resp.choices[0].message.content)
    except Exception:
        return {"recommendation": "needs_more_info", "reason": "Could not parse.", "key_info": reply_body[:300], "sentiment": "neutral"}


def send_email(to: str, subject: str, body: str, sender_email: str = "", db: Session = None) -> None:
    """
    Send via Gmail API (OAuth) if user has connected their Gmail.
    Falls back to Resend (our server domain) with Reply-To set.
    """
    if sender_email and db:
        from app.services.gmail_oauth import send_via_gmail, is_connected
        if is_connected(sender_email, db):
            send_via_gmail(to, subject, body, sender_email, db)
            return

    # Fallback: Resend with Reply-To
    if settings.RESEND_API_KEY:
        import resend as resend_lib
        resend_lib.api_key = settings.RESEND_API_KEY
        html = f"<p style='font-family:sans-serif;line-height:1.6'>{body.replace(chr(10), '<br>')}</p>"
        params: dict = {
            "from": f"StudiBase <{settings.FROM_EMAIL}>",
            "to": [to],
            "subject": subject,
            "html": html,
            "text": body,
        }
        if sender_email:
            params["reply_to"] = sender_email
        resend_lib.Emails.send(params)
        return

    raise ValueError("No email sending method configured. Connect Gmail or set RESEND_API_KEY.")
