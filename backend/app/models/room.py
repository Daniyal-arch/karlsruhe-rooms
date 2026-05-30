import uuid
from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean, Text, func
from sqlalchemy.dialects.postgresql import UUID
from geoalchemy2 import Geometry
from app.database import Base


class Room(Base):
    __tablename__ = "rooms"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    listing_url = Column(String, unique=True, nullable=False, index=True)
    source = Column(String, default="sw-ka.de")

    # Pricing
    rent_eur = Column(Integer, index=True)
    extra_costs_eur = Column(Integer)
    total_eur = Column(Integer)
    deposit_eur = Column(Integer)

    # Room details
    room_type = Column(Text)
    size_m2 = Column(Float)
    available_from = Column(String)
    setup = Column(String)        # möbliert / teilmöbliert / unmöbliert
    renovation = Column(String)

    # Utilities
    electricity = Column(String)
    heating = Column(String)
    heating_type = Column(String)
    facilities = Column(Text)

    # Contact
    landlord_name = Column(String)
    email = Column(String, index=True)
    phone = Column(String)
    mobile = Column(String)

    # Location
    street = Column(String)
    zip_code = Column(String)
    city = Column(String, index=True)
    district = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    location = Column(Geometry("POINT", srid=4326))   # PostGIS point for geo queries

    # Transport
    bus_min = Column(Integer)
    tram_min = Column(Integer)
    train_min = Column(Integer)

    # Restrictions & notes
    restrictions = Column(String)
    notes = Column(Text)

    # Lifecycle
    is_active = Column(Boolean, default=True, index=True)
    first_seen = Column(DateTime(timezone=True), server_default=func.now())
    last_seen = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    scraped_at = Column(DateTime(timezone=True))
