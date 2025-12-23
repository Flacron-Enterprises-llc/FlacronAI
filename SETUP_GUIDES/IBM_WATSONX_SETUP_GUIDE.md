# Complete IBM WatsonX Setup Guide - Step by Step

## Overview
This guide will walk you through creating an IBM Cloud account, setting up WatsonX.ai, creating a project, and getting your credentials for FlacronAI.

---

## Step 1: Create IBM Cloud Account

### 1.1 Sign Up for IBM Cloud
1. Go to: https://cloud.ibm.com/registration
2. Fill in the registration form:
   - **Email address**: Use your business email
   - **First name** and **Last name**
   - **Country/Region**: Select your country
   - **Password**: Create a strong password
3. Check "I have read and agree to the terms and conditions"
4. Click **"Next"**

### 1.2 Verify Your Email
1. Check your email inbox
2. Click the verification link from IBM Cloud
3. Complete email verification

### 1.3 Complete Account Setup
1. After email verification, you'll be redirected to IBM Cloud
2. You may be asked to provide:
   - Company name (optional, you can use "FlacronAI")
   - Phone number
3. Click **"Create account"**

### 1.4 Choose Account Type
- **FREE Trial**: Recommended for testing (includes free credits)
- Click **"Continue with Lite"** (free tier)

**Note**: You'll get access to WatsonX.ai Lite (free tier) which is perfect for testing.

---

## Step 2: Provision WatsonX.ai Service

### 2.1 Access IBM Cloud Dashboard
1. Go to: https://cloud.ibm.com/
2. Login with your IBM Cloud credentials
3. You should see the IBM Cloud Dashboard

### 2.2 Search for WatsonX.ai
1. Click the **"Catalog"** button in the top navigation
2. In the search bar, type: **"watsonx.ai"**
3. Click on **"watsonx.ai"** from the results

**OR** Direct link: https://cloud.ibm.com/catalog/services/watsonx-ai

### 2.3 Provision the Service
1. On the WatsonX.ai page:
   - **Select a location**: Choose **"Dallas"** or **"London"** (depending on your region)
   - **Select a pricing plan**: Choose **"Lite"** (free tier)
     - Includes: Limited free tokens/month
     - No credit card required
   - **Service name**: Leave default or change to "watsonx-ai-flacronai"
   - **Resource group**: Select **"Default"**

2. Review the pricing plan details:
   - Lite plan is FREE
   - Provides limited API calls per month
   - Perfect for testing and small projects

3. Click **"Create"** button at the bottom right

### 2.4 Wait for Provisioning
- Wait 30-60 seconds for the service to be created
- You'll see a success message when ready

---

## Step 3: Launch WatsonX.ai Platform

### 3.1 Access WatsonX Dashboard
1. After provisioning, you'll see the service details page
2. Click the **"Launch watsonx.ai"** button
   - This opens the WatsonX.ai platform in a new tab

**OR** Direct link: https://dataplatform.cloud.ibm.com/wx/home

### 3.2 Welcome Screen
- You may see a welcome screen or tutorial
- Click **"Get started"** or skip the tutorial

---

## Step 4: Create a WatsonX Project

### 4.1 Navigate to Projects
1. In the WatsonX.ai dashboard, click **"Projects"** in the left sidebar
2. You should see an empty projects list
3. Click the **"New project"** button (top right)

### 4.2 Choose Project Type
1. Select **"Create an empty project"**
2. Click **"Next"**

### 4.3 Configure Project Details
Fill in the project information:

- **Name**: `FlacronAI Reports` (or any name you prefer)
- **Description** (optional): `AI-powered insurance report generation using WatsonX`
- **Storage**:
  - Click **"Add"** next to "Select storage service"
  - See Step 5 below for creating storage

### 4.4 Wait - You Need Cloud Object Storage First
Before you can create a project, you need to set up storage. Continue to Step 5.

---

## Step 5: Create Cloud Object Storage (COS)

WatsonX projects require IBM Cloud Object Storage to store project assets.

### 5.1 Create Object Storage Instance
1. While on the "New project" page, click **"Add"** next to storage
2. This opens a new tab to create Object Storage

**OR** Go directly to: https://cloud.ibm.com/catalog/services/cloud-object-storage

### 5.2 Configure Object Storage
1. On the Cloud Object Storage page:
   - **Select a location**: Choose **"Global"**
   - **Select a pricing plan**: Choose **"Lite"** (FREE)
     - Includes: 25 GB storage free
     - No credit card required
   - **Service name**: Leave default or change to "cos-flacronai"
   - **Resource group**: Select **"Default"**

2. Click **"Create"**

### 5.3 Create a Bucket
After creating the Object Storage instance:

