import uuid
from sqlalchemy import Column, String, DateTime, Text, func
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class UserGmailToken(Base):
    __tablename__ = "user_gmail_tokens"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email         = Column(String, unique=True, nullable=False, index=True)
    access_token  = Column(Text)
    refresh_token = Column(Text, nullable=False)
    token_expiry  = Column(DateTime(timezone=True))
    connected_at  = Column(DateTime(timezone=True), server_default=func.now())
