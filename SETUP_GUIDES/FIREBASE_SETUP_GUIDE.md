# 🔥 Complete Firebase Authentication Setup Guide for FlacronAI

This guide will walk you through setting up Firebase Authentication with Email/Password, Google, Apple, and GitHub sign-in.

---

## 📋 Prerequisites

- [ ] Google Account
- [ ] Node.js 18+ installed
- [ ] Firebase CLI installed: `npm install -g firebase-tools`
- [ ] FlacronAI project code downloaded

---

## Part 1️⃣: Firebase Project Setup

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **"Add project"** or **"Create a project"**
3. Enter project name: **`flacronai`** (or your preferred name)
4. Click **Continue**
5. **Enable Google Analytics** (recommended for tracking)
6. Click **Create project**
7. Wait for project creation (~30 seconds)
8. Click **Continue** when ready

---

## Part 2️⃣: Enable Authentication Providers

### Step 2.1: Enable Email/Password Authentication

1. In Firebase Console, click **Authentication** in left sidebar
2. Click **Get started** (if first time)
3. Go to **Sign-in method** tab
4. Click **Email/Password**
5. Toggle **Enable** to ON
6. Click **Save**

### Step 2.2: Enable Google Sign-In

1. In **Sign-in method** tab, click **Google**
2. Toggle **Enable** to ON
3. Enter **Project support email**: your-email@gmail.com
4. Click **Save**
5. **Copy** the **Web client ID** - you'll need this later

### Step 2.3: Enable Apple Sign-In

1. In **Sign-in method** tab, click **Apple**
2. Toggle **Enable** to ON
3. Click **Save**

**Note**: For production iOS apps, you need:
- Apple Developer Account ($99/year)
- Register your app Bundle ID
- Enable Sign in with Apple capability
- Get Service ID from Apple Developer Console

For now, enable it for web/development.

### Step 2.4: Enable GitHub Sign-In

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **OAuth Apps** → **New OAuth App**
3. Fill in:
   - **Application name**: FlacronAI
   - **Homepage URL**: `https://flacronai.com` (or your domain)
   - **Authorization callback URL**: Get from Firebase (next step)
4. Go back to Firebase Console → **Sign-in method** → **GitHub**
5. Toggle **Enable** to ON
6. **Copy** the callback URL shown (looks like: `https://flacronai.firebaseapp.com/__/auth/handler`)
7. Paste this into GitHub OAuth App's **Authorization callback URL**
8. In GitHub, click **Register application**
9. **Copy** the **Client ID** and generate **Client Secret**
10. Paste both into Firebase GitHub settings
11. Click **Save** in Firebase

---

## Part 3️⃣: Get Firebase Configuration Credentials

### Step 3.1: Get Web App Configuration

1. In Firebase Console, click **Project Overview** (top left)
2. Click the **Web icon** (`</>`) to add web app
3. Enter **App nickname**: `FlacronAI Web`
4. Check **"Also set up Firebase Hosting"** (optional)
5. Click **Register app**
6. **Copy** the entire `firebaseConfig` object:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyAx1ltcGH7j5R8YeuuuTMn3wxJT17-LJxQ",
  authDomain: "flacronai.firebaseapp.com",
  projectId: "flacronai",
  storageBucket: "flacronai.firebasestorage.app",
  messagingSenderId: "924587706021",
  appId: "1:924587706021:web:eec9131d64c8ee0f81ef4c",
  measurementId: "G-0NYRHLSYMQ"
};
```

7. Click **Continue to console**

### Step 3.2: Download Complete JSON Credentials (Service Account)

**Why you need this**: For backend services, Cloud Functions, or admin SDK operations.

1. In Firebase Console, click **⚙️ Settings** (gear icon) → **Project settings**
2. Go to **Service accounts** tab
3. Click **Generate new private key**
4. A warning dialog appears - Click **Generate key**
5. A JSON file will download: `flacronai-firebase-adminsdk-xxxxx.json`
6. **⚠️ IMPORTANT**: Keep this file secure! It has admin access to your Firebase project
7. **Never commit this file to Git** - Add to `.gitignore`
8. Store it in a secure location

**What the JSON contains**:
```json
{
  "type": "service_account",
  "project_id": "flacronai",
  "private_key_id": "xxxxx",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@flacronai.iam.gserviceaccount.com",
  "client_id": "xxxxx",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
}
```

**Where to use this**:
- Backend Node.js servers (initialize with `admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })`)
- Cloud Functions (automatic authentication)
- Server-side operations requiring elevated permissions

---

## Part 4️⃣: Configure Email Templates

### Step 4: Customize Email Templates

1. In Firebase Console → **Authentication** → **Templates** tab
2. Click **Email address verification**
   - Customize subject: "Verify your FlacronAI account"
   - Customize body with your branding
   - Use variables: `%LINK%`, `%APP_NAME%`
3. Click **Password reset**
   - Customize subject: "Reset your FlacronAI password"
   - Customize body
4. Click **Save** for each template

---

## Part 5️⃣: Set Up Firestore Database

### Step 5.1: Create Firestore Database

1. In Firebase Console, click **Firestore Database** in left sidebar
2. Click **Create database**
3. Select **Production mode** (we'll set custom rules)
4. Choose location: **us-central1** (or closest to your users)
5. Click **Enable**

### Step 5.2: Configure Security Rules

1. Go to **Rules** tab in Firestore
2. Replace with these security rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    match /reports/{reportId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
    }
  }
}
```

