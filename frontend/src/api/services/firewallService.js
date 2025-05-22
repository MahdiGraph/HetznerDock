import api from '../axios';

export const getFirewalls = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/firewalls`);
  return response.data;
};

export const getFirewall = async (projectId, firewallId) => {
  const response = await api.get(`/projects/${projectId}/firewalls/${firewallId}`);
  return response.data;
};

export const createFirewall = async (projectId, firewallData) => {
  const response = await api.post(`/projects/${projectId}/firewalls`, firewallData);
  return response.data;
};

export const updateFirewall = async (projectId, firewallId, firewallData) => {
  const response = await api.put(`/projects/${projectId}/firewalls/${firewallId}`, firewallData);
  return response.data;
};

export const deleteFirewall = async (projectId, firewallId) => {
  const response = await api.delete(`/projects/${projectId}/firewalls/${firewallId}`);
  return response.data;
};