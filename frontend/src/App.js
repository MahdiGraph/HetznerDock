// src/App.js
import React from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import MainLayout from './components/layout/MainLayout';
// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Servers from './pages/Servers';
import ServerDetail from './pages/ServerDetail';
import CreateServer from './pages/CreateServer';
import Images from './pages/Images';
import Logs from './pages/Logs';
import Snapshots from './pages/Snapshots';
// New Pages
import SSHKeys from './pages/SSHKeys';
import FloatingIPs from './pages/FloatingIPs';
import Volumes from './pages/Volumes';
import Firewalls from './pages/Firewalls';
import Networks from './pages/Networks';
import SystemLogs from './pages/SystemLogs';
import Pricing from './pages/Pricing';
// Loading
import Loading from './components/common/Loading';

// Redirect component for server-types to pricing
function ServerTypesRedirect() {
  const { projectId } = useParams();
  return <Navigate to={`/projects/${projectId}/pricing`} replace />;
}

function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <Loading />;
  }

  return (
    <Routes>
      <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/" />} />
      <Route element={<MainLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:projectId" element={<ProjectDetail />} />

        {/* Server Routes */}
        <Route path="/projects/:projectId/servers" element={<Servers />} />
        <Route path="/projects/:projectId/servers/:serverId" element={<ServerDetail />} />
        <Route path="/projects/:projectId/create-server" element={<CreateServer />} />

        {/* Resource Routes */}
        <Route path="/projects/:projectId/images" element={<Images />} />
        <Route path="/projects/:projectId/server-types" element={<ServerTypesRedirect />} />

        {/* New Routes */}
        <Route path="/projects/:projectId/ssh-keys" element={<SSHKeys />} />
        <Route path="/projects/:projectId/floating-ips" element={<FloatingIPs />} />
        <Route path="/projects/:projectId/volumes" element={<Volumes />} />
        <Route path="/projects/:projectId/firewalls" element={<Firewalls />} />
        <Route path="/projects/:projectId/networks" element={<Networks />} />
        <Route path="/projects/:projectId/system-logs" element={<SystemLogs />} />
        <Route path="/projects/:projectId/pricing" element={<Pricing />} />
        <Route path="/projects/:projectId/snapshots" element={<Snapshots />} />

        {/* Global Logs */}
        <Route path="/logs" element={<Logs />} />
      </Route>
      <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/login"} />} />
    </Routes>
  );
}

export default App;