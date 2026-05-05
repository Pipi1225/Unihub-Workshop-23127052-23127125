export const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatPrice = (price) => {
  if (!price) return '0 ₫';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(price);
};

export const formatDateInput = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export const getRegistrationStatusColor = (status) => {
  const colors = {
    PENDING: 'yellow',
    PAID: 'green',
    CANCELLED: 'red',
    FAILED: 'gray',
  };
  return colors[status] || 'gray';
};

export const getRegistrationStatusLabel = (status) => {
  const labels = {
    PENDING: 'Chờ thanh toán',
    PAID: 'Đã thanh toán',
    CANCELLED: 'Đã hủy',
    FAILED: 'Thất bại',
  };
  return labels[status] || status;
};

export const getWorkshopStatusColor = (status) => {
  const colors = {
    DRAFT: 'gray',
    PUBLISHED: 'blue',
    ONGOING: 'yellow',
    COMPLETED: 'green',
    CANCELLED: 'red',
  };
  return colors[status] || 'gray';
};

export const getWorkshopStatusLabel = (status) => {
  const labels = {
    DRAFT: 'Nháp',
    PUBLISHED: 'Đã phát hành',
    ONGOING: 'Đang diễn ra',
    COMPLETED: 'Đã hoàn thành',
    CANCELLED: 'Đã hủy',
  };
  return labels[status] || status;
};
