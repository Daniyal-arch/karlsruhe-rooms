import time
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut

_geocoder = Nominatim(user_agent="karlsruhe-rooms/1.0", timeout=5)


def geocode_room(street: str = "", zip_code: str = "", city: str = "") -> tuple[float, float] | None:
    for query in [
        ", ".join(p for p in [street, zip_code, city, "Germany"] if p),
        ", ".join(p for p in [zip_code, city, "Germany"] if p),
    ]:
        for attempt in range(2):
            try:
                result = _geocoder.geocode(query)
                if result:
                    return result.latitude, result.longitude
            except GeocoderTimedOut:
                if attempt == 0:
                    time.sleep(1)
    return None
