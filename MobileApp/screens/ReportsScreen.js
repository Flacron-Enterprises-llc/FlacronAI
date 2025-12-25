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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
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
  const [filter, setFilter] = useState('all'); // all, recent, archived

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
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="download-outline" size={18} color={COLORS.primary} />
          <Text style={styles.actionButtonText}>PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="document-outline" size={18} color={COLORS.info} />
          <Text style={styles.actionButtonText}>DOCX</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
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

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {[
            { key: 'all', label: 'All Reports', icon: 'list' },
            { key: 'recent', label: 'Recent', icon: 'time' },
            { key: 'archived', label: 'Archived', icon: 'archive' },
          ].map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[
                styles.filterChip,
                filter === item.key && styles.filterChipActive,
              ]}
              onPress={() => {
                setFilter(item.key);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Ionicons
                name={item.icon}
                size={16}
                color={filter === item.key ? '#FFFFFF' : COLORS.textSecondary}
              />
              <Text
                style={[
                  styles.filterChipText,
                  filter === item.key && styles.filterChipTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 20 : 60,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    zIndex: 10,
  },
  pageTitle: {
    fontSize: normalize(28),
    fontWeight: '800',
    color: COLORS.text,
  },
  filterContainer: {
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  filterScroll: {
    paddingHorizontal: 20,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 10,
    backgroundColor: '#f9fafb',
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: normalize(14),
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
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
