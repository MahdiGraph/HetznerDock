import api from '../axios';

export const getSSHKeys = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/ssh_keys`);
  return response.data;
};

export const getSSHKey = async (projectId, sshKeyId) => {
  const response = await api.get(`/projects/${projectId}/ssh_keys/${sshKeyId}`);
  return response.data;
};

export const createSSHKey = async (projectId, sshKeyData) => {
  const response = await api.post(`/projects/${projectId}/ssh_keys`, sshKeyData);
  return response.data;
};

export const updateSSHKey = async (projectId, sshKeyId, sshKeyData) => {
  const response = await api.put(`/projects/${projectId}/ssh_keys/${sshKeyId}`, sshKeyData);
  return response.data;
};

export const deleteSSHKey = async (projectId, sshKeyId) => {
  const response = await api.delete(`/projects/${projectId}/ssh_keys/${sshKeyId}`);
  return response.data;
};