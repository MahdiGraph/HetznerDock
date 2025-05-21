import moment from 'moment';

export const formatDate = (date) => {
  if (!date) return 'N/A';
  return moment(date).format('YYYY-MM-DD HH:mm:ss');
};

export const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export const formatPrice = (price, currency = '€') => {
  if (!price) return 'N/A';
  return `${currency}${parseFloat(price).toFixed(2)}`;
};