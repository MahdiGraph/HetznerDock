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
):
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
    
    # If project_id exists, check if log count exceeds limit
    if project_id:
        # Count logs for this project
        log_count = crud.count_logs(db, project_id)
        
        # If exceeds limit, delete oldest logs (FIFO)
        if log_count > settings.LOG_MAX_ENTRIES:
            # Number of logs to delete
            excess = log_count - settings.LOG_MAX_ENTRIES
            
            # Find oldest logs
            oldest_logs = db.query(models.Log)\
                .filter(models.Log.project_id == project_id)\
                .order_by(models.Log.created_at)\
                .limit(excess)\
                .all()
            
            # Delete old logs
            for log in oldest_logs:
                db.delete(log)
            
            db.commit()
    
    return db_log