1. You'll be redirected to the Object Storage dashboard
2. Click **"Create bucket"** button
3. Choose **"Quickly get started"** template
4. Configure bucket:
   - **Unique bucket name**: `flacronai-watsonx-bucket` (must be globally unique)
     - If taken, try: `flacronai-watsonx-<your-initials>-bucket`
   - **Resiliency**: Select **"Regional"**
   - **Location**: Choose closest to you (e.g., **"us-south"**)
   - **Storage class**: Select **"Smart Tier"**
5. Click **"Create bucket"**

### 5.4 Confirm Storage Created
- You should see your bucket listed
- Note the bucket name (you'll use this in the project)

---

## Step 6: Complete Project Creation

### 6.1 Go Back to WatsonX
1. Return to the WatsonX.ai tab (from Step 4.3)
2. If you closed it, go to: https://dataplatform.cloud.ibm.com/wx/home
3. Click **"Projects"** → **"New project"**

### 6.2 Select Storage
1. Click **"Add"** next to "Select storage service"
2. From the dropdown:
   - Select your Object Storage instance (created in Step 5)
   - Select the bucket you created
3. Click **"Select"**

### 6.3 Create Project
1. Verify all details:
   - Project name: `FlacronAI Reports`
   - Storage: Your bucket is selected
2. Click **"Create"** button

### 6.4 Wait for Project Creation
- Takes 10-30 seconds
- You'll be redirected to your new project dashboard

---

## Step 7: Get Your Project ID

### 7.1 Access Project Settings
1. In your project dashboard, click the **"Manage"** tab (top navigation)
2. Click **"General"** in the left sidebar

### 7.2 Copy Project ID
1. You'll see **"Project ID"** section
2. Copy the Project ID (looks like: `4cc84f01-a808-4740-8e2e-baf31921ed89`)
3. **SAVE THIS** - you'll need it for FlacronAI

**Example:**
```
Project ID: 4cc84f01-a808-4740-8e2e-baf31921ed89
```

---

## Step 8: Create API Key

### 8.1 Navigate to API Keys
1. Stay in the **"Manage"** tab
2. Click **"Access (IAM)"** in the left sidebar
   - OR go to: https://cloud.ibm.com/iam/apikeys

### 8.2 Create New API Key
1. Click **"Create an IBM Cloud API key"** button (top right)
2. Fill in the form:
   - **Name**: `FlacronAI WatsonX Key`
   - **Description** (optional): `API key for FlacronAI insurance report generation`
3. Click **"Create"**

### 8.3 Copy and Save API Key
⚠️ **IMPORTANT**: You can only see the API key ONCE!

1. A popup will show your API key
2. Click **"Copy"** button
3. **SAVE THIS IMMEDIATELY** in a secure location (e.g., password manager)

**Example:**
```
API Key: diYyLoHLXkwz7cCZN_GrcLG0j7quXyjJ6uPqlJYbMAcL
```

4. Click **"Download"** (optional - saves JSON file with key)
5. Click **"Close"** when done

---

## Step 9: Verify API Key Permissions

### 9.1 Check API Key Access
1. Go back to your WatsonX project: https://dataplatform.cloud.ibm.com/wx/home
2. Click on **"FlacronAI Reports"** project
3. Go to **"Manage"** → **"Access (IAM)"**
4. Verify your IBM Cloud account email is listed with **"Admin"** role

### 9.2 Ensure Correct Permissions
Your API key automatically has access to the project because:
- It was created under your IBM Cloud account
- Your account owns the project
- No additional permissions needed

---

## Step 10: Configure FlacronAI Backend

### 10.1 Update Local Environment Variables

Open `backend/.env` and update:

```env
# IBM WatsonX AI - Enterprise reports
WATSONX_API_KEY=<YOUR_API_KEY_FROM_STEP_8>
WATSONX_URL=https://us-south.ml.cloud.ibm.com
WATSONX_MODEL=ibm/granite-13b-chat-v2
WATSONX_PROJECT_ID=<YOUR_PROJECT_ID_FROM_STEP_7>
```

**Example:**
```env
WATSONX_API_KEY=diYyLoHLXkwz7cCZN_GrcLG0j7quXyjJ6uPqlJYbMAcL
WATSONX_URL=https://us-south.ml.cloud.ibm.com
WATSONX_MODEL=ibm/granite-13b-chat-v2
WATSONX_PROJECT_ID=4cc84f01-a808-4740-8e2e-baf31921ed89
```

### 10.2 Update Render.com (Production)

1. Go to: https://dashboard.render.com/
2. Click your **FlacronAI backend** service
3. Go to **"Environment"** tab
4. Add or update these variables:
   ```
   WATSONX_API_KEY=<YOUR_API_KEY>
   WATSONX_URL=https://us-south.ml.cloud.ibm.com
   WATSONX_MODEL=ibm/granite-13b-chat-v2
   WATSONX_PROJECT_ID=<YOUR_PROJECT_ID>
   ```
5. Click **"Save Changes"**

### 10.3 Update WatsonX URL Based on Region

If you selected a different region in Step 5.3, update the URL:

- **US South (Dallas)**: `https://us-south.ml.cloud.ibm.com`
- **US East (Washington DC)**: `https://us-east.ml.cloud.ibm.com`
- **EU Germany (Frankfurt)**: `https://eu-de.ml.cloud.ibm.com`
- **EU UK (London)**: `https://eu-gb.ml.cloud.ibm.com`
- **Japan (Tokyo)**: `https://jp-tok.ml.cloud.ibm.com`

---

## Step 11: Test WatsonX Integration

### 11.1 Test Locally

```bash
cd backend
npm start
```

Check the console logs for:
```
✅ WatsonX AI initialized successfully
🔵 WatsonX AI: Ready for enterprise reports
```

### 11.2 Test API Status

Open browser: http://localhost:3000/api/reports/ai-status

You should see:
```json
{
  "success": true,
  "providers": {
    "watsonx": {
      "available": true,
      "configured": true,
      "provider": "IBM WatsonX AI",
      "features": ["Report Generation"]
    }
  }
}
```

### 11.3 Generate Test Report

1. Login to FlacronAI web app
2. Create a new report with test data
3. Check backend logs for:
   ```
   🔵 Calling WatsonX AI for report generation...
   Project ID: 4cc84f01-a808-4740-8e2e-baf31921ed89
   ```
4. Report should generate successfully

---

## Step 12: Monitor Usage and Limits

### 12.1 Check WatsonX Usage
1. Go to: https://dataplatform.cloud.ibm.com/wx/home
2. Click **"Resource usage"** in left sidebar
3. View your token usage and limits

### 12.2 Lite Plan Limits
- **Free tokens per month**: Limited (varies)
- **Models available**: Granite, Llama, etc.
- **Rate limits**: Apply

### 12.3 Upgrade to Paid Plan (Optional)
If you exceed limits:
1. Go to: https://cloud.ibm.com/catalog/services/watsonx-ai
2. Click your watsonx-ai instance
3. Click **"Plan"** tab
4. Click **"Upgrade"** to switch to paid plan

---

## Troubleshooting

### Error: "Failed to find project_id"
**Cause**: Wrong Project ID or API key doesn't have access

**Solution**:
1. Verify Project ID in WatsonX dashboard
2. Create a NEW API key from IBM Cloud console
3. Update both local `.env` and Render environment variables

### Error: "Access is denied due to invalid credentials"
**Cause**: API key is wrong or expired

**Solution**:
1. Go to: https://cloud.ibm.com/iam/apikeys
2. Delete old API key
3. Create new API key
4. Update FlacronAI configuration

### Error: "Service not available"
**Cause**: Wrong service URL for your region

**Solution**:
- Check your Object Storage region
- Update `WATSONX_URL` to match your region

### Error: "Rate limit exceeded"
**Cause**: Too many API calls in Lite plan

**Solution**:
- Wait for rate limit to reset (usually monthly)
- Upgrade to paid plan

---

## Important URLs Reference

| Resource | URL |
|----------|-----|
| IBM Cloud Dashboard | https://cloud.ibm.com/ |
| WatsonX.ai Platform | https://dataplatform.cloud.ibm.com/wx/home |
| API Keys Management | https://cloud.ibm.com/iam/apikeys |
| Object Storage | https://cloud.ibm.com/objectstorage |
| WatsonX Catalog | https://cloud.ibm.com/catalog/services/watsonx-ai |
| Billing & Usage | https://cloud.ibm.com/billing/usage |

---

## Summary Checklist

- [ ] Created IBM Cloud account
- [ ] Provisioned WatsonX.ai service (Lite plan)
- [ ] Created Cloud Object Storage (Lite plan)
- [ ] Created storage bucket
- [ ] Created WatsonX project
- [ ] Copied Project ID
- [ ] Created API key
- [ ] Saved API key securely
- [ ] Updated `backend/.env` with credentials
- [ ] Updated Render.com environment variables
- [ ] Tested WatsonX integration locally
- [ ] Verified API status endpoint
- [ ] Generated test report successfully

---

## Next Steps

Once setup is complete:

1. ✅ Test report generation in local development
2. ✅ Push changes to GitHub (Render will auto-deploy)
3. ✅ Test production deployment on Render
4. ✅ Monitor WatsonX usage in IBM Cloud dashboard
5. ✅ Consider upgrading to paid plan if needed

---

## Support

- **IBM WatsonX Documentation**: https://cloud.ibm.com/docs/watsonx-ai
- **WatsonX Community**: https://community.ibm.com/community/user/watsonx/home
- **IBM Cloud Support**: https://cloud.ibm.com/unifiedsupport/supportcenter

---

**Setup Date**: December 22, 2025
**Guide Version**: 1.0
**Last Updated**: Today
