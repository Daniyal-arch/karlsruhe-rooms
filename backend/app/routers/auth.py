from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.gmail_oauth import get_auth_url, exchange_code, is_connected
from app.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/gmail")
def gmail_auth_start(email: str = Query(..., description="User email to connect")):
    """Returns the Google OAuth URL for the frontend to open."""
    url = get_auth_url(email)
    return {"url": url}


@router.get("/gmail/callback", response_class=HTMLResponse)
def gmail_auth_callback(
    db: Session = Depends(get_db),
    code: str = None,
    state: str = None,
    error: str = None,
):
    """
    Google redirects here after user grants permission.
    Exchanges code for tokens, saves them, closes the popup.
    """
    if error or not code or not state:
        msg = "access_denied" if error == "access_denied" else (error or "missing code")
        return HTMLResponse(f"""
<!DOCTYPE html><html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fef2f2">
  <div style="text-align:center;padding:2rem">
    <h2 style="color:#dc2626">{"Access denied" if error == "access_denied" else "Connection failed"}</h2>
    <p style="color:#6b7280">{"You cancelled the Google login. Close this window and try again." if error == "access_denied" else msg}</p>
    <button onclick="window.close()" style="margin-top:1rem;padding:.5rem 1.5rem;border-radius:8px;border:1px solid #d1d5db;cursor:pointer">Close</button>
  </div>
  <script>if(window.opener){{ window.opener.postMessage({{type:'gmail_error',error:'{msg}'}},'{settings.FRONTEND_URL}'); }}</script>
</body></html>""")

    try:
        token = exchange_code(code, state, db)
        return HTMLResponse(f"""
<!DOCTYPE html>
<html>
<head><title>Gmail Connected</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0fdf4">
  <div style="text-align:center;padding:2rem">
    <div style="font-size:3rem;margin-bottom:1rem">✓</div>
    <h2 style="color:#16a34a;margin:0 0 .5rem">Gmail Connected!</h2>
    <p style="color:#6b7280;margin:0">Connected as <strong>{token.email}</strong><br>You can close this window.</p>
  </div>
  <script>
    if (window.opener) {{
      window.opener.postMessage({{ type: 'gmail_connected', email: '{token.email}' }}, '{settings.FRONTEND_URL}');
      setTimeout(() => window.close(), 1500);
    }}
  </script>
</body>
</html>
        """)
    except Exception as e:
        return HTMLResponse(f"""
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fef2f2">
  <div style="text-align:center;padding:2rem">
    <h2 style="color:#dc2626">Connection Failed</h2>
    <p style="color:#6b7280">{str(e)}</p>
    <button onclick="window.close()">Close</button>
  </div>
</body>
</html>
        """, status_code=400)


@router.get("/gmail/status")
def gmail_status(email: str, db: Session = Depends(get_db)):
    return {"connected": is_connected(email, db)}


@router.delete("/gmail/disconnect")
def gmail_disconnect(email: str, db: Session = Depends(get_db)):
    from app.models.user_token import UserGmailToken
    db.query(UserGmailToken).filter(UserGmailToken.email == email).delete()
    db.commit()
    return {"disconnected": True}
