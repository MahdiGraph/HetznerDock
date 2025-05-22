from sqlalchemy.orm import Session
from sqlalchemy import desc
from . import models
from ..auth.password import get_password_hash, verify_password
from typing import List, Optional, Dict, Any, Union

# User operations
def get_user(db: Session, user_id: int) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_username(db: Session, username: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.username == username).first()

def get_user_by_email(db: Session, email: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.email == email).first()

def create_user(db: Session, username: str, email: str, password: str) -> models.User:
    hashed_password = get_password_hash(password)
    db_user = models.User(username=username, email=email, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def update_password(db: Session, user_id: int, new_password: str) -> Optional[models.User]:
    db_user = get_user(db, user_id)
    if not db_user:
        return None
    db_user.hashed_password = get_password_hash(new_password)
    db.commit()
    db.refresh(db_user)
    return db_user

def authenticate_user(db: Session, username: str, password: str) -> Union[models.User, bool]:
    user = get_user_by_username(db, username)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

# Project operations
def get_projects(db: Session, user_id: int, skip: int = 0, limit: int = 100) -> List[models.Project]:
    return db.query(models.Project).filter(models.Project.owner_id == user_id).offset(skip).limit(limit).all()

def get_project(db: Session, project_id: int, user_id: int) -> Optional[models.Project]:
    return db.query(models.Project).filter(
        models.Project.id == project_id, 
        models.Project.owner_id == user_id
    ).first()

def create_project(db: Session, name: str, api_key: str, description: Optional[str], user_id: int) -> models.Project:
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

def update_project(db: Session, project_id: int, api_key: Optional[str], description: Optional[str], user_id: int) -> Optional[models.Project]:
    db_project = get_project(db, project_id, user_id)
    if not db_project:
        return None
    
    if api_key is not None:
        db_project.api_key = api_key
    if description is not None:
        db_project.description = description
    
    db.commit()
    db.refresh(db_project)
    return db_project

def delete_project(db: Session, project_id: int, user_id: int) -> bool:
    db_project = get_project(db, project_id, user_id)
    if not db_project:
        return False
    
    db.delete(db_project)
    db.commit()
    return True

# Log operations
def get_logs(db: Session, project_id: int, user_id: int, skip: int = 0, limit: int = 100, 
            start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[models.Log]:
    query = db.query(models.Log).filter(
        models.Log.project_id == project_id,
        models.Log.user_id == user_id
    )
    
    # Add date filtering if provided
    if start_date:
        query = query.filter(models.Log.created_at >= start_date)
    if end_date:
        query = query.filter(models.Log.created_at <= end_date)
    
    return query.order_by(desc(models.Log.created_at)).offset(skip).limit(limit).all()

def count_logs(db: Session, project_id: int) -> int:
    return db.query(models.Log).filter(models.Log.project_id == project_id).count()

def create_log(db: Session, action: str, details: Optional[str], status: str, project_id: Optional[int], user_id: int) -> models.Log:
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

def delete_old_logs(db: Session, project_id: int, max_entries: int) -> int:
    # Count logs for this project
    log_count = count_logs(db, project_id)
    deleted_count = 0
    
    # If exceeds limit, delete oldest logs (FIFO)
    if log_count > max_entries:
        # Number of logs to delete
        excess = log_count - max_entries
        
        # Find oldest logs
        oldest_logs = db.query(models.Log)\
            .filter(models.Log.project_id == project_id)\
            .order_by(models.Log.created_at)\
            .limit(excess)\
            .all()
        
        # Delete old logs
        for log in oldest_logs:
            db.delete(log)
            deleted_count += 1
        
        db.commit()
    
    return deleted_count
