import uuid
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class RoomBase(BaseModel):
    listing_url: str
    source: Optional[str] = "sw-ka.de"
    rent_eur: Optional[int] = None
    extra_costs_eur: Optional[int] = None
    total_eur: Optional[int] = None
    deposit_eur: Optional[int] = None
    room_type: Optional[str] = None
    size_m2: Optional[float] = None
    available_from: Optional[str] = None
    setup: Optional[str] = None
    renovation: Optional[str] = None
    electricity: Optional[str] = None
    heating: Optional[str] = None
    heating_type: Optional[str] = None
    facilities: Optional[str] = None
    landlord_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    street: Optional[str] = None
    zip_code: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    bus_min: Optional[int] = None
    tram_min: Optional[int] = None
    train_min: Optional[int] = None
    restrictions: Optional[str] = None
    notes: Optional[str] = None
    scraped_at: Optional[datetime] = None


class RoomCreate(RoomBase):
    pass


class RoomOut(RoomBase):
    id: uuid.UUID
    is_active: bool
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None

    class Config:
        from_attributes = True
