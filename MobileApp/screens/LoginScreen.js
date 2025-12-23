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
import { signInWithEmail, signInWithGoogle, signInWithApple, isGoogleSignInAvailable, isAppleSignInAvailable } from '../services/authService';

const { width, height } = Dimensions.get('window');

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [showGoogleButton, setShowGoogleButton] = useState(false);
  const [showAppleButton, setShowAppleButton] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

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

    // Check availability of social sign-in methods
    setShowGoogleButton(isGoogleSignInAvailable());
    setShowAppleButton(isAppleSignInAvailable());
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      const result = await signInWithEmail(email.toLowerCase().trim(), password);

      if (result.success && result.token && result.user) {
        // Store JWT token and user data
        await AsyncStorage.setItem('authToken', result.token);
        await AsyncStorage.setItem('userData', JSON.stringify(result.user));

        console.log('✅ Login successful, navigating to Main app...');

        // Clear form
        setEmail('');
        setPassword('');

        // Navigate to main app
        navigation.replace('Main');
      } else {
        // Handle errors
        if (result.emailVerified === false) {
          Alert.alert(
            'Email Not Verified',
            'Please verify your email before logging in. Check your inbox for the verification link.',
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert('Login Error', result.error || 'Invalid email or password');
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert('Login Error', 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle Google Sign-In
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
   * Handle Apple Sign-In
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
   * Logs in with demo credentials
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
          'Demo account credentials:\nEmail: demo@flacronai.com\nPassword: Demo123!\n\nYou can also create your own account by clicking Sign Up below.',
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
                <Text style={styles.title}>Welcome Back</Text>
                <Text style={styles.subtitle}>
                  Sign in to continue to FlacronAI
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
                    />
                  </View>
                </View>

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
                      placeholder="Enter your password"
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

                <TouchableOpacity
                  style={styles.forgotPassword}
                  onPress={() => navigation.navigate('ForgotPassword')}
                >
                  <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.loginButton}
                  onPress={handleLogin}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.loginButtonText}>LOG IN</Text>
                  )}
                </TouchableOpacity>

                {/* Social Sign-In Section */}
                {(showGoogleButton || showAppleButton) && (
                  <>
                    <View style={styles.divider}>
                      <View style={styles.dividerLine} />
                      <Text style={styles.dividerText}>OR CONTINUE WITH</Text>
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

                {/* Quick Demo Button */}
                <TouchableOpacity
                  style={styles.demoButton}
                  onPress={handleDemoLogin}
                  disabled={demoLoading}
                  activeOpacity={0.7}
                >
                  {demoLoading ? (
                    <ActivityIndicator color="#FF6B35" size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="flash-on" size={20} color="#FF6B35" style={styles.demoIcon} />
                      <Text style={styles.demoButtonText}>Try Quick Demo</Text>
                    </>
                  )}
                </TouchableOpacity>

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
    paddingBottom: 40,
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
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
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
  eyeIcon: {
    padding: 4,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 32,
  },
  forgotPasswordText: {
    color: '#FF6B35',
    fontSize: 14,
    fontWeight: '600',
  },
  loginButton: {
    backgroundColor: '#1a1a1a',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 24,
  },
  loginButtonText: {
    color: '#fff',
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
    fontWeight: '600',
    marginHorizontal: 16,
  },
  socialButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 24,
  },
  socialButton: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
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
    marginTop: 8,
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

export default LoginScreen;
