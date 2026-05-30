import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.email_thread import EmailThread
from app.models.room import Room
from app.schemas.email_thread import EmailThreadOut
from app.services.email_service import analyze_reply, draft_inquiry, send_email

router = APIRouter(prefix="/emails", tags=["emails"])


class DraftRequest(BaseModel):
    room_id: uuid.UUID
    user_name: str = ""


class SendRequest(BaseModel):
    room_id: uuid.UUID
    subject: str
    body: str
    landlord_email: str
    smtp_email: str = ""   # user's email — used to look up OAuth token


class BulkSendRequest(BaseModel):
    room_ids: List[uuid.UUID]
    subject_template: str
    body_template: str
    smtp_email: str = ""


class ReplyWebhook(BaseModel):
    thread_id: uuid.UUID
    reply_body: str


@router.post("/draft")
def draft_email(req: DraftRequest, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == req.room_id).first()
    if not room:
        raise HTTPException(404, "Room not found")
    text = draft_inquiry(
        {"rent": room.rent_eur, "size": room.size_m2, "city": room.city,
         "street": room.street, "available_from": room.available_from},
        req.user_name,
    )
    return {"draft": text, "to": room.email}


@router.post("/send", response_model=EmailThreadOut, status_code=201)
def send_inquiry(req: SendRequest, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == req.room_id).first()
    if not room:
        raise HTTPException(404, "Room not found")
    send_email(req.landlord_email, req.subject, req.body, req.smtp_email, db)
    thread = EmailThread(
        room_id=req.room_id,
        sender_email=req.smtp_email or None,
        landlord_email=req.landlord_email,
        subject=req.subject,
        body=req.body,
        sent_at=datetime.now(timezone.utc),
        status="sent",
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return thread


@router.post("/bulk-send")
def bulk_send(req: BulkSendRequest, db: Session = Depends(get_db)):
    rooms = db.query(Room).filter(
        Room.id.in_(req.room_ids), Room.email != None, Room.email != ""
    ).all()

    results = []
    for room in rooms:
        def fill(t: str) -> str:
            return (t.replace("{city}", room.city or "")
                     .replace("{rent}", str(room.rent_eur or ""))
                     .replace("{street}", room.street or ""))

        subject = fill(req.subject_template)
        body = fill(req.body_template)
        try:
            send_email(room.email, subject, body, req.smtp_email, db)
            thread = EmailThread(
                room_id=room.id,
                sender_email=req.smtp_email or None,
                landlord_email=room.email,
                subject=subject,
                body=body,
                sent_at=datetime.now(timezone.utc),
                status="sent",
            )
            db.add(thread)
            results.append({"room_id": str(room.id), "status": "sent", "to": room.email})
        except Exception as e:
            results.append({"room_id": str(room.id), "status": "error", "error": str(e)})

    db.commit()
    sent = sum(1 for r in results if r["status"] == "sent")
    return {"sent": sent, "total": len(rooms), "results": results}


@router.post("/webhook/reply")
def handle_reply(req: ReplyWebhook, db: Session = Depends(get_db)):
    thread = db.query(EmailThread).filter(EmailThread.id == req.thread_id).first()
    if not thread:
        raise HTTPException(404, "Thread not found")
    analysis = analyze_reply(thread.body or "", req.reply_body)
    thread.reply_body = req.reply_body
    thread.reply_received_at = datetime.now(timezone.utc)
    thread.ai_analysis = str(analysis)
    thread.ai_recommendation = analysis.get("recommendation", "needs_more_info")
    thread.status = "replied"
    db.commit()
    return {"thread_id": str(thread.id), "analysis": analysis, "room_id": str(thread.room_id)}


@router.get("/threads", response_model=List[EmailThreadOut])
def list_threads(status: str = None, sender_email: str = None, db: Session = Depends(get_db)):
    q = db.query(EmailThread)
    if status:
        q = q.filter(EmailThread.status == status)
    if sender_email:
        q = q.filter(EmailThread.sender_email == sender_email)
    return q.order_by(EmailThread.sent_at.desc()).all()


@router.patch("/threads/{thread_id}/proceed", response_model=EmailThreadOut)
def proceed(thread_id: uuid.UUID, db: Session = Depends(get_db)):
    t = db.query(EmailThread).filter(EmailThread.id == thread_id).first()
    if not t:
        raise HTTPException(404, "Not found")
    t.status = "proceeded"
    db.commit()
    db.refresh(t)
    return t


@router.patch("/threads/{thread_id}/decline", response_model=EmailThreadOut)
def decline(thread_id: uuid.UUID, db: Session = Depends(get_db)):
    t = db.query(EmailThread).filter(EmailThread.id == thread_id).first()
    if not t:
        raise HTTPException(404, "Not found")
    t.status = "declined"
    db.commit()
    db.refresh(t)
    return t
