"""
Gmail OAuth service.
- get_auth_url: generates Google consent URL
- exchange_code: trades authorization code for tokens
- send_via_gmail: sends email using user's OAuth credentials
"""
import base64
import threading
import time
from datetime import datetime, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from sqlalchemy.orm import Session

from app.config import settings
from app.models.user_token import UserGmailToken

SCOPES = ["https://www.googleapis.com/auth/gmail.send"]

CLIENT_CONFIG = {
    "web": {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": [settings.OAUTH_REDIRECT_URI],
    }
}

# Store PKCE code verifiers between auth URL generation and callback
# Keyed by user email, auto-expires after 10 minutes
_pending: dict[str, dict] = {}
_lock = threading.Lock()


def _store_verifier(email: str, verifier: str | None):
    with _lock:
        _pending[email.upper()] = {"verifier": verifier, "ts": time.time()}
        # Clean up expired entries
        expired = [k for k, v in _pending.items() if time.time() - v["ts"] > 600]
        for k in expired:
            del _pending[k]


def _pop_verifier(email: str) -> str | None:
    with _lock:
        entry = _pending.pop(email.upper(), None)
        return entry["verifier"] if entry else None


def get_auth_url(user_email: str) -> str:
    flow = Flow.from_client_config(CLIENT_CONFIG, scopes=SCOPES, redirect_uri=settings.OAUTH_REDIRECT_URI)
    url, _ = flow.authorization_url(
        access_type="offline",
        prompt="consent",
        login_hint=user_email,
        state=user_email,
    )
    # Persist code verifier so callback can use it
    _store_verifier(user_email, getattr(flow, "code_verifier", None))
    return url


def exchange_code(code: str, user_email: str, db: Session) -> UserGmailToken:
    flow = Flow.from_client_config(CLIENT_CONFIG, scopes=SCOPES, redirect_uri=settings.OAUTH_REDIRECT_URI)
    verifier = _pop_verifier(user_email)
    if verifier:
        flow.code_verifier = verifier
    flow.fetch_token(code=code)
    creds = flow.credentials

    existing = db.query(UserGmailToken).filter(UserGmailToken.email == user_email).first()
    if existing:
        existing.access_token  = creds.token
        existing.refresh_token = creds.refresh_token or existing.refresh_token
        existing.token_expiry  = creds.expiry
        db.commit()
        return existing

    token = UserGmailToken(
        email=user_email,
        access_token=creds.token,
        refresh_token=creds.refresh_token,
        token_expiry=creds.expiry,
    )
    db.add(token)
    db.commit()
    db.refresh(token)
    return token


def _get_creds(token: UserGmailToken, db: Session) -> Credentials:
    creds = Credentials(
        token=token.access_token,
        refresh_token=token.refresh_token,
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        token_uri="https://oauth2.googleapis.com/token",
        scopes=SCOPES,
    )
    if creds.expired or not creds.token:
        creds.refresh(Request())
        token.access_token = creds.token
        token.token_expiry = creds.expiry
        db.commit()
    return creds


def send_via_gmail(to: str, subject: str, body: str, user_email: str, db: Session) -> None:
    token = db.query(UserGmailToken).filter(UserGmailToken.email == user_email).first()
    if not token:
        raise ValueError(f"No Gmail token found for {user_email}. User must connect Gmail first.")

    creds = _get_creds(token, db)
    service = build("gmail", "v1", credentials=creds, cache_discovery=False)

    msg = MIMEMultipart("alternative")
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))
    msg.attach(MIMEText(f"<p style='font-family:sans-serif;line-height:1.6'>{body.replace(chr(10), '<br>')}</p>", "html"))

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    service.users().messages().send(userId="me", body={"raw": raw}).execute()


def is_connected(user_email: str, db: Session) -> bool:
    return db.query(UserGmailToken).filter(UserGmailToken.email == user_email).first() is not None
