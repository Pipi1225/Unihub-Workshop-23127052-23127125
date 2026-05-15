import api from "./api";

export const authService = {
  // Google credential login
  loginWithGoogle: async (credential) => {
    const response = await api.post("/api/auth/google", { credential });
    return {
      user: response.data.user,
      token: response.data.access_token,
    };
  },

  // Refresh token
  refreshToken: async () => {
    const response = await api.post("/api/auth/refresh-token");
    return {
      token: response.data.access_token,
    };
  },

  // Logout
  logout: async () => {
    await api.post("/api/auth/logout");
  },
};

export const workshopService = {
  // Get all workshops
  getWorkshops: async ({ page = 1, pageSize = 9, includeAll = false } = {}) => {
    const response = await api.get("/api/workshops", {
      params: {
        page,
        page_size: pageSize,
        include_all: includeAll ? "true" : undefined,
      },
    });
    return response.data?.data ?? response.data;
  },

  // Get workshop by ID
  getWorkshop: async (id) => {
    const response = await api.get(`/api/workshops/${id}`);
    return response.data?.data ?? null;
  },

  // Create workshop (admin only)
  createWorkshop: async (data) => {
    const isMultipart =
      typeof FormData !== "undefined" && data instanceof FormData;
    const response = await api.post(
      "/api/workshops",
      data,
      isMultipart
        ? { headers: { "Content-Type": "multipart/form-data" } }
        : undefined,
    );
    return response.data?.data ?? response.data;
  },

  // Update workshop (admin only)
  updateWorkshop: async (id, data) => {
    const isMultipart =
      typeof FormData !== "undefined" && data instanceof FormData;
    const response = await api.put(
      `/api/workshops/${id}`,
      data,
      isMultipart
        ? { headers: { "Content-Type": "multipart/form-data" } }
        : undefined,
    );
    return response.data?.data ?? response.data;
  },

  // Delete workshop (admin only)
  deleteWorkshop: async (id) => {
    const response = await api.delete(`/api/workshops/${id}`);
    return response.data;
  },

  // Upload PDF
  uploadPDF: async (id, file) => {
    const formData = new FormData();
    formData.append("pdf", file);
    const response = await api.put(`/api/workshops/${id}`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data?.data ?? response.data;
  },
};

export const registrationService = {
  // Register for workshop
  register: async (workshopId, data) => {
    const payload = {
      workshop_id: workshopId,
      ...(data || {}),
    };
    const response = await api.post("/api/registrations", payload);
    return response.data;
  },

  // Get registration by ID
  getRegistration: async (id) => {
    const response = await api.get(`/api/registrations/${id}`);
    return response.data?.data ?? response.data;
  },

  // Get registration by workshop ID
  getRegistrationByWorkshop: async (workshopId) => {
    const response = await api.get(
      `/api/registrations/by-workshop/${workshopId}`,
    );
    return response.data?.data ?? response.data;
  },

  // Get my registrations
  getMyRegistrations: async ({ page = 1, pageSize = 10 } = {}) => {
    const response = await api.get("/api/registrations", {
      params: {
        page,
        page_size: pageSize,
      },
    });
    return response.data?.data ?? response.data;
  },

  // Confirm payment
  confirmPayment: async (registrationId, data) => {
    const payload = {
      registration_id: registrationId,
      ...(data || {}),
    };
    const response = await api.post("/api/payments/charge", payload, {
      headers: {
        "X-Idempotency-Key": crypto.randomUUID(),
      },
    });
    return response.data;
  },

  // Get registration status
  getRegistrationStatus: async (id) => {
    const response = await api.get(`/api/registrations/${id}/status`);
    return response.data;
  },
};

export const paymentService = {
  getMockStatus: async () => {
    const response = await api.get("/api/payments/mock-status");
    return response.data?.mode ?? response.data;
  },

  setMockStatus: async (mode) => {
    const response = await api.put("/api/payments/mock-status", { mode });
    return response.data?.mode ?? response.data;
  },
};

export const statsService = {
  // Get admin statistics
  getStatistics: async () => {
    const response = await api.get("/api/stats");
    return response.data?.data ?? null;
  },

  // Get workshop analytics
  getWorkshopAnalytics: async (workshopId) => {
    const response = await api.get(`/api/stats/workshops/${workshopId}`);
    return response.data?.data ?? null;
  },
};
