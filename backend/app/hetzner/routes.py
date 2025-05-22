from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from hcloud import Client
from hcloud.servers.domain import Server as HetznerServer
from pydantic import BaseModel, Field
from datetime import datetime
from ..database import crud, models
from ..database.database import get_db
from ..auth.jwt import get_current_user
from ..logging.logger import log_action

router = APIRouter()

# Request and response models
class ProjectCreate(BaseModel):
    name: str
    api_key: str
    description: Optional[str] = None

class ProjectUpdate(BaseModel):
    api_key: Optional[str] = None
    description: Optional[str] = None

class ProjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime

    class Config:
        orm_mode = True  # Add this line to enable ORM mode

class ServerCreate(BaseModel):
    name: str
    server_type: str
    image: str
    location: Optional[str] = None
    ssh_keys: Optional[List[int]] = None

class ServerResponse(BaseModel):
    id: int
    name: str
    status: str
    ip: Optional[str] = None
    location: Optional[str] = None
    server_type: Optional[str] = None
    image: Optional[str] = None
    created: Optional[datetime] = None

class LogResponse(BaseModel):
    id: int
    action: str
    details: Optional[str] = None
    status: str
    created_at: datetime

    class Config:
        orm_mode = True  # Add this line too

# Helper function to get Hetzner client
def get_hetzner_client(project_id: int, db: Session, user: models.User):
    project = crud.get_project(db, project_id, user.id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project with ID {project_id} not found")
    
    try:
        client = Client(token=project.api_key)
        # Test connection with a lightweight call
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
@router.get("/projects", response_model=List[ProjectResponse])
def list_projects(
    skip: int = 0, 
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get all projects for the current user"""
    projects = crud.get_projects(db, current_user.id, skip, limit)
    return projects

@router.get("/projects/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get details of a specific project"""
    project = crud.get_project(db, project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project with ID {project_id} not found")
    return project

@router.post("/projects", response_model=ProjectResponse)
def create_project(
    project: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Create a new project"""
    # Test if API key is valid
    try:
        client = Client(token=project.api_key)
        client.server_types.get_all()
    except Exception as e:
        # Log failed project creation
        log_action(
            db=db,
            action="PROJECT_CREATE",
            details=f"Failed to create project '{project.name}': Invalid API key: {str(e)}",
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
    
    return db_project

@router.put("/projects/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: int,
    project_data: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Update an existing project"""
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
                details=f"Failed to update project {project_id}: Invalid API key: {str(e)}",
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
    
    return updated_project

@router.delete("/projects/{project_id}")
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Delete a project"""
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
    """Get all servers for a project"""
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
                    "status": server.status.lower(),  # Normalize status
                    "ip": server.public_net.ipv4.ip if server.public_net and server.public_net.ipv4 else None,
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
    """Create a new server"""
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
                "status": response.server.status.lower(),  # Normalize status
                "ip": response.server.public_net.ipv4.ip if response.server.public_net and response.server.public_net.ipv4 else None,
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
    """Get details of a specific server"""
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
            "status": server.status.lower(),  # Normalize status
            "ip": server.public_net.ipv4.ip if server.public_net and server.public_net.ipv4 else None,
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
    """Delete a server"""
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
    """Power on a server"""
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
    """Power off a server"""
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
    """Reboot a server"""
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

# Project statistics endpoint (new)
@router.get("/projects/{project_id}/stats")
def get_project_stats(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get statistics for a project"""
    client, project = get_hetzner_client(project_id, db, current_user)
    
    try:
        servers = client.servers.get_all()
        images = client.images.get_all()
        server_types = client.server_types.get_all()
        
        # Filter images for just system images with names
        filtered_images = [img for img in images if img.name is not None]
        
        stats = {
            "servers_count": len(servers),
            "images_count": len(filtered_images),
            "server_types_count": len(server_types)
        }
        
        # Log stats retrieval
        log_action(
            db=db,
            action="PROJECT_STATS",
            details=f"Retrieved project statistics",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return stats
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="PROJECT_STATS",
            details=f"Error retrieving project stats: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error retrieving project stats: {str(e)}")

# Other Hetzner resources
@router.get("/projects/{project_id}/images")
def list_images(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get all available OS images"""
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
    """Get all available server types"""
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
        
        # Process server types with better error handling
        result = []
        for st in server_types:
            server_type_data = {
                "id": st.id,
                "name": st.name,
                "description": st.description or "",
                "cores": st.cores,
                "memory": st.memory,
                "disk": st.disk,
                "prices": []
            }
            
            # Safely handle prices
            if hasattr(st, 'prices') and st.prices:
                for price in st.prices:
                    try:
                        # Safely access price attributes
                        location_name = "unknown"
                        if hasattr(price, 'location') and price.location:
                            location_name = price.location.name
                        
                        price_monthly = 0
                        if hasattr(price, 'price_monthly') and price.price_monthly:
                            if hasattr(price.price_monthly, 'gross'):
                                price_monthly = price.price_monthly.gross
                        
                        price_data = {
                            "location": location_name,
                            "price_monthly": price_monthly
                        }
                        server_type_data["prices"].append(price_data)
                    except Exception as e:
                        # Skip this price if there's an issue
                        continue
            
            result.append(server_type_data)
        
        return {
            "server_types": result
        }
    except Exception as e:
        # Log error with more details
        error_detail = f"Error retrieving server types: {str(e)}"
        log_action(
            db=db,
            action="SERVER_TYPES_LIST",
            details=error_detail,
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        print(f"Server types error: {error_detail}")  # Print to server logs
        raise HTTPException(status_code=500, detail=error_detail)

# Logs endpoint
@router.get("/projects/{project_id}/logs", response_model=List[LogResponse])
def get_project_logs(
    project_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get logs for a project with filtering options"""
    # Check if project exists and belongs to user
    project = crud.get_project(db, project_id, current_user.id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project with ID {project_id} not found")
    
    logs = crud.get_logs(db, project_id, current_user.id, skip, limit, start_date, end_date)
    
    return logs
