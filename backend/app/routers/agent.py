from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.ai_agent import run_agent

router = APIRouter(prefix="/agent", tags=["agent"])


class ChatMessage(BaseModel):
    role: str
    content: str


class AgentRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []
    smtp_email: str = ""
    smtp_password: str = ""


class MapPin(BaseModel):
    id: str
    rent: Optional[int] = None
    lat: float
    lng: float
    city: Optional[str] = None
    setup: Optional[str] = None
    has_email: bool = False
    email: Optional[str] = None
    size_m2: Optional[float] = None
    available_from: Optional[str] = None
    url: Optional[str] = None


class AgentResponse(BaseModel):
    reply: str
    map_pins: Optional[List[MapPin]] = None


@router.post("/chat", response_model=AgentResponse)
def chat(req: AgentRequest, db: Session = Depends(get_db)):
    history = [{"role": m.role, "content": m.content} for m in req.history]
    result = run_agent(req.message, history, db, req.smtp_email, req.smtp_password)
    return AgentResponse(reply=result["reply"], map_pins=result.get("map_pins"))
