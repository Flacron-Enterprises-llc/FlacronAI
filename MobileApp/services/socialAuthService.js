/**
 * Social Authentication Service
 * Handles Google and Apple Sign-In using Firebase Authentication
 * This service integrates with the existing backend for user profile creation
 */

import { auth, googleProvider, appleProvider } from '../config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert } from 'react-native';

const API_URL = 'https://flacronai.onrender.com/api';

/**
 * Sign in with Google
 * Uses Firebase Google Authentication Provider
 */
export const signInWithGoogle = async () => {
  try {
    console.log('\n🔵 GOOGLE SIGN-IN ATTEMPT:');

    let result;

    if (Platform.OS === 'web') {
      // Disable social auth on web - it's a mobile-only feature
      console.log('⚠️ Google Sign-In not available on web platform');
      return {
        success: false,
        error: 'Google Sign-In is only available on mobile devices (iOS/Android). Please use Email/Password login on web.',
        platform: 'web'
      };
    } else {
      // Mobile: Try to use Google Sign-In SDK, fallback to Firebase web auth if not available
      let useNativeGoogleSignIn = false;
      let GoogleSignin = null;

      // Check if native Google Sign-In is available
      try {
        GoogleSignin = require('@react-native-google-signin/google-signin').GoogleSignin;
        useNativeGoogleSignIn = true;
      } catch (requireError) {
        console.log('Native Google Sign-In not available, using Firebase web auth');
        useNativeGoogleSignIn = false;
      }

      if (useNativeGoogleSignIn && GoogleSignin) {
        try {
          // Configure Google Sign In
          GoogleSignin.configure({
            webClientId: '924587706021-eec9131d64c8ee0f81ef4c.apps.googleusercontent.com',
          });

          // Check if device supports Google Play services
          await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

          // Get Google ID token
          const { idToken } = await GoogleSignin.signIn();

          // Create Google credential
          const googleCredential = auth.GoogleAuthProvider.credential(idToken);

          // Sign in with credential
          result = await auth.signInWithCredential(googleCredential);
        } catch (nativeError) {
          console.error('Native Google Sign-In error:', nativeError);
          throw nativeError;
        }
      } else {
        // Native module not available - show helpful message
        console.log('⚠️ Native Google Sign-In not available in Expo Go');
        return {
          success: false,
          error: 'Google Sign-In requires a development build. Please use Email/Password login or create a development build to use Google Sign-In.',
          requiresDevBuild: true
        };
      }
    }

    const user = result.user;
    console.log('✅ Google authentication successful');
    console.log('   User ID:', user.uid);
    console.log('   Email:', user.email);
    console.log('   Name:', user.displayName);

    // Get Firebase ID token for backend authentication
    const firebaseToken = await user.getIdToken();

    // Register/Login with backend
    const backendResponse = await registerOrLoginWithBackend({
      firebaseUid: user.uid,
      email: user.email,
      displayName: user.displayName || 'Google User',
      provider: 'google',
      photoURL: user.photoURL,
      firebaseToken
    });

    if (backendResponse.success) {
      // Store auth data
      await AsyncStorage.setItem('authToken', backendResponse.token);
      await AsyncStorage.setItem('userData', JSON.stringify(backendResponse.user));

      return {
        success: true,
        token: backendResponse.token,
        user: backendResponse.user
      };
    } else {
      throw new Error(backendResponse.error || 'Failed to authenticate with backend');
    }

  } catch (error) {
    console.error('❌ Google Sign-In Error:', error);

    // Handle specific error codes
    if (error.code === 'auth/popup-closed-by-user') {
      return { success: false, error: 'Sign-in cancelled', cancelled: true };
    } else if (error.code === 'auth/account-exists-with-different-credential') {
      return {
        success: false,
        error: 'An account already exists with this email using a different sign-in method. Please use your original sign-in method.',
        accountExists: true
      };
    } else if (error.code === 'auth/network-request-failed') {
      return { success: false, error: 'Network error. Please check your internet connection.' };
    } else if (error.code === 12501) {
      // User cancelled the sign-in
      return { success: false, error: 'Sign-in cancelled', cancelled: true };
    }

    return {
      success: false,
      error: error.message || 'Failed to sign in with Google'
    };
  }
};

/**
 * Sign in with Apple
 * Uses Firebase Apple Authentication Provider
 * Note: Apple Sign-In requires specific configuration in Firebase Console and Apple Developer account
 */
