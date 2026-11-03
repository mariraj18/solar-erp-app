/**
 * Solar ERP Client API
 * Type-safe API client for Solar ERP frontend
 */

const BASE_URL = '/api';

export function getToken(): string | null {
  return localStorage.getItem('erp_token');
}

export function setToken(token: string | null) {
  if (token) {
    localStorage.setItem('erp_token', token);
  } else {
    localStorage.removeItem('erp_token');
  }
}

export const getStoredToken = getToken;
export const setStoredToken = setToken;

async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (!(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', () => controller.abort());
    }
  }

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (res.status === 401 && !endpoint.startsWith('/auth/login') && !endpoint.startsWith('/auth/otp')) {
      setToken(null);
      window.dispatchEvent(new CustomEvent('erp:auth-expired'));
    }

    let data: any;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      throw new Error(data?.error || `Request failed with status ${res.status}`);
    }

    return data;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('The request timed out. Please check your network connection and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  auth: {
    login: (credentials: { email?: string; identifier?: string; password: string }) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
    requestOtp: (data: { mobileNumber: string }) =>
      request('/auth/otp/request', { method: 'POST', body: JSON.stringify(data) }),
    verifyOtp: (data: { mobileNumber: string; otpCode: string }) =>
      request('/auth/otp/verify', { method: 'POST', body: JSON.stringify(data) }),
    me: () => request('/auth/me'),
  },

  status: {
    get: () => request('/status'),
  },

  users: {
    list: () => request('/users'),
    create: (user: any) => request('/users', { method: 'POST', body: JSON.stringify(user) }),
    update: (id: string, updates: any) => request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    resetPassword: (id: string, newPassword: string) =>
      request(`/users/${id}/reset-password`, { method: 'PATCH', body: JSON.stringify({ newPassword }) }),
  },

  secondaryAdmins: {
    list: () => request('/secondary-admins'),
    assign: (data: any) => request('/secondary-admins/assign', { method: 'POST', body: JSON.stringify(data) }),
    remove: (secAdminId: string, staffUserId: string) =>
      request(`/secondary-admins/assign/${secAdminId}/${staffUserId}`, { method: 'DELETE' }),
  },

  categories: {
    list: () => request('/categories'),
    create: (cat: any) => request('/categories', { method: 'POST', body: JSON.stringify(cat) }),
    update: (id: string, cat: any) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(cat) }),
    delete: (id: string) => request(`/categories/${id}`, { method: 'DELETE' }),
  },

  teams: {
    list: () => request('/teams'),
    create: (team: any) => request('/teams', { method: 'POST', body: JSON.stringify(team) }),
    update: (id: string, team: any) => request(`/teams/${id}`, { method: 'PUT', body: JSON.stringify(team) }),
    getWeekAssignments: (weekStart: string) => request(`/teams/week/${weekStart}`),
    saveWeekAssignment: (weekStart: string, data: any) =>
      request(`/teams/week/${weekStart}`, { method: 'POST', body: JSON.stringify(data) }),
  },

  offices: {
    list: () => request('/offices'),
  },

  attendance: {
    list: (params: { weekStart?: string; date?: string; teamId?: string; staffUserId?: string; status?: string; secondaryAdminId?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.weekStart) q.set('weekStart', params.weekStart);
      if (params.date) q.set('date', params.date);
      if (params.teamId) q.set('teamId', params.teamId);
      if (params.staffUserId) q.set('staffUserId', params.staffUserId);
      if (params.status) q.set('status', params.status);
      if (params.secondaryAdminId) q.set('secondaryAdminId', params.secondaryAdminId);
      return request(`/attendance?${q.toString()}`);
    },
    create: (data: any) => request('/attendance', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/attendance/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/attendance/${id}`, { method: 'DELETE' }),
    getQueue: () => request('/approvals/queue'),
    approve: (id: string) => request(`/attendance/${id}/approve`, { method: 'POST' }),
    reject: (id: string, reason: string) =>
      request(`/attendance/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  },

  charges: {
    list: (params: { weekStart?: string; teamId?: string; staffUserId?: string; secondaryAdminId?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.weekStart) q.set('weekStart', params.weekStart);
      if (params.teamId) q.set('teamId', params.teamId);
      if (params.staffUserId) q.set('staffUserId', params.staffUserId);
      if (params.secondaryAdminId) q.set('secondaryAdminId', params.secondaryAdminId);
      return request(`/charges?${q.toString()}`);
    },
    create: (data: any) => request('/charges', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/charges/${id}`, { method: 'DELETE' }),
  },

  adjustments: {
    list: (params: { weekStart?: string; teamId?: string; staffUserId?: string; secondaryAdminId?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.weekStart) q.set('weekStart', params.weekStart);
      if (params.teamId) q.set('teamId', params.teamId);
      if (params.staffUserId) q.set('staffUserId', params.staffUserId);
      if (params.secondaryAdminId) q.set('secondaryAdminId', params.secondaryAdminId);
      return request(`/adjustments?${q.toString()}`);
    },
    create: (data: any) => request('/adjustments', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/adjustments/${id}`, { method: 'DELETE' }),
  },

  supplierBills: {
    list: (weekStart: string) => request(`/supplier-bills?weekStart=${encodeURIComponent(weekStart)}`),
    create: (data: any) => request('/supplier-bills', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/supplier-bills/${id}`, { method: 'DELETE' }),
  },

  merges: {
    getSummaryGroups: (weekStart: string) => request(`/merges/summary-groups?weekStart=${encodeURIComponent(weekStart)}`),
    createSummaryGroup: (data: any) => request('/merges/summary-groups', { method: 'POST', body: JSON.stringify(data) }),
    deleteSummaryGroup: (id: string) => request(`/merges/summary-groups/${id}`, { method: 'DELETE' }),
    previewAttendanceMerge: (data: any) => request('/merges/attendance/preview', { method: 'POST', body: JSON.stringify(data) }),
    executeAttendanceMerge: (data: any) => request('/merges/attendance/execute', { method: 'POST', body: JSON.stringify(data) }),
  },

  reports: {
    getWeekly: (
      weekStart: string,
      optionsOrStaff?: string | AbortSignal | { staffUserId?: string; secondaryAdminId?: string; signal?: AbortSignal },
      maybeSignal?: AbortSignal,
      maybeSecondaryAdminId?: string
    ) => {
      let staff: string | undefined;
      let secondaryAdminId: string | undefined = maybeSecondaryAdminId;
      let sig: AbortSignal | undefined = maybeSignal;

      if (optionsOrStaff instanceof AbortSignal) {
        sig = optionsOrStaff;
      } else if (typeof optionsOrStaff === 'string') {
        staff = optionsOrStaff;
      } else if (optionsOrStaff && typeof optionsOrStaff === 'object') {
        staff = optionsOrStaff.staffUserId;
        secondaryAdminId = optionsOrStaff.secondaryAdminId;
        sig = optionsOrStaff.signal;
      }

      const q = new URLSearchParams({ weekStart });
      if (staff) q.set('staffUserId', staff);
      if (secondaryAdminId) q.set('secondaryAdminId', secondaryAdminId);
      return request(`/reports/weekly?${q.toString()}`, sig ? { signal: sig } : {});
    },
    getMonthly: (
      year: number,
      month: number,
      optionsOrStaff?: string | AbortSignal | { staffUserId?: string; secondaryAdminId?: string; signal?: AbortSignal },
      maybeSignal?: AbortSignal,
      maybeSecondaryAdminId?: string
    ) => {
      let staff: string | undefined;
      let secondaryAdminId: string | undefined = maybeSecondaryAdminId;
      let sig: AbortSignal | undefined = maybeSignal;

      if (optionsOrStaff instanceof AbortSignal) {
        sig = optionsOrStaff;
      } else if (typeof optionsOrStaff === 'string') {
        staff = optionsOrStaff;
      } else if (optionsOrStaff && typeof optionsOrStaff === 'object') {
        staff = optionsOrStaff.staffUserId;
        secondaryAdminId = optionsOrStaff.secondaryAdminId;
        sig = optionsOrStaff.signal;
      }

      const q = new URLSearchParams({ year: String(year), month: String(month) });
      if (staff) q.set('staffUserId', staff);
      if (secondaryAdminId) q.set('secondaryAdminId', secondaryAdminId);
      return request(`/reports/monthly?${q.toString()}`, sig ? { signal: sig } : {});
    },
  },

  payments: {
    list: (params: { weekStart?: string; teamId?: string; status?: string; staffUserId?: string; secondaryAdminId?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.weekStart) q.set('weekStart', params.weekStart);
      if (params.teamId) q.set('teamId', params.teamId);
      if (params.status) q.set('status', params.status);
      if (params.staffUserId) q.set('staffUserId', params.staffUserId);
      if (params.secondaryAdminId) q.set('secondaryAdminId', params.secondaryAdminId);
      return request(`/payments?${q.toString()}`);
    },
    markPaid: (data: any) => request('/payments/mark-paid', { method: 'POST', body: JSON.stringify(data) }),
    getHistoricalOutstanding: (currentWeekStart?: string, staffUserId?: string) => {
      const q = new URLSearchParams();
      if (currentWeekStart) q.set('currentWeekStart', currentWeekStart);
      if (staffUserId) q.set('staffUserId', staffUserId);
      return request(`/payments/historical-outstanding?${q.toString()}`);
    },
  },

  attachments: {
    list: (params: { recordType?: string; recordId?: string; teamId?: string; weekStart?: string; staffUserId?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.recordType) q.set('recordType', params.recordType);
      if (params.recordId) q.set('recordId', params.recordId);
      if (params.teamId) q.set('teamId', params.teamId);
      if (params.weekStart) q.set('weekStart', params.weekStart);
      if (params.staffUserId) q.set('staffUserId', params.staffUserId);
      return request(`/attachments?${q.toString()}`);
    },
    upload: (formData: FormData | any) => request('/attachments', { method: 'POST', body: formData instanceof FormData ? formData : JSON.stringify(formData) }),
    delete: (id: string) => request(`/attachments/${id}`, { method: 'DELETE' }),
    downloadUrl: (id: string) => `${BASE_URL}/attachments/${id}/download`,
  },

  officeLedger: {
    list: (params: { startDate?: string; endDate?: string; category?: string; secondaryAdminId?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.startDate) q.set('startDate', params.startDate);
      if (params.endDate) q.set('endDate', params.endDate);
      if (params.category) q.set('category', params.category);
      if (params.secondaryAdminId) q.set('secondaryAdminId', params.secondaryAdminId);
      return request(`/office-ledger?${q.toString()}`);
    },
    create: (data: any) => request('/office-ledger', { method: 'POST', body: JSON.stringify(data) }),
  },

  pettyCash: {
    get: (params: { startDate?: string; endDate?: string; month?: number | string; year?: number | string; secondaryAdminId?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.startDate) q.set('startDate', params.startDate);
      if (params.endDate) q.set('endDate', params.endDate);
      if (params.month !== undefined) q.set('month', String(params.month));
      if (params.year !== undefined) q.set('year', String(params.year));
      if (params.secondaryAdminId) q.set('secondaryAdminId', params.secondaryAdminId);
      return request(`/petty-cash?${q.toString()}`);
    },
    create: (data: any) => request('/petty-cash', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/petty-cash/${id}`, { method: 'DELETE' }),
  },

  notifications: {
    list: () => request('/notifications'),
    markRead: (id: string) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
    markAllRead: () => request('/notifications/mark-all-read', { method: 'POST' }),
    registerPushToken: (pushToken: string, deviceType = 'android') =>
      request('/notifications/register-token', {
        method: 'POST',
        body: JSON.stringify({ pushToken, deviceType }),
      }),
  },

  audit: {
    list: (params: { limit?: number; entityType?: string; actorId?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.limit) q.set('limit', String(params.limit));
      if (params.entityType) q.set('entityType', params.entityType);
      if (params.actorId) q.set('actorId', params.actorId);
      return request(`/audit?${q.toString()}`);
    },
  },

  settings: {
    get: () => request('/settings'),
    save: (key: string, value: any) => request(`/settings/${key}`, { method: 'POST', body: JSON.stringify(value) }),
    seedSampleData: () => request('/settings/seed-sample-data', { method: 'POST' }),
  },

  worksites: {
    list: (params?: { secondaryAdminId?: string }) => {
      const q = params?.secondaryAdminId ? `?secondaryAdminId=${encodeURIComponent(params.secondaryAdminId)}` : '';
      return request(`/worksites${q}`);
    },
    create: (data: any) => request('/worksites', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/worksites/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/worksites/${id}`, { method: 'DELETE' }),
  },

  labourers: {
    list: (params: { teamId?: string; worksiteId?: string; status?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.teamId) q.set('teamId', params.teamId);
      if (params.worksiteId) q.set('worksiteId', params.worksiteId);
      if (params.status) q.set('status', params.status);
      return request(`/labourers?${q.toString()}`);
    },
    create: (data: any) => request('/labourers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request(`/labourers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/labourers/${id}`, { method: 'DELETE' }),
    resetPassword: (id: string, newPass: string) =>
      request(`/labourers/${id}/reset-password`, { method: 'PATCH', body: JSON.stringify({ newPassword: newPass }) }),
    transferTeam: (id: string, newTeamId: string, reason?: string) =>
      request(`/labourers/${id}/transfer`, { method: 'PATCH', body: JSON.stringify({ newTeamId, reason }) }),
  },

  gpsAttendance: {
    checkIn: (data: any) => request('/gps-attendance/check-in', { method: 'POST', body: JSON.stringify(data) }),
    checkOut: (data: any) => request('/gps-attendance/check-out', { method: 'POST', body: JSON.stringify(data) }),
    getToday: () => request('/gps-attendance/today'),
    getTeamToday: (teamId: string, date?: string) =>
      request(`/gps-attendance/team-today?teamId=${encodeURIComponent(teamId)}${date ? `&date=${encodeURIComponent(date)}` : ''}`),
    getMyHistory: (params: { weekStart?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.weekStart) q.set('weekStart', params.weekStart);
      return request(`/gps-attendance/my-history?${q.toString()}`);
    },
    getAll: (params: { date?: string; worksiteId?: string; teamId?: string; status?: string; secondaryAdminId?: string; staffUserId?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.date) q.set('date', params.date);
      if (params.worksiteId) q.set('worksiteId', params.worksiteId);
      if (params.teamId) q.set('teamId', params.teamId);
      if (params.status) q.set('status', params.status);
      if (params.secondaryAdminId) q.set('secondaryAdminId', params.secondaryAdminId);
      if (params.staffUserId) q.set('staffUserId', params.staffUserId);
      return request(`/gps-attendance/all?${q.toString()}`);
    },
    approve: (id: string) => request(`/gps-attendance/${id}/approve`, { method: 'POST' }),
    reject: (id: string, reason: string) =>
      request(`/gps-attendance/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
    override: (id: string, data: any) =>
      request(`/gps-attendance/${id}/override`, { method: 'POST', body: JSON.stringify(typeof data === 'string' ? { reason: data } : data) }),
    getReconciliation: (params?: { teamId?: string; date?: string }) =>
      request(`/gps-attendance/reconciliation${params?.teamId ? `?teamId=${encodeURIComponent(params.teamId)}&date=${encodeURIComponent(params.date || '')}` : ''}`),
    reRequestLocation: (id: string, data?: any) =>
      request(`/gps-attendance/${id}/re-request-location`, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  },

  verifications: {
    request: (data: any) => request('/verifications/request', { method: 'POST', body: JSON.stringify(data) }),
    getActive: () => request('/verifications/active'),
    respond: (id: string, data: any) => request(`/verifications/${id}/respond`, { method: 'POST', body: JSON.stringify(data) }),
    list: (params: { date?: string; teamId?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.date) q.set('date', params.date);
      if (params.teamId) q.set('teamId', params.teamId);
      return request(`/verifications/list?${q.toString()}`);
    },
  },

  attendanceSupervisors: {
    list: () => request('/attendance-supervisors'),
    assign: (data: any) => request('/attendance-supervisors', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => request(`/attendance-supervisors/${id}`, { method: 'DELETE' }),
  },

  geofenceRequests: {
    list: (params: { status?: string; entityId?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.status) q.set('status', params.status);
      if (params.entityId) q.set('entityId', params.entityId);
      return request(`/geofence-requests?${q.toString()}`);
    },
    create: (data: {
      entityType?: 'team' | 'worksite';
      entityId: string;
      requestedLatitude: number;
      requestedLongitude: number;
      requestedRadiusMeters?: number;
      requestedAccuracyThreshold?: number;
      reason: string;
      proposedDetails?: any;
    }) => request('/geofence-requests', { method: 'POST', body: JSON.stringify(data) }),
    approve: (id: string) => request(`/geofence-requests/${id}/approve`, { method: 'POST' }),
    reject: (id: string, reason?: string) =>
      request(`/geofence-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  },

  geo: {
    search: (query: string) => request(`/geo/search?q=${encodeURIComponent(query)}`),
  },
};
