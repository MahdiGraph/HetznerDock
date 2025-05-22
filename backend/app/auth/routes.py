from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta
from sqlalchemy.orm import Session
from ..database import crud, models
from ..database.database import get_db
from .jwt import create_access_token, get_current_user
from .password import get_password_hash, verify_password
from ..config import settings
from ..logging.logger import log_action
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

router = APIRouter()

class Token(BaseModel):
    access_token: str
    token_type: str

class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class ChangePassword(BaseModel):
    old_password: str
    new_password: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    is_active: bool

    class Config:
        orm_mode = True  # Important: This allows direct mapping from ORM objects

@router.post("/token", response_model=Token)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = crud.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        # Log failed login attempt
        if user_db := crud.get_user_by_username(db, form_data.username):
            log_action(
                db=db,
                action="LOGIN",
                details=f"Failed login attempt for user: {form_data.username}",
                status="failed",
                project_id=None,
                user_id=user_db.id
            )
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username},
        expires_delta=access_token_expires
    )
    
    # Log successful login
    log_action(
        db=db,
        action="LOGIN",
        details=f"User {user.username} logged in successfully",
        status="success",
        project_id=None,
        user_id=user.id
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: models.User = Depends(get_current_user)):
    """Get information about the current authenticated user"""
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "is_active": current_user.is_active
    }

@router.post("/change-password")
async def change_password(
    password_data: ChangePassword,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify old password
    if not verify_password(password_data.old_password, current_user.hashed_password):
        log_action(
            db=db,
            action="CHANGE_PASSWORD",
            details="Failed attempt to change password (incorrect old password)",
            status="failed",
            project_id=None,
            user_id=current_user.id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect old password"
        )
    
    # Update to new password
    updated_user = crud.update_password(db, current_user.id, password_data.new_password)
    if not updated_user:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update password"
        )
    
    # Log password change
    log_action(
        db=db,
        action="CHANGE_PASSWORD",
        details="Password changed successfully",
        status="success",
        project_id=None,
        user_id=current_user.id
    )
    
    return {"message": "Password updated successfully"}

def setup_admin_user(db: Session):
    """Setup initial admin user if not exists"""
    # Check if admin user exists
    admin = crud.get_user_by_username(db, settings.ADMIN_USERNAME)
    if not admin:
        # Create admin user
        crud.create_user(
            db=db,
            username=settings.ADMIN_USERNAME,
            email=f"{settings.ADMIN_USERNAME}@example.com",
            password=settings.ADMIN_PASSWORD
        )
        print(f"Admin user created with username: {settings.ADMIN_USERNAME}")
