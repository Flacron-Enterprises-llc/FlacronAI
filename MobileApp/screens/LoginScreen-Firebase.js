// EXAMPLE: Login Screen with Firebase Integration
// This is a reference implementation showing how to connect to your existing backend

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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import BackgroundAnimatedGradient from '../components/BackgroundAnimatedGradient';
import GlassInput from '../components/GlassInput';
import GlowButton from '../components/GlowButton';

// Your API configuration
const API_URL = 'https://flacronai.onrender.com/api';

const LoginScreenFirebase = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      console.log('LOGIN ATTEMPT:');
      console.log('   Email:', email);
      console.log('   API URL:', `${API_URL}/auth/login`);

      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();
      console.log('   Response status:', response.status);
      console.log('   Success:', data.success);

      if (data.success && data.token) {
        console.log('   ✅ Login successful!');

        // Save token and user data
        await AsyncStorage.setItem('authToken', data.token);
        await AsyncStorage.setItem('userData', JSON.stringify(data.user));

        // Navigate to main app
        navigation.replace('Main', {
          user: data.user,
          token: data.token
        });

      } else {
        console.log('   ❌ Login failed:', data.error);

        // Check if email verification is required
        if (data.emailVerified === false ||
            (data.error && data.error.includes('verify your email'))) {
          Alert.alert(
            'Email Not Verified',
            'Please verify your email before logging in. Check your inbox for the verification link.',
            [
              { text: 'Resend Email', onPress: () => handleResendVerification() },
              { text: 'OK', style: 'cancel' }
            ]
          );
          return;
        }

        // Handle specific error messages
        let errorMessage = data.error || 'Invalid email or password';
        if (errorMessage.includes('not found') ||
            errorMessage.includes('No user') ||
            errorMessage.includes('No account')) {
          errorMessage = 'No account found with this email. Please sign up first.';
        } else if (errorMessage.includes('wrong password') ||
                   errorMessage.includes('incorrect') ||
                   errorMessage.includes('Invalid credentials') ||
                   errorMessage.includes('Incorrect password')) {
          errorMessage = 'Incorrect password. Please try again.';
        }

        Alert.alert('Login Error', errorMessage);
      }
    } catch (error) {
      console.error('   Network Error:', error);
      Alert.alert('Login Error', 'Network error. Please check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/auth/resend-verification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (data.success) {
        Alert.alert('Email Sent', 'Verification email sent! Please check your inbox.');
      } else {
        Alert.alert('Error', data.error || 'Failed to send verification email');
      }
    } catch (error) {
      console.error('Resend error:', error);
      Alert.alert('Error', 'Network error. Please try again.');
    }
  };

  const handleSocialLogin = (provider) => {
    Alert.alert(
      'Social Login',
      `${provider} login will be available soon!`,
      [{ text: 'OK' }]
    );
  };

  return (
    <View style={styles.container}>
      <BackgroundAnimatedGradient />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>

          {/* Content */}
          <Animated.View
            style={[
              styles.content,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <MaterialIcons name="lock-outline" size={32} color="#9333ea" />
              </View>
              <Text style={styles.title}>Welcome Back</Text>
              <Text style={styles.subtitle}>
                Sign in to continue to FlacronAI
              </Text>
            </View>

            {/* Form */}
            <View style={styles.form}>
              <GlassInput
                label="Email Address"
                placeholder="Enter your email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                icon="email"
              />

              <GlassInput
                label="Password"
                placeholder="Enter your password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                icon="lock"
              />

              {/* Forgot password */}
              <TouchableOpacity
                style={styles.forgotPassword}
                onPress={() => Alert.alert('Reset Password', 'Password reset functionality coming soon!')}
              >
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </TouchableOpacity>

              {/* Login button */}
              <GlowButton
                title={loading ? 'SIGNING IN...' : 'LOG IN'}
                onPress={handleLogin}
                variant="primary"
                style={styles.loginButton}
              />

              {/* Social login */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
                <View style={styles.dividerLine} />
              </View>

              <View style={styles.socialButtons}>
                <TouchableOpacity
                  style={styles.socialButton}
                  onPress={() => handleSocialLogin('Google')}
                >
                  <MaterialIcons name="g-translate" size={24} color="#ffffff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.socialButton}
                  onPress={() => handleSocialLogin('Apple')}
                >
                  <MaterialIcons name="apple" size={24} color="#ffffff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.socialButton}
                  onPress={() => handleSocialLogin('Facebook')}
                >
                  <MaterialIcons name="facebook" size={24} color="#ffffff" />
                </TouchableOpacity>
              </View>

              {/* Sign up link */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>Don't have an account? </Text>
                <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
                  <Text style={styles.footerLink}>Sign Up</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 60,
  },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 24,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: 'rgba(147, 51, 234, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(147, 51, 234, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
  },
  form: {
    flex: 1,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginTop: -8,
    marginBottom: 24,
  },
  forgotPasswordText: {
    color: '#9333ea',
    fontSize: 14,
    fontWeight: '500',
  },
  loginButton: {
    marginBottom: 32,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  dividerText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 12,
    fontWeight: '500',
    marginHorizontal: 16,
  },
  socialButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 32,
  },
  socialButton: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
  },
  footerLink: {
    color: '#9333ea',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default LoginScreenFirebase;
