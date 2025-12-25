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

    console.log('🔐 Login response:', JSON.stringify(data, null, 2));

    if (data.success && data.token) {
      const tier = data.user.tier || 'starter';
      console.log('💾 Storing user data:', {
        email: data.user.email,
        displayName: data.user.displayName,
        userId: data.user.userId,
        tier: tier
      });

      await AsyncStorage.setItem('userToken', data.token);
      await AsyncStorage.setItem('userEmail', data.user.email);
      await AsyncStorage.setItem('userName', data.user.displayName || '');
      await AsyncStorage.setItem('userId', data.user.userId);
      await AsyncStorage.setItem('userTier', tier);

      console.log('✅ User data stored successfully');
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
    // Step 1: Generate the report with JSON (same as web app)
    const reportResponse = await apiCall('/reports/generate', {
      method: 'POST',
      body: JSON.stringify({
        ...reportData,
        photos: null // Photos will be uploaded separately
      }),
    });

    console.log('📄 Report generated:', reportResponse);

    if (!reportResponse.success) {
      throw new Error(reportResponse.error || 'Failed to generate report');
    }

    // Step 2: Upload photos if any (same as web app)
    if (photos && photos.length > 0 && reportResponse.reportId) {
      try {
        const formData = new FormData();

        photos.forEach((photo, index) => {
          const uriParts = photo.uri.split('.');
          const fileType = uriParts[uriParts.length - 1];

          formData.append('images', {
            uri: photo.uri,
            name: `photo_${index}.${fileType}`,
            type: `image/${fileType}`,
          });
        });

        const token = await getAuthToken();
        const uploadResponse = await fetch(`${API_URL}/reports/${reportResponse.reportId}/images`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
          body: formData,
        });

        const uploadData = await uploadResponse.json();

        if (uploadData.success) {
          console.log(`📸 Uploaded ${uploadData.uploaded} photo(s) successfully`);
        } else {
          console.warn('⚠️ Photo upload failed:', uploadData.error);
        }
      } catch (uploadError) {
        console.error('Photo upload error:', uploadError);
        // Don't fail the whole operation if photo upload fails
      }
    }

    return reportResponse;
  },

  getMyReports: async () => {
    return await apiCall('/reports', {
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
    // Use the same endpoint as web app to ensure consistency
    try {
      const data = await apiCall('/users/usage', {
        method: 'GET',
      });

      console.log('📊 Usage stats from backend:', JSON.stringify(data, null, 2));

      if (data.success && data.usage) {
        // Update stored tier to match backend
        await AsyncStorage.setItem('userTier', data.usage.tier);

        return {
          success: true,
          stats: {
            reportsGenerated: data.usage.periodUsage || 0,
            totalReports: data.usage.totalReports || 0,
            tier: data.usage.tier,
            tierName: data.usage.tierName,
            limit: data.usage.limit,
            remaining: data.usage.remaining,
            percentage: data.usage.percentage,
          }
        };
      }

      // Fallback
      return {
        success: false,
        error: 'Failed to fetch usage stats'
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      // Return fallback data
      const fallbackTier = await AsyncStorage.getItem('userTier') || 'starter';
      return {
        success: true,
        stats: {
          reportsGenerated: 0,
          totalReports: 0,
          tier: fallbackTier,
          tierName: 'Starter',
          limit: 1,
          remaining: 1,
          percentage: 0,
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
