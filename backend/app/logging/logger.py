from sqlalchemy.orm import Session
from ..database import crud, models
from typing import Optional
from ..config import settings

def log_action(
    db: Session, 
    action: str, 
    details: Optional[str], 
    status: str, 
    project_id: Optional[int],
    user_id: int
) -> models.Log:
    """
    Store logs with FIFO mechanism - when count exceeds limit, oldest logs are deleted
    """
    # Create new log
    db_log = crud.create_log(
        db=db,
        action=action,
        details=details,
        status=status,
        project_id=project_id,
        user_id=user_id
    )
    
    # If project_id exists, check if log count exceeds limit and clean up old logs
    if project_id:
        crud.delete_old_logs(db, project_id, settings.LOG_MAX_ENTRIES)
    
    return db_log