3. Click **Publish**

---

## Part 6️⃣: Update Mobile App Configuration

### Step 6.1: Update Firebase Config in Mobile App

1. Open `MobileApp/config/firebase.js`
2. The config is already updated with your credentials:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyAx1ltcGH7j5R8YeuuuTMn3wxJT17-LJxQ",
  authDomain: "flacronai.firebaseapp.com",
  projectId: "flacronai",
  storageBucket: "flacronai.firebasestorage.app",
  messagingSenderId: "924587706021",
  appId: "1:924587706021:web:eec9131d64c8ee0f81ef4c",
  measurementId: "G-0NYRHLSYMQ"
};
```

✅ No changes needed - already configured!

### Step 6.2: Configure OAuth Client IDs

1. In `MobileApp/services/authService.js`, find the Google sign-in configuration
2. Replace placeholder client IDs with your actual ones from Firebase Console

```javascript
const [request, response, promptAsync] = Google.useAuthRequest({
  expoClientId: 'YOUR_EXPO_CLIENT_ID.apps.googleusercontent.com',
  iosClientId: 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com',
  androidClientId: 'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com',
  webClientId: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com',
});
```

**Where to get these**:
- **Web Client ID**: From Firebase Console → Authentication → Sign-in method → Google
- **Android Client ID**: Generate in Firebase Console → Project Settings → Add Android app
- **iOS Client ID**: Generate in Firebase Console → Project Settings → Add iOS app
- **Expo Client ID**: Same as Web Client ID (for development)

---

## Part 7️⃣: Configure Mobile App OAuth (Android & iOS)

### Step 7.1: Add Android App to Firebase

1. Firebase Console → **Project Overview** → Click **Android icon**
2. Enter:
   - **Android package name**: `com.flacron.ai`
   - **App nickname**: `FlacronAI Android`
3. **Download** `google-services.json`
4. Get your **SHA-1 fingerprint**:

```bash
cd MobileApp/android
./gradlew signingReport
```

5. Copy SHA-1 and paste in Firebase
6. Click **Register app** → **Download google-services.json**
7. Place file in `MobileApp/android/app/google-services.json`

### Step 7.2: Add iOS App to Firebase

1. Firebase Console → **Project Overview** → Click **iOS icon**
2. Enter:
   - **iOS bundle ID**: `com.flacron.ai`
   - **App nickname**: `FlacronAI iOS`
3. **Download** `GoogleService-Info.plist`
4. Click **Register app**
5. Place file in `MobileApp/ios/FlacronAI/GoogleService-Info.plist`

---

## Part 8️⃣: Testing All Authentication Flows

### Test 1: Email/Password Signup & Login

1. Run the mobile app: `cd MobileApp && npm start`
2. Navigate to **Signup** screen
3. Fill in:
   - Full Name: Test User
   - Email: test@example.com
   - Password: Test123456
4. Click **CREATE ACCOUNT**
5. **Expected**: "Verification Email Sent" alert
6. Check email inbox for verification link
7. Click verification link
8. Go back to app → **Login** screen
9. Enter same email/password
10. **Expected**: Successfully logged in

### Test 2: Google Sign-In

1. On Login screen, tap **Google** button
2. Select Google account
3. Grant permissions
4. **Expected**: Successfully logged in

### Test 3: Apple Sign-In

1. On Login screen, tap **Apple** button
2. Authenticate with Face ID / Touch ID
3. Choose email option
4. **Expected**: Successfully logged in

### Test 4: GitHub Sign-In

1. On Login screen, tap **GitHub** button
2. Enter GitHub credentials
3. Authorize app
4. **Expected**: Successfully logged in

### Test 5: Password Reset

1. On Login screen, tap **Forgot Password?**
2. Enter email: test@example.com
3. Click **SEND RESET LINK**
4. **Expected**: "Email Sent" message
5. Check email for password reset link
6. Click link → Set new password
7. Return to app and login with new password

---

## Part 9️⃣: Troubleshooting

### Issue 1: "API key not valid"
**Solution**: Double-check `firebaseConfig` in `MobileApp/config/firebase.js` matches Firebase Console

### Issue 2: Google Sign-In not working
**Solution**:
- Verify Web Client ID is correct in `authService.js`
- For Android: Check SHA-1 fingerprint is added in Firebase
- For iOS: Ensure `GoogleService-Info.plist` is properly added

### Issue 3: Email verification not sending
**Solution**: Check Firebase Console → Authentication → Templates → Email address verification is enabled

### Issue 4: GitHub OAuth fails
**Solution**:
- Verify callback URL in GitHub OAuth App matches Firebase
- Check Client ID and Secret are correctly entered in Firebase

### Issue 5: Firestore permission denied
**Solution**: Check security rules in Firestore allow authenticated users to read/write their own data

### Issue 6: "Module not found: firebase/auth"
**Solution**:
```bash
cd MobileApp
npm install firebase
```

### Issue 7: Apple Sign-In only works on iOS devices
**Solution**: This is expected - Apple Sign-In requires iOS device or simulator. For web testing, use other methods.

---

## Part 🔟: Production Checklist

Before launching to production:

- [ ] ✅ All authentication providers tested
- [ ] ✅ Email templates customized with branding
- [ ] ✅ Firestore security rules deployed
- [ ] ✅ OAuth credentials for production apps configured
- [ ] ✅ Service account JSON file stored securely
- [ ] ✅ `.env` or config files in `.gitignore`
- [ ] ✅ Firebase billing plan upgraded (if needed)
- [ ] ✅ Firebase quota limits reviewed
- [ ] ✅ Error monitoring setup (Crashlytics, Sentry)
- [ ] ✅ Rate limiting implemented on client side
- [ ] ✅ User data backup strategy in place

---

## Part 1️⃣1️⃣: Useful Commands Reference

### Firebase CLI

```bash
# Login to Firebase
firebase login

