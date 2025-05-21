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
  DatabaseOutlined
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
        defaultOpenKeys={currentProject ? ['project', 'settings'] : ['settings']}
      >
        <Menu.Item key="/" icon={<HomeOutlined />}>
          <Link to="/">Dashboard</Link>
        </Menu.Item>
        
        <Menu.Item key="/projects" icon={<CodeOutlined />}>
          <Link to="/projects">Projects</Link>
        </Menu.Item>
        
        {currentProject && (
          <SubMenu key="project" icon={<CloudServerOutlined />} title={collapsed ? "" : currentProject.name}>
            <Menu.Item key={`/projects/${currentProject.id}/servers`} icon={<HddOutlined />}>
              <Link to={`/projects/${currentProject.id}/servers`}>Servers</Link>
            </Menu.Item>
            
            <Menu.Item key={`/projects/${currentProject.id}/images`} icon={<DatabaseOutlined />}>
              <Link to={`/projects/${currentProject.id}/images`}>Images</Link>
            </Menu.Item>
            
            <Menu.Item key={`/projects/${currentProject.id}/server-types`} icon={<SettingOutlined />}>
              <Link to={`/projects/${currentProject.id}/server-types`}>Server Types</Link>
            </Menu.Item>
          </SubMenu>
        )}
        
        <SubMenu key="settings" icon={<SettingOutlined />} title="Settings">
          <Menu.Item key="/logs" icon={<HistoryOutlined />}>
            <Link to="/logs">System Logs</Link>
          </Menu.Item>
        </SubMenu>
      </Menu>
    </Sider>
  );
}

export default Sidebar;