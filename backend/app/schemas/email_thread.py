import uuid
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class EmailThreadOut(BaseModel):
    id: uuid.UUID
    room_id: uuid.UUID
    sender_email: Optional[str] = None
    landlord_email: str
    subject: Optional[str] = None
    body: Optional[str] = None
    sent_at: Optional[datetime] = None
    reply_body: Optional[str] = None
    reply_received_at: Optional[datetime] = None
    ai_analysis: Optional[str] = None
    ai_recommendation: Optional[str] = None
    status: str

    class Config:
        from_attributes = True
