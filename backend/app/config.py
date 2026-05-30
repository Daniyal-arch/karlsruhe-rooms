from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/karlsruhe_rooms"
    REDIS_URL: str = "redis://localhost:6379/0"

    TYPESENSE_HOST: str = "localhost"
    TYPESENSE_PORT: int = 8108
    TYPESENSE_API_KEY: str = "xyz"

    DEEPSEEK_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    RESEND_API_KEY: str = ""
    FROM_EMAIL: str = "noreply@studinest.de"

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    OAUTH_REDIRECT_URI: str = "http://localhost:8000/auth/gmail/callback"
    FRONTEND_URL: str = "http://localhost:3000"

    SWKA_EMAIL: str = ""
    SWKA_PASSWORD: str = ""

    GOOGLE_CREDS: Optional[str] = None
    SHEET_ID: Optional[str] = None

    NEXT_PUBLIC_API_URL: str = "http://localhost:8000"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
