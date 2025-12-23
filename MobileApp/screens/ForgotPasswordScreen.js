import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Dimensions,
  SafeAreaView,
  TextInput,
  ActivityIndicator
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { resetPassword } from '../services/authService';

const { width, height } = Dimensions.get('window');

const ForgotPasswordScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const blobScale = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(blobScale, {
          toValue: 1.1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(blobScale, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []);

  const validateEmail = (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  };

  const handleResetPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    if (!validateEmail(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setLoading(true);

    try {
      const result = await resetPassword(email.toLowerCase().trim());

      if (result.success) {
        setEmailSent(true);
        setEmail('');
        Alert.alert(
          'Email Sent!',
          result.message || 'Password reset email sent! Please check your inbox and spam folder.',
          [
            {
              text: 'OK',
              onPress: () => {
                setTimeout(() => {
                  navigation.goBack();
                }, 500);
              },
            },
          ]
        );
      } else {
        // For security, show success message even if email doesn't exist
        Alert.alert(
          'Request Received',
          'If this email exists in our system, you will receive password reset instructions shortly.',
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack()
            }
          ]
        );
      }
    } catch (error) {
      console.error('Password reset error:', error);
      Alert.alert('Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Animated.View
          style={[
            styles.blobContainer,
            {
              transform: [{ scale: blobScale }],
            },
          ]}
        >
          <Svg height={height * 0.5} width={width * 0.8} style={styles.blob}>
            <Circle
              cx={width * 0.2}
              cy={height * 0.4}
              r={width * 0.5}
              fill="#FF6B35"
              opacity={0.15}
            />
          </Svg>
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <MaterialIcons name="arrow-back" size={24} color="#1a1a1a" />
            </TouchableOpacity>

            <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
              <View style={styles.header}>
                <View style={styles.iconContainer}>
                  <MaterialIcons name="lock-reset" size={48} color="#FF6B35" />
                </View>
                <Text style={styles.title}>Forgot Password?</Text>
                <Text style={styles.subtitle}>
                  Enter your email address and we'll send you instructions to reset your password
                </Text>
              </View>

              <View style={styles.form}>
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Email Address</Text>
                  <View style={styles.inputWrapper}>
                    <MaterialIcons
                      name="email"
                      size={20}
                      color="#FF6B35"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Enter your email"
                      placeholderTextColor="#999"
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!emailSent && !loading}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[
                    styles.resetButton,
                    (emailSent || loading) && styles.resetButtonDisabled
                  ]}
                  onPress={handleResetPassword}
                  disabled={loading || emailSent}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.resetButtonText}>
                      {emailSent ? 'EMAIL SENT' : 'SEND RESET LINK'}
                    </Text>
                  )}
                </TouchableOpacity>

                <View style={styles.footer}>
                  <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Text style={styles.footerLink}>Back to Login</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  blobContainer: {
    position: 'absolute',
    bottom: -height * 0.1,
    left: -width * 0.3,
    width: width * 0.8,
    height: height * 0.5,
    zIndex: 0,
  },
  blob: {
    position: 'absolute',
  },
  keyboardView: {
    flex: 1,
    zIndex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1a1a1a',
  },
  resetButton: {
    backgroundColor: '#FF6B35',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  resetButtonDisabled: {
    backgroundColor: '#ccc',
    shadowColor: '#ccc',
  },
  resetButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  footer: {
    alignItems: 'center',
    marginTop: 24,
  },
  footerLink: {
    fontSize: 16,
    color: '#FF6B35',
    fontWeight: '600',
  },
});

export default ForgotPasswordScreen;
