from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any, Union
from hcloud import Client
from hcloud.servers.domain import Server as HetznerServer
from pydantic import BaseModel, Field
from datetime import datetime
from ..database import crud, models
from ..database.database import get_db
from ..auth.jwt import get_current_user
from ..app_logger.logger import log_action

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

# SSH Keys models
class SSHKeyCreate(BaseModel):
    name: str
    public_key: str

class SSHKeyUpdate(BaseModel):
    name: Optional[str] = None
    labels: Optional[Dict[str, str]] = None

class SSHKeyResponse(BaseModel):
    id: int
    name: str
    fingerprint: str
    public_key: str
    created: Optional[datetime] = None

# Floating IPs models
class FloatingIPCreate(BaseModel):
    type: str  # ipv4 or ipv6
    description: Optional[str] = None
    home_location: Optional[str] = None
    server: Optional[int] = None  # Server ID to assign the IP to

class FloatingIPUpdate(BaseModel):
    description: Optional[str] = None
    labels: Optional[Dict[str, str]] = None

class FloatingIPAssign(BaseModel):
    server: int  # Server ID to assign the IP to

# Volumes models
class VolumeCreate(BaseModel):
    name: str
    size: int  # Size in GB
    location: Optional[str] = None
    server: Optional[int] = None  # Server ID to attach the volume to
    automount: Optional[bool] = None
    format: Optional[str] = None  # Filesystem format, e.g., "ext4"

class VolumeUpdate(BaseModel):
    name: Optional[str] = None
    labels: Optional[Dict[str, str]] = None

class VolumeResize(BaseModel):
    size: int  # New size in GB

class VolumeAttach(BaseModel):
    server: int
    automount: Optional[bool] = None

# Firewalls models
class FirewallRuleCreate(BaseModel):
    direction: str  # "in" or "out"
    protocol: str  # "tcp", "udp", "icmp"
    source_ips: Optional[List[str]] = None  # For direction="in"
    destination_ips: Optional[List[str]] = None  # For direction="out"
    port: Optional[str] = None  # Port range like "80" or "80-85"
    description: Optional[str] = None

class FirewallCreate(BaseModel):
    name: str
    rules: List[FirewallRuleCreate]
    labels: Optional[Dict[str, str]] = None

class FirewallUpdate(BaseModel):
    name: Optional[str] = None
    labels: Optional[Dict[str, str]] = None

class FirewallResource(BaseModel):
    type: str = "server"  # Currently only "server" is supported
    server: Dict[str, Any]  # {"id": server_id}

# Networks models
class SubnetCreate(BaseModel):
    type: str  # "cloud", "server", "vswitch"
    network_zone: str  # "eu-central", etc.
    ip_range: str
    vswitch_id: Optional[int] = None  # Only for type="vswitch"

class NetworkCreate(BaseModel):
    name: str
    ip_range: str
    subnets: Optional[List[SubnetCreate]] = None
    labels: Optional[Dict[str, str]] = None

class NetworkUpdate(BaseModel):
    name: Optional[str] = None
    labels: Optional[Dict[str, str]] = None

# Load Balancers models
class TargetCreate(BaseModel):
    type: str  # "server" or "ip"
    server_id: Optional[int] = None  # Required for type="server"
    ip: Optional[Dict[str, str]] = None  # Required for type="ip", {ip: str}
    use_private_ip: Optional[bool] = None
    
class LoadBalancerServiceCreate(BaseModel):
    protocol: str  # "http", "https", "tcp"
    listen_port: int
    destination_port: int
    proxyprotocol: Optional[bool] = None
    http: Optional[Dict[str, Any]] = None  # For HTTP(S) health checks
    health_check: Optional[Dict[str, Any]] = None
    
class LoadBalancerCreate(BaseModel):
    name: str
    load_balancer_type: str
    location: Optional[str] = None
    network_zone: Optional[str] = None
    network: Optional[int] = None
    algorithm: Optional[Dict[str, str]] = None  # {type: str}
    services: Optional[List[LoadBalancerServiceCreate]] = None
    targets: Optional[List[TargetCreate]] = None
    labels: Optional[Dict[str, str]] = None

class LoadBalancerUpdate(BaseModel):
    name: Optional[str] = None
    labels: Optional[Dict[str, str]] = None

# Certificates models
class CertificateCreate(BaseModel):
    name: str
    type: str  # "uploaded", "managed"
    certificate: Optional[str] = None  # PEM format, required for type="uploaded"
    private_key: Optional[str] = None  # PEM format, required for type="uploaded"
    domain_names: Optional[List[str]] = None  # Required for type="managed"
    labels: Optional[Dict[str, str]] = None

class CertificateUpdate(BaseModel):
    name: Optional[str] = None
    labels: Optional[Dict[str, str]] = None

# Server additional operations models
class ServerRebuild(BaseModel):
    image: str
    
class ServerEnableRescue(BaseModel):
    type: Optional[str] = None  # "linux32", "linux64", or "freebsd64"
    ssh_keys: Optional[List[int]] = None

class ServerAttachISO(BaseModel):
    iso: str  # ISO name or ID

class ServerRename(BaseModel):
    name: str

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

