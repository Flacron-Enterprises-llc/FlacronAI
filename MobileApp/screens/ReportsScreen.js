import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Platform,
  StatusBar,
  Dimensions,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AIAssistantBubble } from '../components/AIAssistant';
import AnimatedBlobBackground from '../components/AnimatedBlobBackground';
import { reportService } from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
  primary: '#FF7C08',
  primaryDark: '#ff9533',
  background: '#FFFFFF',
  text: '#1f2937',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  border: '#e5e7eb',
  success: '#10b981',
  info: '#3b82f6',
};

const normalize = (size) => {
  const scale = SCREEN_WIDTH / 375;
  return Math.round(size * scale);
};

export default function ReportsScreen({ onShowAIAssistant }) {
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState([]);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const result = await reportService.getMyReports();
      if (result.success && result.reports) {
        setReports(result.reports);
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchReports();
    setRefreshing(false);
  };

  const downloadReport = async (reportId, format) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const token = await AsyncStorage.getItem('userToken');

      if (!token) {
        Alert.alert('Error', 'You must be logged in to download reports.');
        return;
      }

      console.log('📥 Starting export:', { reportId, format });

      // Step 1: Call export endpoint to generate the file
      const exportUrl = `https://flacronai.onrender.com/api/reports/${reportId}/export`;
      const exportResponse = await fetch(exportUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ format }),
      });

      const exportData = await exportResponse.json();
      console.log('Export response:', exportData);

      if (!exportResponse.ok || !exportData.success) {
        throw new Error(exportData.error || 'Failed to export report');
      }

      if (!exportData.downloadUrl) {
        throw new Error('No download URL provided');
      }

      // Step 2: Download the file from backend server
      // The downloadUrl is a relative path, so prepend the API base URL
      const fullDownloadUrl = exportData.downloadUrl.startsWith('http')
        ? exportData.downloadUrl
        : `https://flacronai.onrender.com${exportData.downloadUrl}`;

      console.log('Downloading from:', fullDownloadUrl);

      const fileResponse = await fetch(fullDownloadUrl);
      if (!fileResponse.ok) {
        throw new Error('Failed to download file from storage');
      }

      const blob = await fileResponse.blob();
      console.log('Downloaded blob size:', blob.size);

      if (blob.size === 0) {
        throw new Error('Downloaded file is empty');
      }

      // Convert blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const base64Data = await base64Promise;
      const base64String = base64Data.split(',')[1]; // Remove data:mime;base64, prefix

      // Write to file system
      const fileUri = FileSystem.documentDirectory + `report_${reportId}.${format}`;
      await FileSystem.writeAsStringAsync(fileUri, base64String, {
        encoding: 'base64',
      });

      console.log('File saved to:', fileUri);

      // Verify file was saved
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      console.log('File info:', fileInfo);

      if (!fileInfo.exists || fileInfo.size === 0) {
        throw new Error('Failed to save file');
      }

      // Step 3: Share the downloaded file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          dialogTitle: `Share ${format.toUpperCase()} Report`,
        });
      } else {
        Alert.alert('Success', `Report saved to ${fileUri}`);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Download error:', error);
      console.error('Error details:', error.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Download Failed',
        `Could not download ${format.toUpperCase()} file. ${error.message || 'Please try again.'}`
      );
    }
  };

  const shareReport = async (report) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const shareMessage = `Report: ${report.claimNumber}\nInsured: ${report.insuredName}\nType: ${report.lossType}\nDate: ${report.date}`;

      await Share.share({
        message: shareMessage,
        title: `Insurance Report - ${report.claimNumber}`,
      });
    } catch (error) {
      console.error('Share error:', error);
      Alert.alert('Error', 'Failed to share report');
    }
  };

  const ReportCard = ({ report }) => (
    <TouchableOpacity
      style={styles.reportCard}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        // Navigate to report detail
      }}
      activeOpacity={0.8}
    >
      <View style={styles.reportHeader}>
        <View style={styles.reportIconContainer}>
          <LinearGradient
            colors={['#FF7C08', '#ff9533']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.reportIconGradient}
          >
            <Ionicons name="document-text" size={24} color="#FFFFFF" />
          </LinearGradient>
        </View>
        <View style={styles.reportInfo}>
          <Text style={styles.reportTitle}>{report.claimNumber}</Text>
          <Text style={styles.reportSubtitle}>{report.insuredName}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
      </View>

      <View style={styles.reportMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={14} color={COLORS.textMuted} />
          <Text style={styles.metaText}>{report.date}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="pricetag-outline" size={14} color={COLORS.textMuted} />
          <Text style={styles.metaText}>{report.lossType}</Text>
        </View>
      </View>

      <View style={styles.reportActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => downloadReport(report.id, 'pdf')}
        >
          <Ionicons name="download-outline" size={18} color={COLORS.primary} />
          <Text style={styles.actionButtonText}>PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => downloadReport(report.id, 'docx')}
        >
          <Ionicons name="document-outline" size={18} color={COLORS.info} />
          <Text style={styles.actionButtonText}>DOCX</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => shareReport(report)}
        >
          <Ionicons name="share-outline" size={18} color={COLORS.success} />
          <Text style={styles.actionButtonText}>Share</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <AnimatedBlobBackground />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.pageTitle}>My Reports</Text>
      </View>

      {/* Reports List */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading reports...</Text>
          </View>
        ) : reports.length > 0 ? (
          reports.map((report, index) => <ReportCard key={index} report={report} />)
        ) : (
          <View style={styles.emptyState}>
            <LinearGradient
              colors={['rgba(255, 124, 8, 0.1)', 'rgba(255, 149, 51, 0.1)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.emptyIconContainer}
            >
              <Ionicons name="folder-open-outline" size={normalize(64)} color={COLORS.primary} />
            </LinearGradient>
            <Text style={styles.emptyText}>No reports yet</Text>
            <Text style={styles.emptySubtext}>
              Generate your first insurance report to see it here!
            </Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <AIAssistantBubble onPress={onShowAIAssistant} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    zIndex: 10,
  },
  pageTitle: {
    fontSize: normalize(28),
    fontWeight: '800',
    color: COLORS.text,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  reportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  reportIconContainer: {
    marginRight: 12,
  },
  reportIconGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportInfo: {
    flex: 1,
  },
  reportTitle: {
    fontSize: normalize(16),
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  reportSubtitle: {
    fontSize: normalize(14),
    color: COLORS.textSecondary,
  },
  reportMeta: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: normalize(13),
    color: COLORS.textMuted,
  },
  reportActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    gap: 6,
  },
  actionButtonText: {
    fontSize: normalize(13),
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: normalize(15),
    color: COLORS.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyText: {
    fontSize: normalize(20),
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: normalize(15),
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
