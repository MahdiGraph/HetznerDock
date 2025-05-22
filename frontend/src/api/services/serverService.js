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

// اضافه شده - قابلیت‌های جدید
export const rebuildServer = async (projectId, serverId, imageData) => {
  const response = await api.post(`/projects/${projectId}/servers/${serverId}/rebuild`, imageData);
  return response.data;
};

export const enableRescueMode = async (projectId, serverId, rescueData = {}) => {
  const response = await api.post(`/projects/${projectId}/servers/${serverId}/enable_rescue`, rescueData);
  return response.data;
};

export const disableRescueMode = async (projectId, serverId) => {
  const response = await api.post(`/projects/${projectId}/servers/${serverId}/disable_rescue`);
  return response.data;
};

export const attachISO = async (projectId, serverId, isoData) => {
  const response = await api.post(`/projects/${projectId}/servers/${serverId}/attach_iso`, isoData);
  return response.data;
};

export const detachISO = async (projectId, serverId) => {
  const response = await api.post(`/projects/${projectId}/servers/${serverId}/detach_iso`);
  return response.data;
};

export const resetServer = async (projectId, serverId) => {
  const response = await api.post(`/projects/${projectId}/servers/${serverId}/reset`);
  return response.data;
};

export const getISOs = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/isos`);
  return response.data;
};

export const getPricing = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/pricing`);
  return response.data;
};

export const getActions = async (projectId, params = {}) => {
  const response = await api.get(`/projects/${projectId}/actions`, { params });
  return response.data;
};

export const renameServer = async (projectId, serverId, newName) => {
  const response = await api.put(`/projects/${projectId}/servers/${serverId}/rename`, { name: newName });
  return response.data;
};