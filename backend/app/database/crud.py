from sqlalchemy.orm import Session
from sqlalchemy import desc
from . import models
from fastapi import HTTPException
from ..auth.password import get_password_hash, verify_password
from typing import List, Optional

# User operations
def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_username(db: Session, username: str):
    return db.query(models.User).filter(models.User.username == username).first()

def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def create_user(db: Session, username: str, email: str, password: str):
    hashed_password = get_password_hash(password)
    db_user = models.User(username=username, email=email, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def update_password(db: Session, user_id: int, new_password: str):
    db_user = get_user(db, user_id)
    if not db_user:
        return None
    db_user.hashed_password = get_password_hash(new_password)
    db.commit()
    db.refresh(db_user)
    return db_user

def authenticate_user(db: Session, username: str, password: str):
    user = get_user_by_username(db, username)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

# Project operations
def get_projects(db: Session, user_id: int, skip: int = 0, limit: int = 100):
    return db.query(models.Project).filter(models.Project.owner_id == user_id).offset(skip).limit(limit).all()

def get_project(db: Session, project_id: int, user_id: int):
    return db.query(models.Project).filter(
        models.Project.id == project_id, 
        models.Project.owner_id == user_id
    ).first()

def create_project(db: Session, name: str, api_key: str, description: Optional[str], user_id: int):
    db_project = models.Project(
        name=name,
        api_key=api_key,
        description=description,
        owner_id=user_id
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

def update_project(db: Session, project_id: int, api_key: Optional[str], description: Optional[str], user_id: int):
    db_project = get_project(db, project_id, user_id)
    if not db_project:
        return None
    
    if api_key:
        db_project.api_key = api_key
    if description is not None:
        db_project.description = description
    
    db.commit()
    db.refresh(db_project)
    return db_project

def delete_project(db: Session, project_id: int, user_id: int):
    db_project = get_project(db, project_id, user_id)
    if not db_project:
        return False
    
    db.delete(db_project)
    db.commit()
    return True

# Log operations
def get_logs(db: Session, project_id: int, user_id: int, skip: int = 0, limit: int = 100):
    return db.query(models.Log).filter(
        models.Log.project_id == project_id,
        models.Log.user_id == user_id
    ).order_by(desc(models.Log.created_at)).offset(skip).limit(limit).all()

def count_logs(db: Session, project_id: int):
    return db.query(models.Log).filter(models.Log.project_id == project_id).count()

def create_log(db: Session, action: str, details: Optional[str], status: str, project_id: Optional[int], user_id: int):
    db_log = models.Log(
        action=action,
        details=details, 
        status=status,
        project_id=project_id,
        user_id=user_id
    )
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log