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
  ActivityIndicator,
  Modal
} from 'react-native';
import { MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle } from 'react-native-svg';
import { signUpWithEmail, signInWithEmail } from '../services/authService';
import { signInWithGoogle, signInWithApple, isGoogleSignInAvailable, isAppleSignInAvailable } from '../services/socialAuthService';

const { width, height } = Dimensions.get('window');

const SignupScreen = ({ navigation }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [showGoogleButton, setShowGoogleButton] = useState(false);
  const [showAppleButton, setShowAppleButton] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const blobScale = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Blob breathing animation
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

    // Fade in content
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // Check availability of social sign-in methods
    setShowGoogleButton(isGoogleSignInAvailable());
    setShowAppleButton(isAppleSignInAvailable());
  }, []);

  const handleSignup = async () => {
    if (!fullName || !email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const result = await signUpWithEmail(email.toLowerCase().trim(), password, fullName.trim());

      if (result.success) {
        // Clear form
        setFullName('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');

        // Show success message
        Alert.alert(
          'Account Created Successfully!',
          'For demo purposes, you can now login without email verification.',
          [
            {
              text: 'Go to Login',
              onPress: () => navigation.navigate('Login')
            }
          ]
        );
      } else {
        Alert.alert('Signup Error', result.error || 'Failed to create account');
      }
    } catch (error) {
      console.error('Signup error:', error);
      Alert.alert('Signup Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle Google Sign-Up/Sign-In
   * Google sign-in automatically creates an account if it doesn't exist
   */
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);

    try {
      const result = await signInWithGoogle();

      if (result.success && result.token && result.user) {
        console.log('✅ Google sign-in successful, navigating to Main app...');
        navigation.replace('Main');
      } else if (result.cancelled) {
        // User cancelled - do nothing
        console.log('Google sign-in cancelled by user');
      } else if (result.accountExists) {
        Alert.alert(
          'Account Exists',
          result.error,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Google Sign-In Error', result.error || 'Failed to sign in with Google');
      }
    } catch (error) {
      console.error('Google sign-in error:', error);
      Alert.alert('Error', 'An unexpected error occurred during Google sign-in.');
    } finally {
      setGoogleLoading(false);
    }
  };

  /**
   * Handle Apple Sign-Up/Sign-In
   * Apple sign-in automatically creates an account if it doesn't exist
   */
  const handleAppleSignIn = async () => {
    setAppleLoading(true);

    try {
      const result = await signInWithApple();

      if (result.success && result.token && result.user) {
        console.log('✅ Apple sign-in successful, navigating to Main app...');
        navigation.replace('Main');
      } else if (result.cancelled) {
        // User cancelled - do nothing
        console.log('Apple sign-in cancelled by user');
      } else if (result.accountExists) {
        Alert.alert(
          'Account Exists',
          result.error,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Apple Sign-In Error', result.error || 'Failed to sign in with Apple');
      }
    } catch (error) {
      console.error('Apple sign-in error:', error);
      Alert.alert('Error', 'An unexpected error occurred during Apple sign-in.');
    } finally {
      setAppleLoading(false);
    }
  };

  /**
   * Handle Quick Demo Login
   * Logs in with demo credentials (skip signup)
   */
  const handleDemoLogin = async () => {
    setDemoLoading(true);

    // Demo credentials
    const demoEmail = 'demo@flacronai.com';
    const demoPassword = 'Demo123!';

    try {
      const result = await signInWithEmail(demoEmail, demoPassword);

      if (result.success && result.token && result.user) {
        // Store JWT token and user data
        await AsyncStorage.setItem('authToken', result.token);
        await AsyncStorage.setItem('userData', JSON.stringify(result.user));

        console.log('✅ Demo login successful, navigating to Main app...');
        navigation.replace('Main');
      } else {
        Alert.alert(
          'Demo Account Info',
          'Demo account credentials:\nEmail: demo@flacronai.com\nPassword: Demo123!\n\nYou can log in with these credentials or create your own account.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Demo login error:', error);
      Alert.alert('Demo Login', 'Demo account is temporarily unavailable. Please create your own account.');
    } finally {
      setDemoLoading(false);
    }
  };


  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Orange Blob at Bottom Left */}
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
            {/* Back button */}
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <MaterialIcons name="arrow-back" size={24} color="#1a1a1a" />
            </TouchableOpacity>

            {/* Content */}
            <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.title}>Create Account</Text>
                <Text style={styles.subtitle}>
                  Join FlacronAI and start your journey
                </Text>
              </View>

              {/* Form */}
              <View style={styles.form}>
                {/* Full Name Input */}
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Full Name</Text>
                  <View style={styles.inputWrapper}>
                    <MaterialIcons
                      name="person"
                      size={20}
                      color="#FF6B35"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Enter your full name"
                      placeholderTextColor="#999"
                      value={fullName}
                      onChangeText={setFullName}
                    />
                  </View>
                </View>

                {/* Email Input */}
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
                    />
                  </View>
                </View>

                {/* Password Input */}
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Password</Text>
                  <View style={styles.inputWrapper}>
                    <MaterialIcons
                      name="lock"
                      size={20}
                      color="#FF6B35"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Create a password"
                      placeholderTextColor="#999"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeIcon}
                    >
                      <MaterialIcons
                        name={showPassword ? 'visibility' : 'visibility-off'}
                        size={20}
                        color="#999"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Confirm Password Input */}
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Confirm Password</Text>
                  <View style={styles.inputWrapper}>
                    <MaterialIcons
                      name="lock"
                      size={20}
                      color="#FF6B35"
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Confirm your password"
                      placeholderTextColor="#999"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={styles.eyeIcon}
                    >
                      <MaterialIcons
                        name={showConfirmPassword ? 'visibility' : 'visibility-off'}
                        size={20}
                        color="#999"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Terms */}
                <View style={styles.termsContainer}>
                  <MaterialIcons
                    name="info-outline"
                    size={16}
                    color="#999"
                    style={styles.termsIcon}
                  />
                  <Text style={styles.termsText}>
                    By signing up, you agree to our{' '}
                    <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
                    <Text style={styles.termsLink}>Privacy Policy</Text>
                  </Text>
                </View>

                {/* Signup button */}
                <TouchableOpacity
                  style={styles.signupButton}
                  onPress={handleSignup}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.signupButtonText}>CREATE ACCOUNT</Text>
                  )}
                </TouchableOpacity>

                {/* Social Sign-In Section */}
                {(showGoogleButton || showAppleButton) && (
                  <>
                    <View style={styles.divider}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>OR SIGN UP WITH</Text>
                      <View style={styles.dividerLine} />
                    </View>

                    <View style={styles.socialButtons}>
                      {showGoogleButton && (
                        <TouchableOpacity
                          style={styles.socialButton}
                          onPress={handleGoogleSignIn}
                          disabled={googleLoading}
                          activeOpacity={0.7}
                        >
                          {googleLoading ? (
                            <ActivityIndicator color="#FF6B35" size="small" />
                          ) : (
                            <FontAwesome5 name="google" size={24} color="#DB4437" />
                          )}
                        </TouchableOpacity>
                      )}

                      {showAppleButton && (
                        <TouchableOpacity
                          style={styles.socialButton}
                          onPress={handleAppleSignIn}
                          disabled={appleLoading}
                          activeOpacity={0.7}
                        >
                          {appleLoading ? (
                            <ActivityIndicator color="#FF6B35" size="small" />
                          ) : (
                            <MaterialIcons name="apple" size={24} color="#000000" />
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  </>
                )}

                {/* Login link */}
                <View style={styles.footer}>
                  <Text style={styles.footerText}>Already have an account? </Text>
                  <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                    <Text style={styles.footerLink}>Log In</Text>
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
    bottom: 0,
    left: 0,
  },
  keyboardView: {
    flex: 1,
    zIndex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    minHeight: height,
    paddingTop: Platform.OS === 'ios' ? 60 : 60,
    paddingBottom: 40,
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 60,
    left: 24,
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 36,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
  },
  form: {
    flex: 1,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#1a1a1a',
  },
  eyeIcon: {
    padding: 4,
  },
  termsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
    marginTop: 4,
  },
  termsIcon: {
    marginTop: 2,
    marginRight: 8,
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  termsLink: {
    color: '#FF6B35',
    fontWeight: '600',
  },
  signupButton: {
    backgroundColor: '#1a1a1a',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  signupButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  dividerText: {
    color: '#999',
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
    borderRadius: 12,
    backgroundColor: '#f8f8f8',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  demoButton: {
    flexDirection: 'row',
    backgroundColor: '#FFF5F0',
    height: 50,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FF6B35',
    borderStyle: 'dashed',
    marginTop: 16,
    marginBottom: 8,
  },
  demoIcon: {
    marginRight: 8,
  },
  demoButtonText: {
    color: '#FF6B35',
    fontSize: 15,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 20,
  },
  footerText: {
    color: '#666',
    fontSize: 14,
  },
  footerLink: {
    color: '#FF6B35',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default SignupScreen;
