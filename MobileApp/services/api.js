import AsyncStorage from '@react-native-async-storage/async-storage';

// API Configuration
const API_URL = 'https://flacronai.onrender.com/api';

// Helper function to get auth token
const getAuthToken = async () => {
  try {
    return await AsyncStorage.getItem('userToken');
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
};

// Helper function to make authenticated API calls
const apiCall = async (endpoint, options = {}) => {
  try {
    const token = await getAuthToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers,
    };

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'API request failed');
    }

    return data;
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error);
    throw error;
  }
};

// Auth Services
export const authService = {
  login: async (email, password) => {
    const data = await apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (data.success && data.token) {
      await AsyncStorage.setItem('userToken', data.token);
      await AsyncStorage.setItem('userEmail', data.user.email);
      await AsyncStorage.setItem('userName', data.user.displayName || '');
      await AsyncStorage.setItem('userId', data.user.userId);
      await AsyncStorage.setItem('userTier', data.user.tier || 'professional');
    }

    return data;
  },

  logout: async () => {
    await AsyncStorage.multiRemove(['userToken', 'userEmail', 'userName', 'userId', 'userTier']);
  },

  getUserData: async () => {
    const [email, name, userId, tier] = await Promise.all([
      AsyncStorage.getItem('userEmail'),
      AsyncStorage.getItem('userName'),
      AsyncStorage.getItem('userId'),
      AsyncStorage.getItem('userTier'),
    ]);
    return { email, name, userId, tier };
  },
};

// Report Services
export const reportService = {
  generateReport: async (reportData, photos = []) => {
    const formData = new FormData();

    // Add report data
    Object.keys(reportData).forEach(key => {
      formData.append(key, reportData[key]);
    });

    // Add photos
    if (photos && photos.length > 0) {
      photos.forEach((photo, index) => {
        const uriParts = photo.uri.split('.');
        const fileType = uriParts[uriParts.length - 1];

        formData.append('photos', {
          uri: photo.uri,
          name: `photo_${index}.${fileType}`,
          type: `image/${fileType}`,
        });
      });
    }

    const token = await getAuthToken();
    const response = await fetch(`${API_URL}/reports/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to generate report');
    }

    return data;
  },

  getMyReports: async () => {
    return await apiCall('/reports/my-reports', {
      method: 'GET',
    });
  },

  getReportById: async (reportId) => {
    return await apiCall(`/reports/${reportId}`, {
      method: 'GET',
    });
  },

  downloadReport: async (reportId, format = 'pdf') => {
    const token = await getAuthToken();
    const response = await fetch(`${API_URL}/reports/${reportId}/download?format=${format}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to download report');
    }

    return response.blob();
  },
};

// User Services
export const userService = {
  getStats: async () => {
    // Get stats from stored user data and reports
    try {
      const tier = await AsyncStorage.getItem('userTier') || 'professional';

      // Fetch reports to calculate stats
      const reportsData = await reportService.getMyReports();

      const totalReports = reportsData.reports?.length || 0;
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();

      const reportsThisMonth = reportsData.reports?.filter(report => {
        const reportDate = new Date(report.createdAt);
        return reportDate.getMonth() === currentMonth && reportDate.getFullYear() === currentYear;
      }).length || 0;

      return {
        success: true,
        stats: {
          reportsGenerated: reportsThisMonth,
          totalReports: totalReports,
          tier: tier,
        }
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return {
        success: false,
        stats: {
          reportsGenerated: 0,
          totalReports: 0,
          tier: 'professional',
        }
      };
    }
  },

  getProfile: async () => {
    const userData = await authService.getUserData();
    return {
      success: true,
      user: userData
    };
  },
};

export default {
  authService,
  reportService,
  userService,
};