# Additional server operations (Rebuild)
@router.post("/projects/{project_id}/servers/{server_id}/rebuild")
def rebuild_server(
    project_id: int,
    server_id: int,
    rebuild_data: ServerRebuild,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Rebuild a server with a new image"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        server = client.servers.get_by_id(server_id)
        response = server.rebuild(image=rebuild_data.image)
        
        # Log server rebuild
        log_action(
            db=db,
            action="SERVER_REBUILD",
            details=f"Server '{server.name}' rebuild initiated with image '{rebuild_data.image}'",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {
            "message": f"Server '{server.name}' rebuild initiated",
            "root_password": response.root_password if hasattr(response, "root_password") else None
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="SERVER_REBUILD",
            details=f"Error rebuilding server {server_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error rebuilding server: {str(e)}")

# Enable rescue mode for a server
@router.post("/projects/{project_id}/servers/{server_id}/enable_rescue")
def enable_rescue_mode(
    project_id: int,
    server_id: int,
    rescue_data: ServerEnableRescue = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Enable rescue mode for a server"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        server = client.servers.get_by_id(server_id)
        
        rescue_type = None
        ssh_keys = None
        
        if rescue_data:
            rescue_type = rescue_data.type
            ssh_keys = rescue_data.ssh_keys
            
        response = server.enable_rescue(
            type=rescue_type,
            ssh_keys=ssh_keys
        )
        
        # Log rescue mode enablement
        log_action(
            db=db,
            action="SERVER_ENABLE_RESCUE",
            details=f"Rescue mode enabled for server '{server.name}'",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {
            "message": f"Rescue mode enabled for server '{server.name}'",
            "root_password": response.root_password if hasattr(response, "root_password") else None
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="SERVER_ENABLE_RESCUE",
            details=f"Error enabling rescue mode for server {server_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error enabling rescue mode: {str(e)}")

# Disable rescue mode for a server
@router.post("/projects/{project_id}/servers/{server_id}/disable_rescue")
def disable_rescue_mode(
    project_id: int,
    server_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Disable rescue mode for a server"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        server = client.servers.get_by_id(server_id)
        server.disable_rescue()
        
        # Log rescue mode disablement
        log_action(
            db=db,
            action="SERVER_DISABLE_RESCUE",
            details=f"Rescue mode disabled for server '{server.name}'",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {"message": f"Rescue mode disabled for server '{server.name}'"}
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="SERVER_DISABLE_RESCUE",
            details=f"Error disabling rescue mode for server {server_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error disabling rescue mode: {str(e)}")

# Attach ISO to a server
@router.post("/projects/{project_id}/servers/{server_id}/attach_iso")
def attach_iso(
    project_id: int,
    server_id: int,
    iso_data: ServerAttachISO,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Attach an ISO to a server"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        server = client.servers.get_by_id(server_id)
        server.attach_iso(iso_data.iso)
        
        # Log ISO attachment
        log_action(
            db=db,
            action="SERVER_ATTACH_ISO",
            details=f"ISO '{iso_data.iso}' attached to server '{server.name}'",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {"message": f"ISO '{iso_data.iso}' attached to server '{server.name}'"}
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="SERVER_ATTACH_ISO",
            details=f"Error attaching ISO to server {server_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error attaching ISO: {str(e)}")

# Detach ISO from a server
@router.post("/projects/{project_id}/servers/{server_id}/detach_iso")
def detach_iso(
    project_id: int,
    server_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Detach the ISO from a server"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        server = client.servers.get_by_id(server_id)
        server.detach_iso()
        
        # Log ISO detachment
        log_action(
            db=db,
            action="SERVER_DETACH_ISO",
            details=f"ISO detached from server '{server.name}'",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {"message": f"ISO detached from server '{server.name}'"}
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="SERVER_DETACH_ISO",
            details=f"Error detaching ISO from server {server_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error detaching ISO: {str(e)}")

# Reset server (like pressing the reset button)
@router.post("/projects/{project_id}/servers/{server_id}/reset")
def reset_server(
    project_id: int,
    server_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Reset a server (hard reset)"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        server = client.servers.get_by_id(server_id)
        server.reset()
        
        # Log server reset
        log_action(
            db=db,
            action="SERVER_RESET",
            details=f"Server '{server.name}' reset successfully",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {"message": f"Server '{server.name}' is resetting"}
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="SERVER_RESET",
            details=f"Error resetting server {server_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error resetting server: {str(e)}")

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
                try:
                    for price in st.prices:
                        try:
                            # Safely access price attributes
                            location_name = "unknown"
                            if hasattr(price, 'location') and price.location:
                                location_name = price.location.name if hasattr(price.location, 'name') else "unknown"
                            
                            price_monthly = 0
                            
                            # Try multiple paths to get the price
                            if hasattr(price, 'price_monthly'):
                                if hasattr(price.price_monthly, 'gross'):
                                    price_monthly = float(price.price_monthly.gross)
                                elif hasattr(price.price_monthly, 'net'):
                                    price_monthly = float(price.price_monthly.net)
                                elif isinstance(price.price_monthly, (int, float, str)):
                                    try:
                                        price_monthly = float(price.price_monthly)
                                    except (ValueError, TypeError):
                                        pass
                            
                            # Also try direct pricing info if it exists
                            if hasattr(price, 'gross') and price_monthly == 0:
                                try:
                                    price_monthly = float(price.gross)
                                except (ValueError, TypeError):
                                    pass
                            
                            # If we found a price via any method, add it
                            price_data = {
                                "location": location_name,
                                "price_monthly": price_monthly
                            }
                            server_type_data["prices"].append(price_data)
                        except Exception as e:
                            print(f"Error processing price: {str(e)}")
                            continue
                except Exception as e:
                    print(f"Error iterating prices: {str(e)}")
            
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
        print(f"Server types error: {error_detail}")
        raise HTTPException(status_code=500, detail=error_detail)
    
# SSH Keys endpoints
@router.get("/projects/{project_id}/ssh_keys")
def list_ssh_keys(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get all SSH keys for a project"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        ssh_keys = client.ssh_keys.get_all()
        # Log successful SSH keys list retrieval
        log_action(
            db=db,
            action="SSH_KEYS_LIST",
            details=f"Retrieved {len(ssh_keys)} SSH keys",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        return {
            "ssh_keys": [
                {
                    "id": key.id,
                    "name": key.name,
                    "fingerprint": key.fingerprint,
                    "public_key": key.public_key,
                    "created": key.created.isoformat() if key.created else None
                }
                for key in ssh_keys
            ]
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="SSH_KEYS_LIST",
            details=f"Error retrieving SSH keys list: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error retrieving SSH keys: {str(e)}")

@router.post("/projects/{project_id}/ssh_keys")
def create_ssh_key(
    project_id: int,
    ssh_key_data: SSHKeyCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Create a new SSH key"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        response = client.ssh_keys.create(
            name=ssh_key_data.name,
            public_key=ssh_key_data.public_key
        )
        # Log SSH key creation
        log_action(
            db=db,
            action="SSH_KEY_CREATE",
            details=f"SSH key '{ssh_key_data.name}' created successfully",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        return {
            "id": response.id,
            "name": response.name,
            "fingerprint": response.fingerprint,
            "public_key": response.public_key,
            "created": response.created.isoformat() if response.created else None
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="SSH_KEY_CREATE",
            details=f"Error creating SSH key '{ssh_key_data.name}': {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error creating SSH key: {str(e)}")

@router.get("/projects/{project_id}/ssh_keys/{ssh_key_id}")
def get_ssh_key(
    project_id: int,
    ssh_key_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get details of a specific SSH key"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        ssh_key = client.ssh_keys.get_by_id(ssh_key_id)
        # Log SSH key retrieval
        log_action(
            db=db,
            action="SSH_KEY_GET",
            details=f"Retrieved SSH key details for '{ssh_key.name}'",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        return {
            "id": ssh_key.id,
            "name": ssh_key.name,
            "fingerprint": ssh_key.fingerprint,
            "public_key": ssh_key.public_key,
            "created": ssh_key.created.isoformat() if ssh_key.created else None
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="SSH_KEY_GET",
            details=f"Error retrieving SSH key {ssh_key_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=404, detail=f"SSH key not found: {str(e)}")

@router.put("/projects/{project_id}/ssh_keys/{ssh_key_id}")
def update_ssh_key(
    project_id: int,
    ssh_key_id: int,
    ssh_key_data: SSHKeyUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Update an SSH key"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        ssh_key = client.ssh_keys.get_by_id(ssh_key_id)
        
        if ssh_key_data.name is not None:
            ssh_key.update(name=ssh_key_data.name)
        
        if ssh_key_data.labels is not None:
            ssh_key.update_labels(ssh_key_data.labels)
        
        # Log SSH key update
        log_action(
            db=db,
            action="SSH_KEY_UPDATE",
            details=f"SSH key '{ssh_key.name}' updated successfully",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        # Get updated SSH key
        updated_ssh_key = client.ssh_keys.get_by_id(ssh_key_id)
        
        return {
            "id": updated_ssh_key.id,
            "name": updated_ssh_key.name,
            "fingerprint": updated_ssh_key.fingerprint,
            "public_key": updated_ssh_key.public_key,
            "created": updated_ssh_key.created.isoformat() if updated_ssh_key.created else None
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="SSH_KEY_UPDATE",
            details=f"Error updating SSH key {ssh_key_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error updating SSH key: {str(e)}")

@router.delete("/projects/{project_id}/ssh_keys/{ssh_key_id}")
def delete_ssh_key(
    project_id: int,
    ssh_key_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Delete an SSH key"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        ssh_key = client.ssh_keys.get_by_id(ssh_key_id)
        ssh_key_name = ssh_key.name
        ssh_key.delete()
        
        # Log SSH key deletion
        log_action(
            db=db,
            action="SSH_KEY_DELETE",
            details=f"SSH key '{ssh_key_name}' deleted successfully",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {"message": f"SSH key '{ssh_key_name}' deleted successfully"}
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="SSH_KEY_DELETE",
            details=f"Error deleting SSH key {ssh_key_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error deleting SSH key: {str(e)}")

# Floating IPs endpoints
@router.get("/projects/{project_id}/floating_ips")
def list_floating_ips(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get all floating IPs for a project"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        floating_ips = client.floating_ips.get_all()
        # Log successful floating IPs list retrieval
        log_action(
            db=db,
            action="FLOATING_IPS_LIST",
            details=f"Retrieved {len(floating_ips)} floating IPs",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        return {
            "floating_ips": [
                {
                    "id": ip.id,
                    "description": ip.description,
                    "ip": ip.ip,
                    "type": ip.type,
                    "server": ip.server.id if ip.server else None,
                    "location": ip.home_location.name if ip.home_location else None,
                    "blocked": ip.blocked,
                    "created": ip.created.isoformat() if ip.created else None
                }
                for ip in floating_ips
            ]
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="FLOATING_IPS_LIST",
            details=f"Error retrieving floating IPs list: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error retrieving floating IPs: {str(e)}")

@router.post("/projects/{project_id}/floating_ips")
def create_floating_ip(
    project_id: int,
    floating_ip_data: FloatingIPCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Create a new floating IP"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        create_params = {
            "type": floating_ip_data.type,
            "description": floating_ip_data.description,
        }
        
        if floating_ip_data.home_location:
            create_params["home_location"] = floating_ip_data.home_location
            
        if floating_ip_data.server:
            create_params["server"] = floating_ip_data.server
            
        response = client.floating_ips.create(**create_params)
        
        # Log floating IP creation
        log_action(
            db=db,
            action="FLOATING_IP_CREATE",
            details=f"Floating IP created successfully",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {
            "id": response.floating_ip.id,
            "description": response.floating_ip.description,
            "ip": response.floating_ip.ip,
            "type": response.floating_ip.type,
            "server": response.floating_ip.server.id if response.floating_ip.server else None,
            "location": response.floating_ip.home_location.name if response.floating_ip.home_location else None,
            "blocked": response.floating_ip.blocked,
            "created": response.floating_ip.created.isoformat() if response.floating_ip.created else None
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="FLOATING_IP_CREATE",
            details=f"Error creating floating IP: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error creating floating IP: {str(e)}")

@router.get("/projects/{project_id}/floating_ips/{floating_ip_id}")
def get_floating_ip(
    project_id: int,
    floating_ip_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get details of a specific floating IP"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        floating_ip = client.floating_ips.get_by_id(floating_ip_id)
        # Log floating IP retrieval
        log_action(
            db=db,
            action="FLOATING_IP_GET",
            details=f"Retrieved floating IP details for ID {floating_ip_id}",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        return {
            "id": floating_ip.id,
            "description": floating_ip.description,
            "ip": floating_ip.ip,
            "type": floating_ip.type,
            "server": floating_ip.server.id if floating_ip.server else None,
            "location": floating_ip.home_location.name if floating_ip.home_location else None,
            "blocked": floating_ip.blocked,
            "created": floating_ip.created.isoformat() if floating_ip.created else None
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="FLOATING_IP_GET",
            details=f"Error retrieving floating IP {floating_ip_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=404, detail=f"Floating IP not found: {str(e)}")

@router.put("/projects/{project_id}/floating_ips/{floating_ip_id}")
def update_floating_ip(
    project_id: int,
    floating_ip_id: int,
    floating_ip_data: FloatingIPUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Update a floating IP"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        floating_ip = client.floating_ips.get_by_id(floating_ip_id)
        
        if floating_ip_data.description is not None:
            floating_ip.update(description=floating_ip_data.description)
        
        if floating_ip_data.labels is not None:
            floating_ip.update_labels(floating_ip_data.labels)
        
        # Log floating IP update
        log_action(
            db=db,
            action="FLOATING_IP_UPDATE",
            details=f"Floating IP {floating_ip_id} updated successfully",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        # Get updated floating IP
        updated_floating_ip = client.floating_ips.get_by_id(floating_ip_id)
        
        return {
            "id": updated_floating_ip.id,
            "description": updated_floating_ip.description,
            "ip": updated_floating_ip.ip,
            "type": updated_floating_ip.type,
            "server": updated_floating_ip.server.id if updated_floating_ip.server else None,
            "location": updated_floating_ip.home_location.name if updated_floating_ip.home_location else None,
            "blocked": updated_floating_ip.blocked,
            "created": updated_floating_ip.created.isoformat() if updated_floating_ip.created else None
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="FLOATING_IP_UPDATE",
            details=f"Error updating floating IP {floating_ip_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error updating floating IP: {str(e)}")

@router.delete("/projects/{project_id}/floating_ips/{floating_ip_id}")
def delete_floating_ip(
    project_id: int,
    floating_ip_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Delete a floating IP"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        floating_ip = client.floating_ips.get_by_id(floating_ip_id)
        floating_ip.delete()
        
        # Log floating IP deletion
        log_action(
            db=db,
            action="FLOATING_IP_DELETE",
            details=f"Floating IP {floating_ip_id} deleted successfully",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {"message": f"Floating IP {floating_ip_id} deleted successfully"}
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="FLOATING_IP_DELETE",
            details=f"Error deleting floating IP {floating_ip_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error deleting floating IP: {str(e)}")

@router.post("/projects/{project_id}/floating_ips/{floating_ip_id}/assign")
def assign_floating_ip(
    project_id: int,
    floating_ip_id: int,
    assign_data: FloatingIPAssign,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Assign a floating IP to a server"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        floating_ip = client.floating_ips.get_by_id(floating_ip_id)
        floating_ip.assign(server=assign_data.server)
        
        # Log floating IP assignment
        log_action(
            db=db,
            action="FLOATING_IP_ASSIGN",
            details=f"Floating IP {floating_ip_id} assigned to server {assign_data.server}",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {"message": f"Floating IP {floating_ip_id} assigned to server {assign_data.server}"}
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="FLOATING_IP_ASSIGN",
            details=f"Error assigning floating IP {floating_ip_id} to server: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error assigning floating IP: {str(e)}")

@router.post("/projects/{project_id}/floating_ips/{floating_ip_id}/unassign")
def unassign_floating_ip(
    project_id: int,
    floating_ip_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Unassign a floating IP from a server"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        floating_ip = client.floating_ips.get_by_id(floating_ip_id)
        floating_ip.unassign()
        
        # Log floating IP unassignment
        log_action(
            db=db,
            action="FLOATING_IP_UNASSIGN",
            details=f"Floating IP {floating_ip_id} unassigned",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {"message": f"Floating IP {floating_ip_id} unassigned"}
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="FLOATING_IP_UNASSIGN",
            details=f"Error unassigning floating IP {floating_ip_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error unassigning floating IP: {str(e)}")

# Volumes endpoints
@router.get("/projects/{project_id}/volumes")
def list_volumes(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get all volumes for a project"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        volumes = client.volumes.get_all()
        # Log successful volumes list retrieval
        log_action(
            db=db,
            action="VOLUMES_LIST",
            details=f"Retrieved {len(volumes)} volumes",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        return {
            "volumes": [
                {
                    "id": volume.id,
                    "name": volume.name,
                    "size": volume.size,
                    "location": volume.location.name if volume.location else None,
                    "server": volume.server.id if volume.server else None,
                    "linux_device": volume.linux_device,
                    "protection": {
                        "delete": volume.protection["delete"] if volume.protection else False
                    },
                    "format": volume.format,
                    "created": volume.created.isoformat() if volume.created else None
                }
                for volume in volumes
            ]
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="VOLUMES_LIST",
            details=f"Error retrieving volumes list: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error retrieving volumes: {str(e)}")

@router.post("/projects/{project_id}/volumes")
def create_volume(
    project_id: int,
    volume_data: VolumeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Create a new volume"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        create_params = {
            "name": volume_data.name,
            "size": volume_data.size,
        }
        
        if volume_data.location:
            create_params["location"] = volume_data.location
            
        if volume_data.server:
            create_params["server"] = volume_data.server
            
        if volume_data.automount is not None:
            create_params["automount"] = volume_data.automount
            
        if volume_data.format:
            create_params["format"] = volume_data.format
            
        response = client.volumes.create(**create_params)
        
        # Log volume creation
        log_action(
            db=db,
            action="VOLUME_CREATE",
            details=f"Volume '{volume_data.name}' created successfully",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {
            "id": response.volume.id,
            "name": response.volume.name,
            "size": response.volume.size,
            "location": response.volume.location.name if response.volume.location else None,
            "server": response.volume.server.id if response.volume.server else None,
            "linux_device": response.volume.linux_device,
            "protection": {
                "delete": response.volume.protection["delete"] if response.volume.protection else False
            },
            "format": response.volume.format,
            "created": response.volume.created.isoformat() if response.volume.created else None
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="VOLUME_CREATE",
            details=f"Error creating volume '{volume_data.name}': {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error creating volume: {str(e)}")

@router.get("/projects/{project_id}/volumes/{volume_id}")
def get_volume(
    project_id: int,
    volume_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get details of a specific volume"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        volume = client.volumes.get_by_id(volume_id)
        # Log volume retrieval
        log_action(
            db=db,
            action="VOLUME_GET",
            details=f"Retrieved volume details for '{volume.name}'",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        return {
            "id": volume.id,
            "name": volume.name,
            "size": volume.size,
            "location": volume.location.name if volume.location else None,
            "server": volume.server.id if volume.server else None,
            "linux_device": volume.linux_device,
            "protection": {
                "delete": volume.protection["delete"] if volume.protection else False
            },
            "format": volume.format,
            "created": volume.created.isoformat() if volume.created else None
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="VOLUME_GET",
            details=f"Error retrieving volume {volume_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=404, detail=f"Volume not found: {str(e)}")

@router.put("/projects/{project_id}/volumes/{volume_id}")
def update_volume(
    project_id: int,
    volume_id: int,
    volume_data: VolumeUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Update a volume"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        volume = client.volumes.get_by_id(volume_id)
        
        if volume_data.name is not None:
            volume.update(name=volume_data.name)
        
        if volume_data.labels is not None:
            volume.update_labels(volume_data.labels)
        
        # Log volume update
        log_action(
            db=db,
            action="VOLUME_UPDATE",
            details=f"Volume {volume_id} updated successfully",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        # Get updated volume
        updated_volume = client.volumes.get_by_id(volume_id)
        
        return {
            "id": updated_volume.id,
            "name": updated_volume.name,
            "size": updated_volume.size,
            "location": updated_volume.location.name if updated_volume.location else None,
            "server": updated_volume.server.id if updated_volume.server else None,
            "linux_device": updated_volume.linux_device,
            "protection": {
                "delete": updated_volume.protection["delete"] if updated_volume.protection else False
            },
            "format": updated_volume.format,
            "created": updated_volume.created.isoformat() if updated_volume.created else None
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="VOLUME_UPDATE",
            details=f"Error updating volume {volume_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error updating volume: {str(e)}")

@router.delete("/projects/{project_id}/volumes/{volume_id}")
def delete_volume(
    project_id: int,
    volume_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Delete a volume"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        volume = client.volumes.get_by_id(volume_id)
        volume_name = volume.name
        volume.delete()
        
        # Log volume deletion
        log_action(
            db=db,
            action="VOLUME_DELETE",
            details=f"Volume '{volume_name}' deleted successfully",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {"message": f"Volume '{volume_name}' deleted successfully"}
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="VOLUME_DELETE",
            details=f"Error deleting volume {volume_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error deleting volume: {str(e)}")

@router.post("/projects/{project_id}/volumes/{volume_id}/resize")
def resize_volume(
    project_id: int,
    volume_id: int,
    resize_data: VolumeResize,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Resize a volume"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        volume = client.volumes.get_by_id(volume_id)
        volume.resize(size=resize_data.size)
        
        # Log volume resize
        log_action(
            db=db,
            action="VOLUME_RESIZE",
            details=f"Volume {volume_id} resized to {resize_data.size}GB",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {"message": f"Volume {volume_id} resized to {resize_data.size}GB"}
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="VOLUME_RESIZE",
            details=f"Error resizing volume {volume_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error resizing volume: {str(e)}")

@router.post("/projects/{project_id}/volumes/{volume_id}/attach")
def attach_volume(
    project_id: int,
    volume_id: int,
    attach_data: VolumeAttach,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Attach a volume to a server"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        volume = client.volumes.get_by_id(volume_id)
        
        attach_params = {
            "server": attach_data.server
        }
        
        if attach_data.automount is not None:
            attach_params["automount"] = attach_data.automount
        
        volume.attach(**attach_params)
        
        # Log volume attachment
        log_action(
            db=db,
            action="VOLUME_ATTACH",
            details=f"Volume {volume_id} attached to server {attach_data.server}",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {"message": f"Volume {volume_id} attached to server {attach_data.server}"}
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="VOLUME_ATTACH",
            details=f"Error attaching volume {volume_id} to server: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error attaching volume: {str(e)}")

@router.post("/projects/{project_id}/volumes/{volume_id}/detach")
def detach_volume(
    project_id: int,
    volume_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Detach a volume from a server"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        volume = client.volumes.get_by_id(volume_id)
        volume.detach()
        
        # Log volume detachment
        log_action(
            db=db,
            action="VOLUME_DETACH",
            details=f"Volume {volume_id} detached",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {"message": f"Volume {volume_id} detached"}
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="VOLUME_DETACH",
            details=f"Error detaching volume {volume_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error detaching volume: {str(e)}")

# Firewalls endpoints
@router.get("/projects/{project_id}/firewalls")
def list_firewalls(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get all firewalls for a project"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        firewalls = client.firewalls.get_all()
        # Log successful firewalls list retrieval
        log_action(
            db=db,
            action="FIREWALLS_LIST",
            details=f"Retrieved {len(firewalls)} firewalls",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        return {
            "firewalls": [
                {
                    "id": fw.id,
                    "name": fw.name,
                    "rules": [
                        {
                            "direction": rule.direction,
                            "protocol": rule.protocol,
                            "source_ips": rule.source_ips if hasattr(rule, 'source_ips') else None,
                            "destination_ips": rule.destination_ips if hasattr(rule, 'destination_ips') else None,
                            "port": rule.port if hasattr(rule, 'port') else None,
                            "description": rule.description if hasattr(rule, 'description') else None
                        } 
                        for rule in fw.rules
                    ],
                    "applied_to": [
                        {
                            "type": applied.type,
                            "server": {
                                "id": applied.server.id,
                                "name": applied.server.name
                            } if applied.server else None
                        }
                        for applied in fw.applied_to
                    ] if hasattr(fw, 'applied_to') else [],
                    "created": fw.created.isoformat() if hasattr(fw, 'created') and fw.created else None
                }
                for fw in firewalls
            ]
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="FIREWALLS_LIST",
            details=f"Error retrieving firewalls list: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error retrieving firewalls: {str(e)}")

@router.post("/projects/{project_id}/firewalls")
def create_firewall(
    project_id: int,
    firewall_data: FirewallCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Create a new firewall"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        # Convert rules to the format expected by the API
        rules = []
        for rule in firewall_data.rules:
            rule_dict = {
                "direction": rule.direction,
                "protocol": rule.protocol
            }
            if rule.direction == "in" and rule.source_ips:
                rule_dict["source_ips"] = rule.source_ips
            elif rule.direction == "out" and rule.destination_ips:
                rule_dict["destination_ips"] = rule.destination_ips
            if rule.port:
                rule_dict["port"] = rule.port
            if rule.description:
                rule_dict["description"] = rule.description
            rules.append(rule_dict)
        
        response = client.firewalls.create(
            name=firewall_data.name,
            rules=rules,
            labels=firewall_data.labels
        )
        
        # Log firewall creation
        log_action(
            db=db,
            action="FIREWALL_CREATE",
            details=f"Firewall '{firewall_data.name}' created successfully",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {
            "id": response.firewall.id,
            "name": response.firewall.name,
            "rules": [
                {
                    "direction": rule.direction,
                    "protocol": rule.protocol,
                    "source_ips": rule.source_ips if hasattr(rule, 'source_ips') else None,
                    "destination_ips": rule.destination_ips if hasattr(rule, 'destination_ips') else None,
                    "port": rule.port if hasattr(rule, 'port') else None,
                    "description": rule.description if hasattr(rule, 'description') else None
                }
                for rule in response.firewall.rules
            ],
            "created": response.firewall.created.isoformat() if hasattr(response.firewall, 'created') and response.firewall.created else None
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="FIREWALL_CREATE",
            details=f"Error creating firewall '{firewall_data.name}': {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error creating firewall: {str(e)}")

@router.get("/projects/{project_id}/firewalls/{firewall_id}")
def get_firewall(
    project_id: int,
    firewall_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get details of a specific firewall"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        firewall = client.firewalls.get_by_id(firewall_id)
        # Log firewall retrieval
        log_action(
            db=db,
            action="FIREWALL_GET",
            details=f"Retrieved firewall details for '{firewall.name}'",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        return {
            "id": firewall.id,
            "name": firewall.name,
            "rules": [
                {
                    "direction": rule.direction,
                    "protocol": rule.protocol,
                    "source_ips": rule.source_ips if hasattr(rule, 'source_ips') else None,
                    "destination_ips": rule.destination_ips if hasattr(rule, 'destination_ips') else None,
                    "port": rule.port if hasattr(rule, 'port') else None,
                    "description": rule.description if hasattr(rule, 'description') else None
                }
                for rule in firewall.rules
            ],
            "applied_to": [
                {
                    "type": applied.type,
                    "server": {
                        "id": applied.server.id,
                        "name": applied.server.name
                    } if applied.server else None
                }
                for applied in firewall.applied_to
            ] if hasattr(firewall, 'applied_to') else [],
            "created": firewall.created.isoformat() if hasattr(firewall, 'created') and firewall.created else None
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="FIREWALL_GET",
            details=f"Error retrieving firewall {firewall_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=404, detail=f"Firewall not found: {str(e)}")

@router.put("/projects/{project_id}/firewalls/{firewall_id}")
def update_firewall(
    project_id: int,
    firewall_id: int,
    firewall_data: FirewallUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Update a firewall"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        firewall = client.firewalls.get_by_id(firewall_id)
        
        if firewall_data.name is not None:
            firewall.update(name=firewall_data.name)
        
        if firewall_data.labels is not None:
            firewall.update_labels(firewall_data.labels)
        
        # Log firewall update
        log_action(
            db=db,
            action="FIREWALL_UPDATE",
            details=f"Firewall {firewall_id} updated successfully",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        # Get updated firewall
        updated_firewall = client.firewalls.get_by_id(firewall_id)
        
        return {
            "id": updated_firewall.id,
            "name": updated_firewall.name,
            "rules": [
                {
                    "direction": rule.direction,
                    "protocol": rule.protocol,
                    "source_ips": rule.source_ips if hasattr(rule, 'source_ips') else None,
                    "destination_ips": rule.destination_ips if hasattr(rule, 'destination_ips') else None,
                    "port": rule.port if hasattr(rule, 'port') else None,
                    "description": rule.description if hasattr(rule, 'description') else None
                }
                for rule in updated_firewall.rules
            ]
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="FIREWALL_UPDATE",
            details=f"Error updating firewall {firewall_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error updating firewall: {str(e)}")

@router.delete("/projects/{project_id}/firewalls/{firewall_id}")
def delete_firewall(
    project_id: int,
    firewall_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Delete a firewall"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        firewall = client.firewalls.get_by_id(firewall_id)
        firewall_name = firewall.name
        firewall.delete()
        
        # Log firewall deletion
        log_action(
            db=db,
            action="FIREWALL_DELETE",
            details=f"Firewall '{firewall_name}' deleted successfully",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {"message": f"Firewall '{firewall_name}' deleted successfully"}
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="FIREWALL_DELETE",
            details=f"Error deleting firewall {firewall_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error deleting firewall: {str(e)}")

# Networks endpoints
@router.get("/projects/{project_id}/networks")
def list_networks(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get all networks for a project"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        networks = client.networks.get_all()
        # Log successful networks list retrieval
        log_action(
            db=db,
            action="NETWORKS_LIST",
            details=f"Retrieved {len(networks)} networks",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        return {
            "networks": [
                {
                    "id": network.id,
                    "name": network.name,
                    "ip_range": network.ip_range,
                    "subnets": [
                        {
                            "type": subnet.type,
                            "ip_range": subnet.ip_range,
                            "network_zone": subnet.network_zone,
                            "gateway": subnet.gateway
                        }
                        for subnet in network.subnets
                    ],
                    "routes": [
                        {
                            "destination": route.destination,
                            "gateway": route.gateway
                        }
                        for route in network.routes
                    ],
                    "servers": [server.id for server in network.servers] if hasattr(network, 'servers') else [],
                    "labels": network.labels,
                    "created": network.created.isoformat() if hasattr(network, 'created') and network.created else None
                }
                for network in networks
            ]
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="NETWORKS_LIST",
            details=f"Error retrieving networks list: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error retrieving networks: {str(e)}")

@router.post("/projects/{project_id}/networks")
def create_network(
    project_id: int,
    network_data: NetworkCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Create a new network"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        create_params = {
            "name": network_data.name,
            "ip_range": network_data.ip_range,
        }
        
        if network_data.labels:
            create_params["labels"] = network_data.labels
            
        if network_data.subnets:
            create_params["subnets"] = [
                {
                    "type": subnet.type,
                    "network_zone": subnet.network_zone,
                    "ip_range": subnet.ip_range,
                    "vswitch_id": subnet.vswitch_id
                }
                for subnet in network_data.subnets
            ]
            
        response = client.networks.create(**create_params)
        
        # Log network creation
        log_action(
            db=db,
            action="NETWORK_CREATE",
            details=f"Network '{network_data.name}' created successfully",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {
            "id": response.network.id,
            "name": response.network.name,
            "ip_range": response.network.ip_range,
            "subnets": [
                {
                    "type": subnet.type,
                    "ip_range": subnet.ip_range,
                    "network_zone": subnet.network_zone,
                    "gateway": subnet.gateway
                }
                for subnet in response.network.subnets
            ],
            "created": response.network.created.isoformat() if hasattr(response.network, 'created') and response.network.created else None
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="NETWORK_CREATE",
            details=f"Error creating network '{network_data.name}': {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error creating network: {str(e)}")

@router.get("/projects/{project_id}/networks/{network_id}")
def get_network(
    project_id: int,
    network_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get details of a specific network"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        network = client.networks.get_by_id(network_id)
        # Log network retrieval
        log_action(
            db=db,
            action="NETWORK_GET",
            details=f"Retrieved network details for '{network.name}'",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        return {
            "id": network.id,
            "name": network.name,
            "ip_range": network.ip_range,
            "subnets": [
                {
                    "type": subnet.type,
                    "ip_range": subnet.ip_range,
                    "network_zone": subnet.network_zone,
                    "gateway": subnet.gateway
                }
                for subnet in network.subnets
            ],
            "routes": [
                {
                    "destination": route.destination,
                    "gateway": route.gateway
                }
                for route in network.routes
            ],
            "servers": [server.id for server in network.servers] if hasattr(network, 'servers') else [],
            "labels": network.labels,
            "created": network.created.isoformat() if hasattr(network, 'created') and network.created else None
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="NETWORK_GET",
            details=f"Error retrieving network {network_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=404, detail=f"Network not found: {str(e)}")

@router.put("/projects/{project_id}/networks/{network_id}")
def update_network(
    project_id: int,
    network_id: int,
    network_data: NetworkUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Update a network"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        network = client.networks.get_by_id(network_id)
        
        if network_data.name is not None:
            network.update(name=network_data.name)
        
        if network_data.labels is not None:
            network.update_labels(network_data.labels)
        
        # Log network update
        log_action(
            db=db,
            action="NETWORK_UPDATE",
            details=f"Network {network_id} updated successfully",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        # Get updated network
        updated_network = client.networks.get_by_id(network_id)
        
        return {
            "id": updated_network.id,
            "name": updated_network.name,
            "ip_range": updated_network.ip_range,
            "subnets": [
                {
                    "type": subnet.type,
                    "ip_range": subnet.ip_range,
                    "network_zone": subnet.network_zone,
                    "gateway": subnet.gateway
                }
                for subnet in updated_network.subnets
            ],
            "labels": updated_network.labels
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="NETWORK_UPDATE",
            details=f"Error updating network {network_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error updating network: {str(e)}")

@router.delete("/projects/{project_id}/networks/{network_id}")
def delete_network(
    project_id: int,
    network_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Delete a network"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        network = client.networks.get_by_id(network_id)
        network_name = network.name
        network.delete()
        
        # Log network deletion
        log_action(
            db=db,
            action="NETWORK_DELETE",
            details=f"Network '{network_name}' deleted successfully",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        return {"message": f"Network '{network_name}' deleted successfully"}
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="NETWORK_DELETE",
            details=f"Error deleting network {network_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error deleting network: {str(e)}")

# ISOs endpoints
@router.get("/projects/{project_id}/isos")
def list_isos(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get all ISOs available for a project"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        isos = client.isos.get_all()
        # Log ISOs retrieval
        log_action(
            db=db,
            action="ISOS_LIST",
            details=f"Retrieved {len(isos)} ISOs",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        return {
            "isos": [
                {
                    "id": iso.id,
                    "name": iso.name,
                    "description": iso.description,
                    "type": iso.type,
                    "architecture": getattr(iso, 'architecture', None),
                    "deprecated": iso.deprecated,
                    "size": getattr(iso, 'size', None)
                }
                for iso in isos
            ]
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="ISOS_LIST",
            details=f"Error retrieving ISOs list: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error retrieving ISOs: {str(e)}")

@router.get("/projects/{project_id}/pricing")
def get_pricing(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get pricing information"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        pricing = client.pricing.get()
        # Log pricing retrieval
        log_action(
            db=db,
            action="PRICING_GET",
            details=f"Retrieved pricing information",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        # Extract pricing data safely
        pricing_data = {}
        
        # Server types
        if hasattr(pricing, "server_types"):
            pricing_data["server_types"] = {}
            try:
                for server_type, prices in pricing.server_types.items():
                    try:
                        monthly = None
                        hourly = None
                        
                        if hasattr(prices, "price_monthly") and prices.price_monthly:
                            if hasattr(prices.price_monthly, "gross"):
                                monthly = float(prices.price_monthly.gross)
                            elif hasattr(prices.price_monthly, "net"):
                                monthly = float(prices.price_monthly.net)
                        
                        if hasattr(prices, "price_hourly") and prices.price_hourly:
                            if hasattr(prices.price_hourly, "gross"):
                                hourly = float(prices.price_hourly.gross)
                            elif hasattr(prices.price_hourly, "net"):
                                hourly = float(prices.price_hourly.net)
                        
                        pricing_data["server_types"][server_type] = {
                            "monthly": monthly,
                            "hourly": hourly
                        }
                    except Exception:
                        # Skip this server type if there's an issue
                        continue
            except Exception:
                # Handle case where server_types is not iterable
                pass
        
        # Images
        if hasattr(pricing, "images") and pricing.images:
            price_per_gb = None
            try:
                if hasattr(pricing.images, "price_per_gb_month"):
                    if hasattr(pricing.images.price_per_gb_month, "gross"):
                        price_per_gb = float(pricing.images.price_per_gb_month.gross)
                    elif hasattr(pricing.images.price_per_gb_month, "net"):
                        price_per_gb = float(pricing.images.price_per_gb_month.net)
            except Exception:
                pass
            
            pricing_data["images"] = {
                "price_per_gb_month": price_per_gb
            }
        
        # Volumes
        if hasattr(pricing, "volumes") and pricing.volumes:
            price_per_gb = None
            try:
                if hasattr(pricing.volumes, "price_per_gb_month"):
                    if hasattr(pricing.volumes.price_per_gb_month, "gross"):
                        price_per_gb = float(pricing.volumes.price_per_gb_month.gross)
                    elif hasattr(pricing.volumes.price_per_gb_month, "net"):
                        price_per_gb = float(pricing.volumes.price_per_gb_month.net)
            except Exception:
                pass
            
            pricing_data["volumes"] = {
                "price_per_gb_month": price_per_gb
            }
        
        # Floating IPs
        if hasattr(pricing, "floating_ips") and pricing.floating_ips:
            price_monthly = None
            try:
                if hasattr(pricing.floating_ips, "price_monthly"):
                    if hasattr(pricing.floating_ips.price_monthly, "gross"):
                        price_monthly = float(pricing.floating_ips.price_monthly.gross)
                    elif hasattr(pricing.floating_ips.price_monthly, "net"):
                        price_monthly = float(pricing.floating_ips.price_monthly.net)
            except Exception:
                pass
            
            pricing_data["floating_ips"] = {
                "price_monthly": price_monthly
            }
        
        # Return the extracted pricing data
        return pricing_data
        
    except Exception as e:
        # Log error with more details
        log_action(
            db=db,
            action="PRICING_GET",
            details=f"Error retrieving pricing information: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        print(f"Pricing error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving pricing information: {str(e)}")
    
@router.get("/projects/{project_id}/actions")
def list_actions(
    project_id: int,
    resource_type: Optional[str] = Query(None, regex="^(server|volume|firewall|load_balancer|network|floating_ip)$"),
    resource_id: Optional[int] = Query(None, ge=1),
    status: Optional[str] = Query(None, regex="^(running|success|error)$"),
    sort: str = Query("id:desc"),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Get action logs from Hetzner API with filtering and pagination"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        # Get actions based on filters
        if resource_type and resource_id:
            # If both resource type and ID are provided
            if resource_type == 'server':
                actions = client.servers.get_actions_list(resource_id, status=status, sort=sort, page=page, per_page=per_page)
            elif resource_type == 'volume':
                actions = client.volumes.get_actions_list(resource_id, status=status, sort=sort, page=page, per_page=per_page)
            elif resource_type == 'floating_ip':
                actions = client.floating_ips.get_actions_list(resource_id, status=status, sort=sort, page=page, per_page=per_page)
            elif resource_type == 'network':
                actions = client.networks.get_actions_list(resource_id, status=status, sort=sort, page=page, per_page=per_page)
            elif resource_type == 'firewall':
                actions = client.firewalls.get_actions_list(resource_id, status=status, sort=sort, page=page, per_page=per_page)
            elif resource_type == 'load_balancer':
                actions = client.load_balancers.get_actions_list(resource_id, status=status, sort=sort, page=page, per_page=per_page)
            else:
                actions = client.actions.get_all(status=status, sort=sort, page=page, per_page=per_page)
        else:
            # Get all actions
            actions = client.actions.get_all(status=status, sort=sort, page=page, per_page=per_page)
        
        # Log actions retrieval
        log_action(
            db=db,
            action="ACTIONS_LIST",
            details=f"Retrieved action logs from Hetzner API",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        result_actions = []
        for action in actions:
            try:
                action_data = {
                    "id": action.id,
                    "command": action.command if hasattr(action, 'command') else "unknown",
                    "status": action.status if hasattr(action, 'status') else "unknown",
                    "progress": action.progress if hasattr(action, 'progress') else 0,
                    "started": action.started.isoformat() if hasattr(action, 'started') and action.started else None,
                    "finished": action.finished.isoformat() if hasattr(action, 'finished') and action.finished else None,
                    "resources": [],
                    "error": None
                }
                
                # Safely extract resources
                if hasattr(action, 'resources') and action.resources:
                    for resource in action.resources:
                        try:
                            resource_data = {
                                "id": resource.id if hasattr(resource, 'id') else None,
                                "type": resource.type if hasattr(resource, 'type') else "unknown"
                            }
                            action_data["resources"].append(resource_data)
                        except Exception:
                            # Skip this resource if there's an issue
                            continue
                
                # Safely extract error
                if hasattr(action, 'error') and action.error:
                    try:
                        if isinstance(action.error, dict):
                            action_data["error"] = {
                                "code": action.error.get("code"),
                                "message": action.error.get("message")
                            }
                        else:
                            # Handle case where error is not a dictionary
                            action_data["error"] = {
                                "code": None,
                                "message": str(action.error)
                            }
                    except Exception:
                        # If we can't extract error details, just set to None
                        action_data["error"] = None
                
                result_actions.append(action_data)
            except Exception as e:
                # Skip this action if there's an issue
                print(f"Error processing action: {str(e)}")
                continue
        
        # Make sure we have consistent pagination metadata
        total_entries = 0
        try:
            total_entries = getattr(actions, "total_entries", len(result_actions))
        except Exception:
            total_entries = len(result_actions)
        
        return {
            "actions": result_actions,
            "meta": {
                "pagination": {
                    "page": page,
                    "per_page": per_page,
                    "total_entries": total_entries
                }
            }
        }
    except Exception as e:
        # Log error with more details
        error_details = f"Error retrieving action logs: {str(e)}"
        log_action(
            db=db,
            action="ACTIONS_LIST",
            details=error_details,
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        print(error_details)
        raise HTTPException(status_code=500, detail=error_details)
    
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

@router.put("/projects/{project_id}/servers/{server_id}/rename")
def rename_server(
    project_id: int,
    server_id: int,
    rename_data: ServerRename,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Rename a server"""
    client, project = get_hetzner_client(project_id, db, current_user)
    try:
        server = client.servers.get_by_id(server_id)
        server.update(name=rename_data.name)
        
        # Log server rename
        log_action(
            db=db,
            action="SERVER_RENAME",
            details=f"Server {server_id} renamed to '{rename_data.name}'",
            status="success",
            project_id=project.id,
            user_id=current_user.id
        )
        
        # Get updated server details
        updated_server = client.servers.get_by_id(server_id)
        
        return {
            "message": f"Server renamed successfully to '{rename_data.name}'",
            "server": {
                "id": updated_server.id,
                "name": updated_server.name,
                "status": updated_server.status.lower(),
                "ip": updated_server.public_net.ipv4.ip if updated_server.public_net and updated_server.public_net.ipv4 else None,
                "location": updated_server.datacenter.location.name if updated_server.datacenter and updated_server.datacenter.location else None,
                "server_type": updated_server.server_type.name if updated_server.server_type else None,
                "image": updated_server.image.name if updated_server.image else None,
                "created": updated_server.created.isoformat() if updated_server.created else None
            }
        }
    except Exception as e:
        # Log error
        log_action(
            db=db,
            action="SERVER_RENAME",
            details=f"Error renaming server {server_id}: {str(e)}",
            status="failed",
            project_id=project.id,
            user_id=current_user.id
        )
        raise HTTPException(status_code=500, detail=f"Error renaming server: {str(e)}")