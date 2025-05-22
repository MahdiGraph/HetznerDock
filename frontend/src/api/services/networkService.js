import api from '../axios';

export const getNetworks = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/networks`);
  return response.data;
};

export const getNetwork = async (projectId, networkId) => {
  const response = await api.get(`/projects/${projectId}/networks/${networkId}`);
  return response.data;
};

export const createNetwork = async (projectId, networkData) => {
  const response = await api.post(`/projects/${projectId}/networks`, networkData);
  return response.data;
};

export const updateNetwork = async (projectId, networkId, networkData) => {
  const response = await api.put(`/projects/${projectId}/networks/${networkId}`, networkData);
  return response.data;
};

export const deleteNetwork = async (projectId, networkId) => {
  const response = await api.delete(`/projects/${projectId}/networks/${networkId}`);
  return response.data;
};