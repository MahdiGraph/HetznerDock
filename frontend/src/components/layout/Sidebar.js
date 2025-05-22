import React from 'react';
import { Layout, Menu } from 'antd';
import { Link } from 'react-router-dom';
import {
  HomeOutlined,
  CodeOutlined,
  CloudServerOutlined,
  SettingOutlined,
  HistoryOutlined,
  HddOutlined,
  DatabaseOutlined,
  KeyOutlined,
  GlobalOutlined,
  HardDriveOutlined,
  SafetyOutlined,
  NodeIndexOutlined,
  DollarOutlined
} from '@ant-design/icons';
import { useProjects } from '../../context/ProjectContext';

const { Sider } = Layout;
const { SubMenu } = Menu;

function Sidebar({ collapsed, location }) {
  const { currentProject } = useProjects();
  
  return (
    <Sider
      trigger={null}
      collapsible
      collapsed={collapsed}
      width={230}
      style={{
        overflow: 'auto',
        height: '100vh',
        position: 'sticky',
        top: 0,
        left: 0,
      }}
    >
      <div className="logo">
        {collapsed ? 'HD' : 'HetznerDock'}
      </div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[location.pathname]}
        defaultOpenKeys={currentProject ? ['project', 'resources', 'network', 'settings'] : ['settings']}
      >
        <Menu.Item key="/" icon={<HomeOutlined />}>
          <Link to="/">Dashboard</Link>
        </Menu.Item>
        <Menu.Item key="/projects" icon={<CodeOutlined />}>
          <Link to="/projects">Projects</Link>
        </Menu.Item>
        
        {currentProject && (
          <>
            <SubMenu key="project" icon={<CloudServerOutlined />} title={collapsed ? "" : "Compute"}>
              <Menu.Item key={`/projects/${currentProject.id}/servers`} icon={<HddOutlined />}>
                <Link to={`/projects/${currentProject.id}/servers`}>Servers</Link>
              </Menu.Item>
              <Menu.Item key={`/projects/${currentProject.id}/images`} icon={<DatabaseOutlined />}>
                <Link to={`/projects/${currentProject.id}/images`}>Images</Link>
              </Menu.Item>
              <Menu.Item key={`/projects/${currentProject.id}/ssh-keys`} icon={<KeyOutlined />}>
                <Link to={`/projects/${currentProject.id}/ssh-keys`}>SSH Keys</Link>
              </Menu.Item>
              <Menu.Item key={`/projects/${currentProject.id}/server-types`} icon={<SettingOutlined />}>
                <Link to={`/projects/${currentProject.id}/server-types`}>Server Types</Link>
              </Menu.Item>
            </SubMenu>
            
            <SubMenu key="storage" icon={<HardDriveOutlined />} title={collapsed ? "" : "Storage"}>
              <Menu.Item key={`/projects/${currentProject.id}/volumes`} icon={<HardDriveOutlined />}>
                <Link to={`/projects/${currentProject.id}/volumes`}>Volumes</Link>
              </Menu.Item>
            </SubMenu>
            
            <SubMenu key="network" icon={<GlobalOutlined />} title={collapsed ? "" : "Network"}>
              <Menu.Item key={`/projects/${currentProject.id}/floating-ips`} icon={<GlobalOutlined />}>
                <Link to={`/projects/${currentProject.id}/floating-ips`}>Floating IPs</Link>
              </Menu.Item>
              <Menu.Item key={`/projects/${currentProject.id}/networks`} icon={<NodeIndexOutlined />}>
                <Link to={`/projects/${currentProject.id}/networks`}>Networks</Link>
              </Menu.Item>
              <Menu.Item key={`/projects/${currentProject.id}/firewalls`} icon={<SafetyOutlined />}>
                <Link to={`/projects/${currentProject.id}/firewalls`}>Firewalls</Link>
              </Menu.Item>
            </SubMenu>
          </>
        )}
        
        <SubMenu key="settings" icon={<SettingOutlined />} title="Settings">
          <Menu.Item key="/logs" icon={<HistoryOutlined />}>
            <Link to="/logs">System Logs</Link>
          </Menu.Item>
          {currentProject && (
            <>
              <Menu.Item key={`/projects/${currentProject.id}/system-logs`} icon={<HistoryOutlined />}>
                <Link to={`/projects/${currentProject.id}/system-logs`}>Action Logs</Link>
              </Menu.Item>
              <Menu.Item key={`/projects/${currentProject.id}/pricing`} icon={<DollarOutlined />}>
                <Link to={`/projects/${currentProject.id}/pricing`}>Pricing</Link>
              </Menu.Item>
            </>
          )}
        </SubMenu>
      </Menu>
    </Sider>
  );
}

export default Sidebar;