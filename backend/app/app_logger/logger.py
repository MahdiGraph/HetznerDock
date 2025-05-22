from sqlalchemy.orm import Session
from ..database import crud, models
from typing import Optional
import logging as python_logging

# Set up proper Python logging
logger = python_logging.getLogger("hetznerdock")

def log_action(
    db: Session, 
    action: str, 
    details: Optional[str], 
    status: str, 
    project_id: Optional[int],
    user_id: int
):
    """
    Store logs with FIFO mechanism - when count exceeds limit, oldest logs are deleted
    """
    # Log to Python's logging system as well
    if status == "failed":
        logger.error(f"Action: {action}, Details: {details}, Status: {status}")
    else:
        logger.info(f"Action: {action}, Details: {details}, Status: {status}")
    
    # Create new log in database
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
        try:
            from ..config import settings
            crud.delete_old_logs(db, project_id, settings.LOG_MAX_ENTRIES)
        except Exception as e:
            logger.error(f"Error cleaning up old logs: {str(e)}")
    
    return db_log
