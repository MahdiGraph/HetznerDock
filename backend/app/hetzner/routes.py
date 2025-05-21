from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import List, Optional
from hcloud import Client
from pydantic import BaseModel
from ..database import crud, models
from ..database.database import get_db
from ..auth.jwt import get_current_user
from ..logging.logger import log_action

router = APIRouter()

# Request models
class ProjectCreate(BaseModel):
    name: str
    api_key: str
    description: Optional[str] = None

class ProjectUpdate(BaseModel):
    api_key: Optional[str] = None
    description: Optional[str] = None

class ServerCreate(BaseModel):
    name: str
    server_type: str
    image: str
    location: Optional[str] = None
    ssh_keys: Optional[List[int]] = None

# Helper function to get Hetzner client
def get_hetzner_client(project_id: int, db: Session, user: models.User):
    project = crud.get_project(db, project_id, user.id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project with ID {project_id} not found")
    
    try:
        client = Client(token=project.api_key)
        # Test connection
        client.server_types.get_all()
        return client, project
    except Exception as e:
        # Log connection error
        log_action(
            db=db,
            action="API_CONNECTION",
            details=f"Error connecting to Hetzner API: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=user.id
        )
        raise HTTPException(status_code=401, detail=f"API connection error: {str(e)}")

# Projects endpoints
@router.get("/projects")
def list_projects(
    skip: int = 0, 
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    projects = crud.get_projects(db, current_user.id, skip, limit)
    return [
        {
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "created_at": p.created_at
        }
        for p in projects
    ]

@router.post("/projects")
def create_project(
    project: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Test if API key is valid
    try:
        client = Client(token=project.api_key)
        client.server_types.get_all()
    except Exception as e:
        # Log failed project creation
        log_action(
            db=db,
            action="PROJECT_CREATE",
            details=f"Failed to create project '{project.name}': Invalid API key",
            status="failed",
            project_id=None,
            user_id=current_user.id
        )
        raise HTTPException(status_code=400, detail=f"Invalid API key: {str(e)}")
    
    db_project = crud.create_project(
        db=db, 
        name=project.name, 
        api_key=project.api_key, 
        description=project.description,
        user_id=current_user.id
    )
    
    # Log successful project creation
    log_action(
        db=db,
        action="PROJECT_CREATE",
        details=f"Project '{project.name}' created successfully",
        status="success",
        project_id=db_project.id,
        user_id=current_user.id
    )
    
    return {
        "id": db_project.id,
        "name": db_project.name,
        "description": db_project.description,
        "created_at": db_project.created_at
    }

@router.put("/projects/{project_id}")
def update_project(
    project_id: int,
    project_data: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # If updating API key, test if it's valid
    if project_data.api_key:
        try:
            client = Client(token=project_data.api_key)
            client.server_types.get_all()
        except Exception as e:
            # Log failed project update
            log_action(
                db=db,
                action="PROJECT_UPDATE",
                details=f"Failed to update project {project_id}: Invalid API key",
                status="failed",
                project_id=project_id,
                user_id=current_user.id
            )
            raise HTTPException(status_code=400, detail=f"Invalid API key: {str(e)}")
    
    updated_project = crud.update_project(
        db=db,
        project_id=project_id,
        api_key=project_data.api_key,
        description=project_data.description,
        user_id=current_user.id
    )
    
    if not updated_project:
        raise HTTPException(status_code=404, detail=f"Project with ID {project_id} not found")
    
    # Log successful project update
    log_action(
        db=db,
        action="PROJECT_UPDATE",
        details=f"Project {project_id} updated successfully",
        status="success",
        project_id=project_id,
        user_id=current_user.id
    )
    
    return {
        "id": updated_project.id,
        "name": updated_project.name,
        "description": updated_project.description,
        "created_at": updated_project.created_at
    }

@router.delete("/projects/{project_id}")
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    success = crud.delete_project(db, project_id, current_user.id)
    
    if not success:
        raise HTTPException(status_code=404, detail=f"Project with ID {project_id} not found")
    
    # Log project deletion
    log_action(
        db=db,
        action="PROJECT_DELETE",
        details=f"Project {project_id} deleted successfully",
        status="success",
        project_id=None,  # Project no longer exists
        user_id=current_user.id
    )
    
    return {"message": "Project deleted successfully"}

# Server endpoints
@router.get("/projects/{project_id}/servers")
def list_servers(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    client, project = get_hetzner_client(project_id, db, current_user)
    
    try:
        servers = client.servers.get_all()
        
        # Log successful server list retrieval
        log_action(
            db=db,
            action="SERVER_LIST",
            details=f"Retrieved {len(servers)} servers",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {
            "servers": [
                {
                    "id": server.id,
                    "name": server.name,
                    "status": server.status,
                    "ip": server.public_net.ipv4.ip if server.public_net.ipv4 else None,
                    "location": server.datacenter.location.name if server.datacenter and server.datacenter.location else None,
                    "server_type": server.server_type.name if server.server_type else None,
                    "image": server.image.name if server.image else None,
                    "created": server.created.isoformat() if server.created else None
                }
                for server in servers
            ]
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="SERVER_LIST",
            details=f"Error retrieving server list: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error retrieving servers: {str(e)}")

@router.post("/projects/{project_id}/servers")
def create_server(
    project_id: int,
    server_data: ServerCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    client, project = get_hetzner_client(project_id, db, current_user)
    
    try:
        response = client.servers.create(
            name=server_data.name,
            server_type=server_data.server_type,
            image=server_data.image,
            location=server_data.location,
            ssh_keys=server_data.ssh_keys
        )
        
        # Log server creation
        log_action(
            db=db,
            action="SERVER_CREATE",
            details=f"Server '{server_data.name}' created successfully",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {
            "server": {
                "id": response.server.id,
                "name": response.server.name,
                "status": response.server.status,
                "ip": response.server.public_net.ipv4.ip if response.server.public_net.ipv4 else None,
            },
            "root_password": response.root_password  # Only available on initial creation
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="SERVER_CREATE",
            details=f"Error creating server '{server_data.name}': {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error creating server: {str(e)}")

@router.get("/projects/{project_id}/servers/{server_id}")
def get_server(
    project_id: int,
    server_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    client, project = get_hetzner_client(project_id, db, current_user)
    
    try:
        server = client.servers.get_by_id(server_id)
        
        # Log server retrieval
        log_action(
            db=db,
            action="SERVER_GET",
            details=f"Retrieved server details for '{server.name}'",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {
            "id": server.id,
            "name": server.name,
            "status": server.status,
            "ip": server.public_net.ipv4.ip if server.public_net.ipv4 else None,
            "location": server.datacenter.location.name if server.datacenter and server.datacenter.location else None,
            "server_type": server.server_type.name if server.server_type else None,
            "image": server.image.name if server.image else None,
            "created": server.created.isoformat() if server.created else None
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="SERVER_GET",
            details=f"Error retrieving server {server_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=404, detail=f"Server not found: {str(e)}")

@router.delete("/projects/{project_id}/servers/{server_id}")
def delete_server(
    project_id: int,
    server_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    client, project = get_hetzner_client(project_id, db, current_user)
    
    try:
        server = client.servers.get_by_id(server_id)
        server_name = server.name
        
        server.delete()
        
        # Log server deletion
        log_action(
            db=db,
            action="SERVER_DELETE",
            details=f"Server '{server_name}' deleted successfully",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {"message": f"Server '{server_name}' deleted successfully"}
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="SERVER_DELETE",
            details=f"Error deleting server {server_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error deleting server: {str(e)}")

# Server power operations
@router.post("/projects/{project_id}/servers/{server_id}/power_on")
def power_on_server(
    project_id: int,
    server_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    client, project = get_hetzner_client(project_id, db, current_user)
    
    try:
        server = client.servers.get_by_id(server_id)
        response = server.power_on()
        
        # Log server power on
        log_action(
            db=db,
            action="SERVER_POWER_ON",
            details=f"Server '{server.name}' powered on successfully",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {"message": f"Server '{server.name}' is powering on"}
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="SERVER_POWER_ON",
            details=f"Error powering on server {server_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error powering on server: {str(e)}")

@router.post("/projects/{project_id}/servers/{server_id}/power_off")
def power_off_server(
    project_id: int,
    server_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    client, project = get_hetzner_client(project_id, db, current_user)
    
    try:
        server = client.servers.get_by_id(server_id)
        response = server.power_off()
        
        # Log server power off
        log_action(
            db=db,
            action="SERVER_POWER_OFF",
            details=f"Server '{server.name}' powered off successfully",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {"message": f"Server '{server.name}' is powering off"}
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="SERVER_POWER_OFF",
            details=f"Error powering off server {server_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error powering off server: {str(e)}")

@router.post("/projects/{project_id}/servers/{server_id}/reboot")
def reboot_server(
    project_id: int,
    server_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    client, project = get_hetzner_client(project_id, db, current_user)
    
    try:
        server = client.servers.get_by_id(server_id)
        response = server.reboot()
        
        # Log server reboot
        log_action(
            db=db,
            action="SERVER_REBOOT",
            details=f"Server '{server.name}' rebooted successfully",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {"message": f"Server '{server.name}' is rebooting"}
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="SERVER_REBOOT",
            details=f"Error rebooting server {server_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error rebooting server: {str(e)}")

# Other Hetzner resources
@router.get("/projects/{project_id}/images")
def list_images(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    client, project = get_hetzner_client(project_id, db, current_user)
    
    try:
        images = client.images.get_all()
        
        # Log images retrieval
        log_action(
            db=db,
            action="IMAGES_LIST",
            details=f"Retrieved {len(images)} images",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {
            "images": [
                {
                    "id": image.id,
                    "name": image.name,
                    "description": image.description,
                    "type": image.type,
                    "os_flavor": image.os_flavor
                }
                for image in images if image.name is not None  # Filter out unnamed images
            ]
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="IMAGES_LIST",
            details=f"Error retrieving images: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error retrieving images: {str(e)}")

@router.get("/projects/{project_id}/server_types")
def list_server_types(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    client, project = get_hetzner_client(project_id, db, current_user)
    
    try:
        server_types = client.server_types.get_all()
        
        # Log server types retrieval
        log_action(
            db=db,
            action="SERVER_TYPES_LIST",
            details=f"Retrieved {len(server_types)} server types",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {
            "server_types": [
                {
                    "id": st.id,
                    "name": st.name,
                    "description": st.description,
                    "cores": st.cores,
                    "memory": st.memory,
                    "disk": st.disk,
                    "prices": [
                        {"location": price.location.name if price.location else "unknown", 
                         "price_monthly": price.price_monthly.gross}
                        for price in st.prices
                    ] if hasattr(st, 'prices') and st.prices else []
                }
                for st in server_types
            ]
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="SERVER_TYPES_LIST",
            details=f"Error retrieving server types: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error retrieving server types: {str(e)}")

# Logs endpoint
@router.get("/projects/{project_id}/logs")
def get_project_logs(
    project_id: int,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Check if project exists and belongs to user
    project = crud.get_project(db, project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project with ID {project_id} not found")
    
    logs = crud.get_logs(db, project_id, current_user.id, skip, limit)
    
    return [
        {
            "id": log.id,
            "action": log.action,
            "details": log.details,
            "status": log.status,
            "created_at": log.created_at
        }
        for log in logs
    ]