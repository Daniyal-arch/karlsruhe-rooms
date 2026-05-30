import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.room import Room
from app.schemas.room import RoomCreate, RoomOut
from app.services.geocoder import geocode_room

router = APIRouter(prefix="/rooms", tags=["rooms"])


@router.get("/", response_model=List[RoomOut])
def list_rooms(
    city: Optional[str] = None,
    min_rent: Optional[int] = None,
    max_rent: Optional[int] = None,
    min_size: Optional[float] = None,
    max_size: Optional[float] = None,
    setup: Optional[str] = None,
    has_email: Optional[bool] = None,
    active_only: bool = True,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_km: Optional[float] = None,
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    q = db.query(Room)
    if active_only:
        q = q.filter(Room.is_active == True)
    if city:
        q = q.filter(Room.city.ilike(f"%{city}%"))
    if min_rent is not None:
        q = q.filter(Room.rent_eur >= min_rent)
    if max_rent is not None:
        q = q.filter(Room.rent_eur <= max_rent)
    if min_size is not None:
        q = q.filter(Room.size_m2 >= min_size)
    if max_size is not None:
        q = q.filter(Room.size_m2 <= max_size)
    if setup:
        q = q.filter(Room.setup.ilike(f"%{setup}%"))
    if has_email is True:
        q = q.filter(Room.email != None, Room.email != "")
    if lat and lng and radius_km:
        point = func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326)
        q = q.filter(
            func.ST_DWithin(
                func.ST_Geography(Room.location),
                func.ST_Geography(point),
                radius_km * 1000,
            )
        )
    return (
        q.order_by(Room.last_seen.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )


@router.get("/map/pins")
def map_pins(
    city: Optional[str] = None,
    min_rent: Optional[int] = None,
    max_rent: Optional[int] = None,
    min_size: Optional[float] = None,
    max_size: Optional[float] = None,
    setup: Optional[str] = None,
    has_email: Optional[bool] = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    q = db.query(Room.id, Room.rent_eur, Room.latitude, Room.longitude, Room.city, Room.setup, Room.email, Room.size_m2)
    if active_only:
        q = q.filter(Room.is_active == True)
    if city:
        q = q.filter(Room.city.ilike(f"%{city}%"))
    if min_rent is not None:
        q = q.filter(Room.rent_eur >= min_rent)
    if max_rent is not None:
        q = q.filter(Room.rent_eur <= max_rent)
    if min_size is not None:
        q = q.filter(Room.size_m2 >= min_size)
    if max_size is not None:
        q = q.filter(Room.size_m2 <= max_size)
    if setup:
        q = q.filter(Room.setup.ilike(f"%{setup}%"))
    if has_email is True:
        q = q.filter(Room.email != None, Room.email != "")
    q = q.filter(Room.latitude != None, Room.longitude != None)
    return [
        {
            "id": str(r.id), "rent": r.rent_eur,
            "lat": r.latitude, "lng": r.longitude,
            "city": r.city, "setup": r.setup,
            "size_m2": r.size_m2, "has_email": bool(r.email),
        }
        for r in q.all()
    ]


@router.get("/{room_id}", response_model=RoomOut)
def get_room(room_id: uuid.UUID, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


@router.post("/ingest", response_model=RoomOut, status_code=201)
def ingest_room(data: RoomCreate, db: Session = Depends(get_db)):
    existing = db.query(Room).filter(Room.listing_url == data.listing_url).first()

    # Geocode if address provided but no coords yet
    lat, lng = data.latitude, data.longitude
    if not lat and (data.street or data.zip_code or data.city):
        coords = geocode_room(data.street or "", data.zip_code or "", data.city or "")
        if coords:
            lat, lng = coords

    if existing:
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(existing, k, v)
        existing.latitude = lat
        existing.longitude = lng
        existing.is_active = True
        existing.last_seen = datetime.now(timezone.utc)
        if lat and lng:
            existing.location = func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326)
        db.commit()
        db.refresh(existing)
        return existing

    room = Room(**data.model_dump(), latitude=lat, longitude=lng)
    if lat and lng:
        room.location = func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326)
    db.add(room)
    db.commit()
    db.refresh(room)
    return room


@router.post("/mark-inactive")
def mark_inactive(active_urls: List[str], db: Session = Depends(get_db)):
    """Call after each scrape run with all currently live URLs to deactivate the rest."""
    updated = (
        db.query(Room)
        .filter(Room.is_active == True, Room.listing_url.notin_(active_urls))
        .update({"is_active": False}, synchronize_session=False)
    )
    db.commit()
    return {"deactivated": updated}