export const signInWithApple = async () => {
  try {
    console.log('\n🍎 APPLE SIGN-IN ATTEMPT:');

    let result;

    if (Platform.OS === 'web') {
      // Disable social auth on web - it's a mobile-only feature
      console.log('⚠️ Apple Sign-In not available on web platform');
      return {
        success: false,
        error: 'Apple Sign-In is only available on mobile devices (iOS/Android). Please use Email/Password login on web.',
        platform: 'web'
      };
    } else if (Platform.OS === 'ios' || Platform.OS === 'android') {
      // Mobile: Try native Apple Sign-In, fallback if not available
      let useNativeAppleSignIn = false;
      let appleAuth = null;

      try {
        appleAuth = require('@invertase/react-native-apple-authentication');
        useNativeAppleSignIn = appleAuth && appleAuth.isSupported;
      } catch (requireError) {
        console.log('Native Apple Sign-In not available, using Firebase web auth');
        useNativeAppleSignIn = false;
      }

      if (useNativeAppleSignIn && appleAuth) {
        try {
          // Perform Apple Sign-In request
          const appleAuthRequestResponse = await appleAuth.performRequest({
            requestedOperation: appleAuth.Operation.LOGIN,
            requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
          });

          // Get the identity token
          const { identityToken, nonce } = appleAuthRequestResponse;

          // Create Apple credential
          const appleCredential = auth.AppleAuthProvider.credential(identityToken);
          if (nonce) {
            appleCredential.nonce = nonce;
          }

          // Sign in with credential
          result = await auth.signInWithCredential(appleCredential);
        } catch (nativeError) {
          console.error('Native Apple Sign-In error:', nativeError);
          throw nativeError;
        }
      } else {
        // Native module not available
        console.log('⚠️ Native Apple Sign-In not available in Expo Go');
        return {
          success: false,
          error: 'Apple Sign-In requires a development build. Please use Email/Password login or create a development build to use Apple Sign-In.',
          requiresDevBuild: true
        };
      }
    } else {
      return {
        success: false,
        error: 'Apple Sign-In is not supported on this platform'
      };
    }

    const user = result.user;
    console.log('✅ Apple authentication successful');
    console.log('   User ID:', user.uid);
    console.log('   Email:', user.email);

    // Get Firebase ID token for backend authentication
    const firebaseToken = await user.getIdToken();

    // Apple may not provide email on subsequent logins
    const email = user.email || `${user.uid}@privaterelay.appleid.com`;
    const displayName = user.displayName || 'Apple User';

    // Register/Login with backend
    const backendResponse = await registerOrLoginWithBackend({
      firebaseUid: user.uid,
      email: email,
      displayName: displayName,
      provider: 'apple',
      photoURL: user.photoURL,
      firebaseToken
    });

    if (backendResponse.success) {
      // Store auth data
      await AsyncStorage.setItem('authToken', backendResponse.token);
      await AsyncStorage.setItem('userData', JSON.stringify(backendResponse.user));

      return {
        success: true,
        token: backendResponse.token,
        user: backendResponse.user
      };
    } else {
      throw new Error(backendResponse.error || 'Failed to authenticate with backend');
    }

  } catch (error) {
    console.error('❌ Apple Sign-In Error:', error);

    // Handle specific error codes
    if (error.code === 'auth/popup-closed-by-user' || error.code === '1001') {
      return { success: false, error: 'Sign-in cancelled', cancelled: true };
    } else if (error.code === 'auth/account-exists-with-different-credential') {
      return {
        success: false,
        error: 'An account already exists with this email using a different sign-in method. Please use your original sign-in method.',
        accountExists: true
      };
    } else if (error.code === 'auth/network-request-failed') {
      return { success: false, error: 'Network error. Please check your internet connection.' };
    }

    return {
      success: false,
      error: error.message || 'Failed to sign in with Apple'
    };
  }
};

/**
 * Register or login user with backend
 * Creates user profile in backend database if doesn't exist
 */
async function registerOrLoginWithBackend(userData) {
  try {
    console.log('\n📡 Registering/Logging in with backend...');
    console.log('   Provider:', userData.provider);
    console.log('   Email:', userData.email);

    // Call backend social auth endpoint
    const response = await fetch(`${API_URL}/auth/social-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${userData.firebaseToken}`
      },
      body: JSON.stringify({
        firebaseUid: userData.firebaseUid,
        email: userData.email,
        displayName: userData.displayName,
        provider: userData.provider,
        photoURL: userData.photoURL
      })
    });

    console.log('   Backend Response Status:', response.status);

    const data = await response.json();
    console.log('   Backend Response:', JSON.stringify(data, null, 2));

    if (response.ok && data.success) {
      console.log('   ✅ Backend authentication successful');
      return {
        success: true,
        token: data.token,
        user: data.user
      };
    } else {
      console.error('   ❌ Backend authentication failed:', data.error);
      return {
        success: false,
        error: data.error || 'Failed to authenticate with backend'
      };
    }

  } catch (error) {
    console.error('   ❌ Backend communication error:', error);
    return {
      success: false,
      error: `Backend error: ${error.message}`
    };
  }
}

/**
 * Check if Google Sign-In is available
 */
export const isGoogleSignInAvailable = () => {
  // Disable on web - mobile only feature
  if (Platform.OS === 'web') {
    return false;
  }
  return true;
};

/**
 * Check if Apple Sign-In is available
 */
export const isAppleSignInAvailable = () => {
  // Disable on web - mobile only feature
  if (Platform.OS === 'web') {
    return false;
  }
  // Available on both iOS and Android
  return true;
};

export default {
  signInWithGoogle,
  signInWithApple,
  isGoogleSignInAvailable,
  isAppleSignInAvailable
};
