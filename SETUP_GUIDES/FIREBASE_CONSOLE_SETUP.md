
# Firebase Console Setup Guide

Follow these steps to enable authentication in Firebase Console.

---

## Step 1: Go to Firebase Console

1. Open your browser and go to: https://console.firebase.google.com
2. Log in with your Google account
3. Select your project: **flacronai**

---

## Step 2: Enable Email/Password Authentication

1. In the left sidebar, click **Authentication**
2. Click **Get Started** (if you haven't set up authentication yet)
3. Go to the **Sign-in method** tab
4. Click on **Email/Password** provider
5. Toggle **Enable** to ON
6. Click **Save**

✅ Email/Password authentication is now enabled!

---

## Step 3: Enable Google Sign-In

1. Still in **Sign-in method** tab, click on **Google** provider
2. Toggle **Enable** to ON
3. Enter **Project support email**: (your email address)
4. Click **Save**
5. **Important**: Copy the **Web client ID** that appears - you'll need this later

✅ Google Sign-In is now enabled!

---

## Step 4: Enable Apple Sign-In (Optional - iOS only)

1. In **Sign-in method** tab, click on **Apple** provider
2. Toggle **Enable** to ON
3. Click **Save**

**Note**: For production iOS apps, you need:
- Apple Developer Account ($99/year)
- Configure in Apple Developer Console
- For now, just enable it in Firebase

✅ Apple Sign-In is now enabled!

---

## Step 5: Set Up Firestore Database

1. In the left sidebar, click **Firestore Database**
2. Click **Create database**
3. Select **Start in production mode**
4. Choose location: **us-central** (or closest to your users)
5. Click **Enable**

### Set Security Rules:

6. Go to **Rules** tab
7. Replace the content with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection - users can only read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Reports collection - users can only access their own reports
    match /reports/{reportId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
    }
  }
}
```

8. Click **Publish**

✅ Firestore is now set up with security rules!

---

## Step 6: Customize Email Templates (Optional)

1. In **Authentication**, go to **Templates** tab
2. Click **Email address verification**:
   - Customize the subject: "Verify your FlacronAI account"
   - Edit the email body with your branding
   - Click **Save**

3. Click **Password reset**:
   - Customize the subject: "Reset your FlacronAI password"
   - Edit the email body
   - Click **Save**

✅ Email templates are customized!

---

## Step 7: Get Your Web Client ID (For Google Sign-In)

1. Go to **Authentication** → **Sign-in method**
2. Click on **Google** provider
3. Find the **Web SDK configuration** section
4. Copy the **Web client ID** (looks like: `924587706021-xxxxx.apps.googleusercontent.com`)

### Update Mobile App:

5. Open `MobileApp/services/authService.js`
6. Find this line (around line 5-7):
   ```javascript
   webClientId: '924587706021-YOUR_WEB_CLIENT_ID.apps.googleusercontent.com'
   ```
7. Replace with your actual Web client ID

---

## What's Enabled Now:

✅ **Email/Password Authentication** - Users can sign up with email
✅ **Email Verification** - Verification emails sent automatically
✅ **Password Reset** - Users can reset forgotten passwords
✅ **Google Sign-In** - OAuth login with Google (needs Web Client ID)
✅ **Apple Sign-In** - OAuth login with Apple (iOS only)
✅ **Firestore Database** - User data storage with security rules

---

## Testing Your Setup:

### Test Email/Password:
1. Run your mobile app: `npm start`
2. Go to Signup screen
3. Create account with email/password
4. Check email for verification link
5. Click verification link
6. Log in with email/password

### Test Google Sign-In:
1. After adding Web Client ID to `authService.js`
2. Build native app: `npx expo run:android`
3. Click Google Sign-In button
4. Select Google account
5. You should be logged in!

### Verify in Firebase Console:
1. Go to **Authentication** → **Users** tab
2. You should see your test users listed
3. Go to **Firestore Database** → **Data** tab
4. You should see `users` collection with user documents

---

## Troubleshooting:

### "Email already in use"
- The email is already registered
- Try a different email or use password reset

### "Please verify your email"
- Check your inbox (and spam folder)
- Click the verification link
- Then try logging in again

### "Network error"
- Check your internet connection
- Make sure Firebase config credentials are correct

### Google Sign-In not working
- Make sure you added the Web Client ID
- For native builds, you need Android/iOS app registered in Firebase

---

## Summary:

Your Firebase is now fully configured with:
- ✅ Email/Password authentication
- ✅ Google Sign-In (add Web Client ID)
- ✅ Apple Sign-In (placeholder)
- ✅ Firestore database with security rules
- ✅ Email verification enabled
- ✅ Password reset enabled

**Mobile app credentials are already configured and match your web app!**

You're ready to test! 🚀
