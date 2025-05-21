from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from pathlib import Path

from .auth import routes as auth_routes
from .hetzner import routes as hetzner_routes
from .database import models
from .database.database import engine

# Create database tables
models.Base.metadata.create_all(bind=engine)

# Create FastAPI application
app = FastAPI(
    title="HetznerDock",
    description="A professional management panel for Hetzner Cloud",
    version="1.0.0"
)

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development, in production specify domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add routers
app.include_router(
    auth_routes.router,
    prefix="/api/auth",
    tags=["Authentication"]
)

app.include_router(
    hetzner_routes.router,
    prefix="/api",
    tags=["Hetzner Cloud"]
)

# Serve static files (React frontend)
frontend_build_path = Path("../frontend/build")
frontend_exists = frontend_build_path.exists()

if frontend_exists:
    app.mount("/static", StaticFiles(directory=frontend_build_path / "static"), name="static")

# Serve React application
@app.get("/{full_path:path}")
def serve_react(full_path: str):
    if full_path.startswith("api/"):
        return {"detail": "API endpoint not found"}
    
    if frontend_exists:
        return FileResponse(frontend_build_path / "index.html")
    else:
        return {"message": "Frontend not built yet. Please run 'npm run build' in the frontend directory."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)