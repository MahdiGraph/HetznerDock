import api from '../axios';

export const getVolumes = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/volumes`);
  return response.data;
};

export const getVolume = async (projectId, volumeId) => {
  const response = await api.get(`/projects/${projectId}/volumes/${volumeId}`);
  return response.data;
};

export const createVolume = async (projectId, volumeData) => {
  const response = await api.post(`/projects/${projectId}/volumes`, volumeData);
  return response.data;
};

export const updateVolume = async (projectId, volumeId, volumeData) => {
  const response = await api.put(`/projects/${projectId}/volumes/${volumeId}`, volumeData);
  return response.data;
};

export const deleteVolume = async (projectId, volumeId) => {
  const response = await api.delete(`/projects/${projectId}/volumes/${volumeId}`);
  return response.data;
};

export const resizeVolume = async (projectId, volumeId, size) => {
  const response = await api.post(`/projects/${projectId}/volumes/${volumeId}/resize`, { size });
  return response.data;
};

export const attachVolume = async (projectId, volumeId, serverId, automount = true) => {
  const response = await api.post(`/projects/${projectId}/volumes/${volumeId}/attach`, { 
    server: serverId,
    automount
  });
  return response.data;
};

export const detachVolume = async (projectId, volumeId) => {
  const response = await api.post(`/projects/${projectId}/volumes/${volumeId}/detach`);
  return response.data;
};