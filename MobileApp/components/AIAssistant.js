import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  Dimensions,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');

const FAQ_DATA = [
  {
    category: 'Getting Started',
    questions: [
      {
        q: 'How to generate a report?',
        a: 'Tap the "Generate Report" button on the dashboard. Fill in the claim details, add photos if needed, and tap "Generate Report with AI". The AI will create a professional inspection report instantly.',
      },
      {
        q: 'What is included in the demo?',
        a: 'The Quick Demo pre-fills a sample fire damage inspection report. It\'s perfect for testing the AI generation without entering data. Just tap "Quick Demo" and then generate.',
      },
    ],
  },
  {
    category: 'Usage & Limits',
    questions: [
      {
        q: 'How many reports can I create?',
        a: 'Your plan includes a monthly limit. Free tier: 10 reports/month, Starter: 50, Pro: 200, Enterprise: Unlimited. Check the Usage Overview card on your dashboard.',
      },
      {
        q: 'How to fix missing data?',
        a: 'Required fields are marked with *. The system will alert you if any required fields are missing. You can also use the AI auto-fill feature to suggest content based on loss type.',
      },
    ],
  },
  {
    category: 'Exporting',
    questions: [
      {
        q: 'How to export PDF/DOCX?',
        a: 'After generating a report, tap the download icon in the report preview. Choose PDF or DOCX format. The file will be saved to your device and can be shared directly.',
      },
      {
        q: 'How to use AI auto-fill?',
        a: 'Select your loss type first. The AI will suggest common descriptions, damages, and recommendations based on that type. You can edit any AI-generated content.',
      },
    ],
  },
];

export const AIAssistantBubble = ({ onPress }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Continuous pulse animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <TouchableOpacity
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      activeOpacity={0.9}
      style={styles.bubbleContainer}
    >
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <LinearGradient
          colors={['#FF8A00', '#FF4F00']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.bubble}
        >
          <Ionicons name="chatbubbles" size={28} color="#FFFFFF" />
        </LinearGradient>
      </Animated.View>

      {/* Pulse ring effect */}
      <Animated.View
        style={[
          styles.pulseRing,
          {
            transform: [{ scale: pulseAnim }],
            opacity: pulseAnim.interpolate({
              inputRange: [1, 1.1],
              outputRange: [0.3, 0],
            }),
          },
        ]}
      />
    </TouchableOpacity>
  );
};

export const AIAssistantPanel = ({ visible, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategory, setExpandedCategory] = useState(null);
  const slideAnim = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: height,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const filteredFAQs = FAQ_DATA.map((category) => ({
    ...category,
    questions: category.questions.filter(
      (item) =>
        item.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.a.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter((category) => category.questions.length > 0);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />

        <Animated.View
          style={[
            styles.panel,
            {
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            {/* Header */}
            <View style={styles.panelHeader}>
              <View style={styles.headerLeft}>
                <LinearGradient
                  colors={['#FF8A00', '#FF4F00']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.headerIcon}
                >
                  <Ionicons name="sparkles" size={20} color="#FFFFFF" />
                </LinearGradient>
                <View>
                  <Text style={styles.panelTitle}>AI Assistant</Text>
                  <Text style={styles.panelSubtitle}>How can I help you?</Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#1A1A1A" />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#6A6A6A" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search for help..."
                placeholderTextColor="#9CA3AF"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={20} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>

            {/* FAQ List */}
            <ScrollView
              style={styles.faqList}
              showsVerticalScrollIndicator={false}
            >
              {filteredFAQs.map((category, categoryIndex) => (
                <View key={categoryIndex} style={styles.categoryContainer}>
                  <Text style={styles.categoryTitle}>{category.category}</Text>

                  {category.questions.map((item, itemIndex) => (
                    <FAQItem
                      key={itemIndex}
                      question={item.q}
                      answer={item.a}
                      isExpanded={expandedCategory === `${categoryIndex}-${itemIndex}`}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setExpandedCategory(
                          expandedCategory === `${categoryIndex}-${itemIndex}`
                            ? null
                            : `${categoryIndex}-${itemIndex}`
                        );
                      }}
                    />
                  ))}
                </View>
              ))}

              {filteredFAQs.length === 0 && (
                <View style={styles.emptyState}>
                  <Ionicons name="search-outline" size={48} color="#9CA3AF" />
                  <Text style={styles.emptyText}>No results found</Text>
                  <Text style={styles.emptySubtext}>
                    Try a different search term
                  </Text>
                </View>
              )}

              <View style={{ height: 100 }} />
            </ScrollView>

            {/* Quick Actions */}
            <View style={styles.quickActions}>
              <TouchableOpacity style={styles.quickActionButton}>
                <Ionicons name="book-outline" size={18} color="#FF8A00" />
                <Text style={styles.quickActionText}>Guide</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickActionButton}>
                <Ionicons name="mail-outline" size={18} color="#FF8A00" />
                <Text style={styles.quickActionText}>Contact</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickActionButton}>
                <Ionicons name="videocam-outline" size={18} color="#FF8A00" />
                <Text style={styles.quickActionText}>Tutorial</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const FAQItem = ({ question, answer, isExpanded, onPress }) => {
  const heightAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [isExpanded]);

  return (
    <TouchableOpacity
      style={styles.faqItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.faqQuestion}>
        <View style={styles.faqIconContainer}>
          <Ionicons name="help-circle-outline" size={20} color="#FF8A00" />
        </View>
        <Text style={styles.faqQuestionText}>{question}</Text>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#6A6A6A"
        />
      </View>

      {isExpanded && (
        <Animated.View
          style={[
            styles.faqAnswer,
            {
              opacity: heightAnim,
            },
          ]}
        >
          <Text style={styles.faqAnswerText}>{answer}</Text>
        </Animated.View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  // Bubble
  bubbleContainer: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    zIndex: 1000,
  },
  bubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF8A00',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  pulseRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#FF8A00',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  backdrop: {
    flex: 1,
  },
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: height * 0.85,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 20,
  },

  // Header
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.07)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1A1A1A',
    letterSpacing: -0.4,
  },
  panelSubtitle: {
    fontSize: 13,
    color: '#6A6A6A',
    fontWeight: '500',
    marginTop: 2,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    paddingHorizontal: 16,
    marginHorizontal: 24,
    marginTop: 20,
    marginBottom: 24,
    height: 52,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1A1A1A',
    fontWeight: '500',
  },

  // FAQ List
  faqList: {
    flex: 1,
    paddingHorizontal: 24,
  },
  categoryContainer: {
    marginBottom: 28,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  faqItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.07)',
    shadowColor: 'rgba(0, 0, 0, 0.08)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  faqQuestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  faqIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 138, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faqQuestionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: -0.2,
  },
  faqAnswer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  faqAnswerText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#6A6A6A',
    fontWeight: '500',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6A6A6A',
  },

  // Quick Actions
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.07)',
    backgroundColor: '#FAFAFA',
  },
  quickActionButton: {
    alignItems: 'center',
    gap: 6,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6A6A6A',
  },
});

// Default export for the main AI Assistant Panel
export default AIAssistantPanel;
