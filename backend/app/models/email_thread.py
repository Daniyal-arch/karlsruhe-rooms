import uuid
from sqlalchemy import Column, String, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class EmailThread(Base):
    __tablename__ = "email_threads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    room_id = Column(UUID(as_uuid=True), ForeignKey("rooms.id"), nullable=False, index=True)

    sender_email   = Column(String, index=True)    # user who sent it — for per-user filtering
    landlord_email = Column(String, nullable=False)
    subject = Column(String)
    body = Column(Text)
    sent_at = Column(DateTime(timezone=True))

    reply_body = Column(Text)
    reply_received_at = Column(DateTime(timezone=True))

    ai_analysis = Column(Text)
    ai_recommendation = Column(String)   # proceed | decline | needs_more_info
    status = Column(String, default="sent")   # sent | replied | proceeded | declined

    room = relationship("Room", backref="email_threads")
