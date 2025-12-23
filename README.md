# 🔥 FlacronAI - AI-Powered Insurance Claim Reporting Platform

> **Professional insurance inspection reports powered by IBM WatsonX AI & OpenAI**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18+-blue.svg)](https://reactjs.org/)
[![React Native](https://img.shields.io/badge/React%20Native-Expo-purple.svg)](https://expo.dev/)

---

## 📋 Overview

**FlacronAI** is an enterprise-grade platform that revolutionizes insurance claim processing by combining AI-powered report generation with professional document management. Built for insurance adjusters, claim processors, and property inspectors.

### Why FlacronAI?

- ⚡ **10x Faster**: Generate comprehensive reports in minutes, not hours
- 🤖 **AI-Powered**: Dual-AI strategy using IBM WatsonX for enterprise reports and OpenAI for general features
- 📱 **Multi-Platform**: Web dashboard + Native mobile app (iOS/Android)
- 📄 **Professional Output**: Export reports as PDF, DOCX, or HTML
- 🔒 **Enterprise Security**: Firebase Authentication + JWT tokens
- 💳 **Monetization Ready**: Integrated Stripe subscription tiers

---

## ✨ Key Features

- **🤖 Dual-AI Strategy**: IBM WatsonX AI (Granite-3-8b) for structured reports + OpenAI (GPT-4) for summaries & image analysis
- **📊 Professional Reports**: CRU GROUP standard format with beautiful PDF/DOCX/HTML export
- **👤 Multi-Tier System**: Free (3 reports/month) → Professional ($39.99) → Agency ($99.99) → Enterprise ($499)
- **🔐 Secure Authentication**: Email/Password, Google Sign-In, Apple Sign-In via Firebase
- **📱 Native Mobile App**: React Native + Expo for iOS/Android with offline capability
- **💳 Stripe Payments**: Subscription management with auto-renewal
- **📸 Image Analysis**: AI-powered damage assessment from photos
- **🗺️ GPS Integration**: Auto-populate property locations

---

## 🛠 Tech Stack

**Frontend (Web)**: React 18 + Vite + React Router
**Frontend (Mobile)**: React Native + Expo SDK 51+
**Backend**: Node.js 18 + Express + Firebase Admin
**AI**: IBM WatsonX AI (Granite-3-8b-instruct) + OpenAI (GPT-4)
**Database**: Firebase Firestore + Firebase Storage
**Payments**: Stripe API
**Auth**: Firebase Authentication
**Hosting**: Render.com (backend) + Netlify/Vercel (frontend)

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ | npm/yarn | Git
- Firebase Account | IBM Cloud Account | OpenAI API Key | Stripe Account

### 1. Clone Repository

```bash
git clone https://github.com/RODRIGUEFOKA/FlacronAI.git
cd FlacronAI
```

### 2. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your credentials
npm start
```

Backend: `http://localhost:3000`

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173`

### 4. Mobile App Setup

```bash
cd MobileApp
npm install
npx expo start
```

Scan QR code with Expo Go app

---

## 📁 Project Structure

```
FlacronAI/
├── backend/                    # Node.js Express API
│   ├── config/                 # Firebase, WatsonX, OpenAI configs
│   ├── routes/                 # API endpoints
│   ├── services/               # Business logic
│   ├── utils/                  # PDF/DOCX generators
│   └── server.js               # Entry point
├── frontend/                   # React web app
│   ├── src/pages/              # Dashboard, Checkout, etc.
│   ├── src/services/           # API clients
│   └── vite.config.js
├── MobileApp/                  # React Native app
│   ├── screens/                # Login, Signup, etc.
│   ├── services/               # Auth, social login
│   └── App.js
├── SETUP_GUIDES/               # Setup documentation
│   ├── FIREBASE_SETUP.md
│   ├── WATSONX_SETUP.md
│   └── BUILD_APK_GUIDE.md
└── README.md                   # This file
```

---

## 🔐 Environment Variables

### Backend (.env)

```env
# AI Providers
OPENAI_API_KEY=sk-proj-your-key
WATSONX_API_KEY=your-key
WATSONX_PROJECT_ID=your-project-id
WATSONX_URL=https://us-south.ml.cloud.ibm.com
WATSONX_MODEL=ibm/granite-3-8b-instruct

# Firebase
FIREBASE_PROJECT_ID=your-project
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com

# Stripe
STRIPE_SECRET_KEY=sk_test_your-key
STRIPE_WEBHOOK_SECRET=whsec_your-secret
STRIPE_PRICE_PROFESSIONAL=price_xxx
STRIPE_PRICE_AGENCY=price_xxx
STRIPE_PRICE_ENTERPRISE=price_xxx

# Server
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

See `backend/.env.example` for complete template.

### Frontend (.env)

```env
VITE_API_URL=http://localhost:3000/api
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your-key
```

### Mobile (app.json)

```json
{
  "expo": {
    "extra": {
      "apiUrl": "https://your-backend.onrender.com/api",
      "firebaseApiKey": "your-key",
      "googleWebClientId": "your-web-client-id"
    }
  }
}
```

---

## 📚 Documentation

- **[Firebase Setup Guide](SETUP_GUIDES/FIREBASE_SETUP_GUIDE.md)** - Configure authentication & database
- **[WatsonX AI Setup](SETUP_GUIDES/IBM_WATSONX_SETUP_GUIDE.md)** - Get IBM Cloud credentials
- **[Mobile App Build Guide](SETUP_GUIDES/BUILD_APK_GUIDE.md)** - Build Android/iOS apps
- **[Technical Documentation](TECHNICAL_DOCUMENTATION.md)** - Detailed architecture & API docs

---

## 🚀 Deployment

### Backend (Render.com)

1. Create Web Service on Render
2. Build: `cd backend && npm install`
3. Start: `cd backend && npm start`
4. Add environment variables
5. Deploy!

### Frontend (Netlify)

```bash
cd frontend
npm run build
# Deploy dist/ folder
```

### Mobile (EAS Build)

```bash
cd MobileApp
npm install -g eas-cli
eas login
eas build --platform android --profile production
eas submit --platform android
```

---

## 📖 API Examples

### Register User

```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "displayName": "John Doe"
}
```

### Generate Report

```bash
POST /api/reports/generate
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "claimNumber": "CLM-123456",
  "insuredName": "John Doe",
  "lossType": "Water Damage",
  "lossDescription": "Pipe burst in bathroom...",
  "damages": "Water damage to walls, floor...",
  "recommendations": "Immediate water extraction..."
}
```

### Export PDF

```bash
POST /api/reports/export/pdf
Authorization: Bearer <jwt-token>

{
  "reportId": "report-uuid"
}
```

---

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md)

1. Fork the repo
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit: `git commit -m 'Add amazing feature'`
4. Push: `git push origin feature/amazing-feature`
5. Open Pull Request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file

---

## 👥 Support

- **Developer**: Rodrigue Foka
- **Repository**: [github.com/RODRIGUEFOKA/FlacronAI](https://github.com/RODRIGUEFOKA/FlacronAI)
- **Issues**: [GitHub Issues](https://github.com/RODRIGUEFOKA/FlacronAI/issues)

---

## 🙏 Acknowledgments

- IBM WatsonX AI - Enterprise AI models
- OpenAI - GPT-4 capabilities
- Firebase - Authentication & database
- Stripe - Payment processing
- Expo - React Native platform

---

<div align="center">

**Made with ❤️ for Insurance Professionals**

[Report Bug](https://github.com/RODRIGUEFOKA/FlacronAI/issues) · [Request Feature](https://github.com/RODRIGUEFOKA/FlacronAI/issues)

**Status**: ✅ Production Ready

</div>
