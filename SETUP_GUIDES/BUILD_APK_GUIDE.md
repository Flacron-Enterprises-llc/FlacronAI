# 📦 Build APK - Complete Guide

## 🎯 Three Ways to Build Your APK

Choose the method that works best for you:

1. **EAS Build (Cloud)** - Easiest, recommended ⭐
2. **Local Build with Prebuild** - Full control
3. **Direct APK Build** - Quick local build

---

## ⭐ Option 1: EAS Build (RECOMMENDED)

### Why Use EAS Build?
- ✅ Builds in the cloud (no Android Studio needed)
- ✅ Handles signing and configuration automatically
- ✅ Produces production-ready APK
- ✅ Works from Windows, Mac, or Linux
- ✅ Free for personal projects

### Step-by-Step Instructions

#### 1. Login to Expo
```bash
cd "c:\Users\pc\Desktop\FlacronCV\MobileApp"
eas login
```

If you don't have an Expo account:
```bash
eas register
```

#### 2. Configure EAS Build
```bash
eas build:configure
```

This creates `eas.json` with build profiles.

#### 3. Build APK (Development)
For testing on your device:
```bash
eas build --platform android --profile preview
```

#### 4. Build APK (Production)
For Play Store or distribution:
```bash
eas build --platform android --profile production
```

#### 5. Download Your APK
After build completes (5-15 minutes):
- Check your Expo dashboard at https://expo.dev
- Download the APK file
- Install on your Android device

### Build Options

**Quick Preview Build:**
```bash
eas build -p android --profile preview --local
```
Builds locally on your machine (faster if you have Android Studio).

**Internal Distribution:**
```bash
eas build -p android --profile preview
```
Creates APK for testing.

**Production Build:**
```bash
eas build -p android --profile production
```
Creates signed APK ready for Play Store.

---

## 🔧 Option 2: Local Build with Prebuild

### Prerequisites
- Android Studio installed
- Java JDK 17 or higher
- Android SDK configured

### Step 1: Prebuild
```bash
cd "c:\Users\pc\Desktop\FlacronCV\MobileApp"
npx expo prebuild --platform android
```

### Step 2: Build APK
```bash
cd android
.\gradlew assembleRelease
```

### Step 3: Find Your APK
Location: `android\app\build\outputs\apk\release\app-release.apk`

---

## 🚀 Option 3: Direct APK Build (Fastest)

### Using Expo's Local Build
```bash
cd "c:\Users\pc\Desktop\FlacronCV\MobileApp"
npx expo run:android --variant release
```

This will:
1. Generate the android folder
2. Build the APK
3. Install on connected device

### Find APK
```bash
dir android\app\build\outputs\apk\release
```

---

## 📋 Complete Commands Reference

### EAS Build Commands

```bash
# Install EAS CLI (already done)
npm install -g eas-cli

# Login
eas login

# Configure (first time only)
eas build:configure

# Preview Build (for testing)
eas build --platform android --profile preview

# Production Build (for release)
eas build --platform android --profile production

# Local Build (faster)
eas build --platform android --profile preview --local

# Check build status
eas build:list

# Download latest build
eas build:download --platform android
```

### Local Build Commands

```bash
# Generate Android project
npx expo prebuild --platform android

# Build release APK
cd android
.\gradlew assembleRelease

# Or build directly
npx expo run:android --variant release

# Clean build (if needed)
cd android
.\gradlew clean
.\gradlew assembleRelease
```

---

## 🔑 App Signing (For Production)

### Automatic Signing (EAS - Recommended)
EAS handles this automatically. No manual setup needed!

### Manual Signing (Local Builds)

1. **Generate Keystore:**
```bash
keytool -genkeypair -v -storetype PKCS12 -keystore flacronai-release.keystore -alias flacronai -keyalg RSA -keysize 2048 -validity 10000
```

2. **Configure Gradle:**
Edit `android/app/build.gradle`:
```gradle
android {
    signingConfigs {
        release {
            storeFile file('flacronai-release.keystore')
            storePassword 'your-password'
            keyAlias 'flacronai'
            keyPassword 'your-password'
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

3. **Build Signed APK:**
```bash
cd android
.\gradlew assembleRelease
```

---

## 📱 Test Your APK

### On Physical Device

1. **Enable USB Debugging:**
   - Settings → About Phone → Tap "Build Number" 7 times
   - Settings → Developer Options → Enable USB Debugging

2. **Install APK:**
```bash
adb install android\app\build\outputs\apk\release\app-release.apk
```

Or copy APK to device and install manually.

### On Emulator

1. **Start Emulator:**
```bash
# List emulators
emulator -list-avds

