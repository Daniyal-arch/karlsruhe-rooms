from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import Base, engine
from app.routers import rooms, emails, agent, auth

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Karlsruhe Rooms API", version="1.0.0", docs_url="/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://yourdomain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rooms.router)
app.include_router(emails.router)
app.include_router(agent.router)
app.include_router(auth.router)


@app.get("/health")
def health():
    return {"status": "ok"}
