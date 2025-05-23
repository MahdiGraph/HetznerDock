from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from pathlib import Path
from sqlalchemy.orm import Session

from .auth import routes as auth_routes
from .hetzner import routes as hetzner_routes
from .database import models
from .database.database import engine, get_db
from .auth.routes import setup_admin_user

# Create database tables
models.Base.metadata.create_all(bind=engine)

# Create FastAPI application
app = FastAPI(
    title="HetznerDock",
    description="A professional management panel for Hetzner Cloud",
    version="1.0.0"
)

# Setup CORS - allow all origins as requested
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

# Initialize admin user 
@app.on_event("startup")
async def startup_event():
    db = next(get_db())
    setup_admin_user(db)

# Get frontend build path
frontend_path = Path("../frontend/build")
novnc_path = Path("../frontend/public/novnc")  # مسیر فایل‌های noVNC

# Serve noVNC files separately - اضافه کردن این بخش
if novnc_path.exists():
    app.mount("/novnc", StaticFiles(directory=novnc_path), name="novnc")

if frontend_path.exists():
    # Serve static files (React frontend)
    app.mount("/static", StaticFiles(directory=frontend_path / "static"), name="static")
    
    # Serve React application for all non-API routes
    @app.get("/{full_path:path}")
    async def serve_react(full_path: str):
        if full_path.startswith("api/"):
            return {"detail": "API endpoint not found"}
        # Exclude novnc paths from React handling
        if full_path.startswith("novnc/"):
            return {"detail": "Not found"}
        return FileResponse(frontend_path / "index.html")
else:
    # In case frontend is not built yet
    @app.get("/{full_path:path}")
    async def serve_not_found(full_path: str):
        if full_path.startswith("api/"):
            return {"detail": "API endpoint not found"}
        return {"message": "Frontend not built yet. Please run 'npm run build' in the frontend directory."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)