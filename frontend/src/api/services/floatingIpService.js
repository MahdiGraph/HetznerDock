import api from '../axios';

export const getFloatingIPs = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/floating_ips`);
  return response.data;
};

export const getFloatingIP = async (projectId, floatingIpId) => {
  const response = await api.get(`/projects/${projectId}/floating_ips/${floatingIpId}`);
  return response.data;
};

export const createFloatingIP = async (projectId, floatingIpData) => {
  const response = await api.post(`/projects/${projectId}/floating_ips`, floatingIpData);
  return response.data;
};

export const updateFloatingIP = async (projectId, floatingIpId, floatingIpData) => {
  const response = await api.put(`/projects/${projectId}/floating_ips/${floatingIpId}`, floatingIpData);
  return response.data;
};

export const deleteFloatingIP = async (projectId, floatingIpId) => {
  const response = await api.delete(`/projects/${projectId}/floating_ips/${floatingIpId}`);
  return response.data;
};

export const assignFloatingIP = async (projectId, floatingIpId, serverId) => {
  const response = await api.post(`/projects/${projectId}/floating_ips/${floatingIpId}/assign`, { server: serverId });
  return response.data;
};

export const unassignFloatingIP = async (projectId, floatingIpId) => {
  const response = await api.post(`/projects/${projectId}/floating_ips/${floatingIpId}/unassign`);
  return response.data;
};