# List projects
firebase projects:list

# Select project
firebase use flacronai

# Deploy security rules
firebase deploy --only firestore:rules

# View logs
firebase functions:log

# Test locally
firebase emulators:start
```

### Mobile App

```bash
# Install dependencies
cd MobileApp
npm install

# Start development server
npm start

# Run on Android
npm run android

# Run on iOS
npm run ios

# Build APK
cd android && ./gradlew assembleRelease

# Build iOS
cd ios && xcodebuild -workspace FlacronAI.xcworkspace -scheme FlacronAI -configuration Release
```

---

## Part 1️⃣2️⃣: Getting Help

### Documentation Links

- [Firebase Authentication Docs](https://firebase.google.com/docs/auth)
- [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [React Native Firebase](https://rnfirebase.io)
- [Expo Auth Session](https://docs.expo.dev/guides/authentication/)

### Support Channels

- Firebase Support: [https://firebase.google.com/support](https://firebase.google.com/support)
- Stack Overflow: Tag `firebase` + `react-native`
- FlacronAI Issues: Open issue on GitHub repository

### Cost Information

- **Spark Plan (Free)**:
  - 50,000 monthly active users
  - 1 GB Firestore storage
  - Perfect for development and small apps

- **Blaze Plan (Pay as you go)**:
  - Unlimited users
  - $0.06/GB for Firestore storage
  - Required for Cloud Functions

---

## 🎉 Setup Complete!

Your Firebase Authentication is now fully configured with:
- ✅ Email/Password authentication
- ✅ Google Sign-In
- ✅ Apple Sign-In
- ✅ GitHub Sign-In
- ✅ Password Reset
- ✅ Email Verification
- ✅ Firestore database with security rules
- ✅ Mobile app integration

**Next Steps**:
1. Test all authentication flows
2. Customize email templates
3. Set up production OAuth credentials
4. Deploy to production

Happy coding! 🚀
