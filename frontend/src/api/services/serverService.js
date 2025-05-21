import api from '../axios';

export const getServers = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/servers`);
  return response.data;
};

export const getServer = async (projectId, serverId) => {
  const response = await api.get(`/projects/${projectId}/servers/${serverId}`);
  return response.data;
};

export const createServer = async (projectId, serverData) => {
  const response = await api.post(`/projects/${projectId}/servers`, serverData);
  return response.data;
};

export const deleteServer = async (projectId, serverId) => {
  const response = await api.delete(`/projects/${projectId}/servers/${serverId}`);
  return response.data;
};

export const powerOnServer = async (projectId, serverId) => {
  const response = await api.post(`/projects/${projectId}/servers/${serverId}/power_on`);
  return response.data;
};

export const powerOffServer = async (projectId, serverId) => {
  const response = await api.post(`/projects/${projectId}/servers/${serverId}/power_off`);
  return response.data;
};

export const rebootServer = async (projectId, serverId) => {
  const response = await api.post(`/projects/${projectId}/servers/${serverId}/reboot`);
  return response.data;
};

export const getImages = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/images`);
  return response.data;
};

export const getServerTypes = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/server_types`);
  return response.data;
};