# Start emulator
emulator -avd <device-name>
```

2. **Install APK:**
```bash
adb install path\to\your\app.apk
```

---

## 🐛 Troubleshooting

### Build Fails

**Error: "SDK location not found"**
```bash
# Create local.properties in android folder
echo sdk.dir=C:\\Users\\YourName\\AppData\\Local\\Android\\Sdk > android\local.properties
```

**Error: "Java version incompatible"**
```bash
# Check Java version
java -version

# Install Java 17 if needed
# Download from: https://adoptium.net/
```

**Error: "Gradle build failed"**
```bash
# Clear cache
cd android
.\gradlew clean

# Try again
.\gradlew assembleRelease --stacktrace
```

### APK Won't Install

**Error: "App not installed"**
- Uninstall old version first
- Enable "Install from Unknown Sources"
- Check APK signature

**Error: "Parse error"**
- APK might be corrupted
- Rebuild the APK
- Try different build method

---

## 📦 Optimize APK Size

### Enable ProGuard (Reduces size)

Edit `android/app/build.gradle`:
```gradle
buildTypes {
    release {
        minifyEnabled true
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
}
```

### Enable App Bundle (Recommended for Play Store)

```bash
# Build AAB instead of APK
cd android
.\gradlew bundleRelease

# Or with EAS
eas build --platform android --profile production
```

AAB files are smaller and optimized per device.

---

## 🎯 Recommended Workflow

### For Testing/Development:
```bash
# 1. Quick test build
npx expo run:android

# 2. Or EAS preview
eas build --platform android --profile preview
```

### For Production/Release:
```bash
# Use EAS for production
eas build --platform android --profile production
```

This gives you:
- ✅ Properly signed APK/AAB
- ✅ Optimized bundle
- ✅ Ready for Play Store
- ✅ Automatic updates via EAS Update

---

## 📊 Build Configuration

### Update app.json for Production

```json
{
  "expo": {
    "name": "FlacronAI",
    "slug": "flacronai",
    "version": "1.0.0",
    "android": {
      "package": "com.flacronenterprises.flacronai",
      "versionCode": 1,
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#FFFFFF"
      },
      "permissions": [
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "NOTIFICATIONS"
      ]
    }
  }
}
```

---

## ✅ Pre-Release Checklist

Before building final APK:

- [ ] Test all features work
- [ ] Test notifications
- [ ] Test report generation
- [ ] Test file export (PDF/DOCX)
- [ ] Test on different devices
- [ ] Update version number in app.json
- [ ] Update app icons
- [ ] Remove console.log statements
- [ ] Test offline functionality
- [ ] Test with production API
- [ ] Update privacy policy
- [ ] Prepare Play Store listing

---

## 🚀 Quick Start (TL;DR)

**Fastest way to get APK:**

```bash
# Method 1: EAS (Recommended)
eas login
eas build --platform android --profile preview

# Method 2: Local
npx expo run:android --variant release
```

APK will be at:
- EAS: Download from expo.dev
- Local: `android/app/build/outputs/apk/release/app-release.apk`

---

## 📱 Next Steps After Building

1. **Install and Test:**
   - Install APK on your device
   - Test all features thoroughly
   - Check notifications work
   - Test report generation and export

2. **Share for Testing:**
   - Send APK to beta testers
   - Gather feedback
   - Fix any issues

3. **Prepare for Play Store:**
   - Create Play Console account
   - Prepare screenshots (phone & tablet)
   - Write app description
   - Set up pricing and distribution
   - Upload AAB file (not APK)

4. **Submit:**
   - Upload via Play Console
   - Fill in all required information
   - Submit for review

---

## 📞 Need Help?

### Resources:
- [Expo EAS Build Docs](https://docs.expo.dev/build/introduction/)
- [React Native Docs](https://reactnative.dev/docs/signed-apk-android)
- [Android Developer Guides](https://developer.android.com/studio/publish)

### Common Issues:
- Build taking too long? Use local build
- APK too large? Enable ProGuard and use AAB
- Signature issues? Use EAS automatic signing
- Installation fails? Check device compatibility

---

**Good luck with your build!** 🎉

Your FlacronAI app is ready to be built and distributed!
