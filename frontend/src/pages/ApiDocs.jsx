import { useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Seo from '../components/Seo.jsx';

const METHOD_COLORS = {
  GET: 'bg-green-500/20 text-green-400 border border-green-500/30',
  POST: 'bg-brand-500/20 text-brand-400 border border-brand-500/30',
  PUT: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  DELETE: 'bg-red-500/20 text-red-400 border border-red-500/30',
};

const ENDPOINTS = {
  Authentication: [
    {
      method: 'POST', url: '/api/v1/auth/register', description: 'Register a new user account.',
      params: [
        { name: 'email', type: 'string', required: true, desc: 'User email address' },
        { name: 'password', type: 'string', required: true, desc: 'Minimum 12 characters' },
        { name: 'displayName', type: 'string', required: false, desc: 'User display name' },
      ],
      response: `{ "user": { "uid": "...", "email": "...", "tier": "starter" }, "token": "eyJ..." }`,
      examples: {
        curl: `curl -X POST https://YOUR_API_BASE_URL/api/v1/auth/register \\
  -H "Content-Type: application/json" \\
  -d '{"email":"user@example.com","password":"securepassword"}'`,
        js: `const res = await fetch('https://YOUR_API_BASE_URL/api/v1/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com', password: 'securepassword' })
});
const data = await res.json();`,
        python: `import requests
response = requests.post('https://YOUR_API_BASE_URL/api/v1/auth/register',
  json={'email': 'user@example.com', 'password': 'securepassword'})
data = response.json()`,
      },
    },
    {
      method: 'POST', url: '/api/v1/auth/login', description: 'Authenticate with email and password. Returns a JWT token.',
      params: [
        { name: 'email', type: 'string', required: true, desc: 'User email address' },
        { name: 'password', type: 'string', required: true, desc: 'User password' },
      ],
      response: `{ "user": { "uid": "...", "email": "...", "tier": "professional" }, "token": "eyJ..." }`,
      examples: {
        curl: `curl -X POST https://YOUR_API_BASE_URL/api/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"user@example.com","password":"yourpassword"}'`,
        js: `const res = await fetch('https://YOUR_API_BASE_URL/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com', password: 'yourpassword' })
});
const { token } = await res.json();`,
        python: `import requests
response = requests.post('https://YOUR_API_BASE_URL/api/v1/auth/login',
  json={'email': 'user@example.com', 'password': 'yourpassword'})
token = response.json()['token']`,
      },
    },
  ],
  Reports: [
    {
      method: 'POST', url: '/api/v1/reports/generate', description: 'Generate an automated insurance claim report. Accepts multipart/form-data with photos.',
      params: [
        { name: 'claimNumber', type: 'string', required: true, desc: 'Unique claim identifier' },
        { name: 'insuredName', type: 'string', required: true, desc: 'Name of the insured party' },
        { name: 'propertyAddress', type: 'string', required: true, desc: 'Address of the damaged property' },
        { name: 'lossDate', type: 'string', required: true, desc: 'Date of loss (ISO 8601)' },
        { name: 'lossType', type: 'string', required: true, desc: 'Water Damage | Fire | Wind | Hail | Mold | Vandalism | Other' },
        { name: 'reportType', type: 'string', required: true, desc: 'Initial | Supplemental | Final | Re-Inspection' },
        { name: 'photos', type: 'file[]', required: false, desc: 'Up to 100 damage photos (JPEG/PNG)' },
        { name: 'notes', type: 'string', required: false, desc: 'Additional adjuster notes' },
      ],
      response: `{ "report": { "_id": "...", "claimNumber": "CLM-001", "content": "...", "qualityScore": 92, "aiModel": "FlacronAI", "status": "completed" } }`,
      examples: {
        curl: `curl -X POST https://YOUR_API_BASE_URL/api/v1/reports/generate \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -F "claimNumber=CLM-2024-001" \\
  -F "insuredName=John Smith" \\
  -F "propertyAddress=123 Main St, City, ST 12345" \\
  -F "lossDate=2024-01-15" \\
  -F "lossType=Water Damage" \\
  -F "reportType=Initial" \\
  -F "photos=@damage1.jpg" \\
  -F "photos=@damage2.jpg"`,
        js: `const formData = new FormData();
formData.append('claimNumber', 'CLM-2024-001');
formData.append('insuredName', 'John Smith');
formData.append('lossType', 'Water Damage');
formData.append('reportType', 'Initial');
photos.forEach(p => formData.append('photos', p));

const res = await fetch('https://YOUR_API_BASE_URL/api/v1/reports/generate', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' },
  body: formData
});`,
        python: `import requests
files = [('photos', open('damage1.jpg', 'rb')), ('photos', open('damage2.jpg', 'rb'))]
data = {'claimNumber': 'CLM-2024-001', 'lossType': 'Water Damage', 'reportType': 'Initial'}
response = requests.post('https://YOUR_API_BASE_URL/api/v1/reports/generate',
  headers={'Authorization': 'Bearer YOUR_TOKEN'}, data=data, files=files)`,
      },
    },
    {
      method: 'GET', url: '/api/v1/reports', description: 'List all reports for the authenticated user. Supports pagination and filtering.',
      params: [
        { name: 'page', type: 'number', required: false, desc: 'Page number (default: 1)' },
        { name: 'limit', type: 'number', required: false, desc: 'Results per page (default: 10, max: 100)' },
        { name: 'status', type: 'string', required: false, desc: 'Filter by status: completed | processing | failed' },
        { name: 'search', type: 'string', required: false, desc: 'Search by claim number or insured name' },
      ],
      response: `{ "reports": [...], "total": 42, "page": 1, "totalPages": 5 }`,
      examples: {
        curl: `curl https://YOUR_API_BASE_URL/api/v1/reports?page=1&limit=10 \\
  -H "Authorization: Bearer YOUR_TOKEN"`,
        js: `const res = await fetch('https://YOUR_API_BASE_URL/api/v1/reports?page=1&status=completed', {
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
});
const { reports, total } = await res.json();`,
        python: `response = requests.get('https://YOUR_API_BASE_URL/api/v1/reports',
  params={'page': 1, 'status': 'completed'},
  headers={'Authorization': 'Bearer YOUR_TOKEN'})`,
      },
    },
    {
      method: 'GET', url: '/api/v1/reports/:id', description: 'Get a single report by ID.',
      params: [
        { name: 'id', type: 'string', required: true, desc: 'Report ID (path parameter)' },
      ],
      response: `{ "report": { "_id": "...", "claimNumber": "...", "content": "...", "createdAt": "..." } }`,
      examples: {
        curl: `curl https://YOUR_API_BASE_URL/api/v1/reports/64f8abc123def456 \\
  -H "Authorization: Bearer YOUR_TOKEN"`,
        js: `const res = await fetch('https://YOUR_API_BASE_URL/api/v1/reports/REPORT_ID', {
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
});`,
        python: `response = requests.get('https://YOUR_API_BASE_URL/api/v1/reports/REPORT_ID',
  headers={'Authorization': 'Bearer YOUR_TOKEN'})`,
      },
    },
    {
      method: 'POST', url: '/api/v1/reports/:id/export', description: 'Export a report in PDF, DOCX, or HTML format.',
      params: [
        { name: 'id', type: 'string', required: true, desc: 'Report ID (path parameter)' },
        { name: 'format', type: 'string', required: true, desc: 'pdf | docx | html' },
      ],
      response: `Binary file stream (application/pdf, etc.)`,
      examples: {
        curl: `curl -X POST https://YOUR_API_BASE_URL/api/v1/reports/REPORT_ID/export \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"format":"pdf"}' --output report.pdf`,
        js: `const res = await fetch(\`https://YOUR_API_BASE_URL/api/v1/reports/\${id}/export\`, {
  method: 'POST',
  headers: { 'Authorization': 'Bearer YOUR_TOKEN', 'Content-Type': 'application/json' },
  body: JSON.stringify({ format: 'pdf' })
});
const blob = await res.blob();`,
        python: `response = requests.post(f'https://YOUR_API_BASE_URL/api/v1/reports/{report_id}/export',
  json={'format': 'pdf'},
  headers={'Authorization': 'Bearer YOUR_TOKEN'})
with open('report.pdf', 'wb') as f:
    f.write(response.content)`,
      },
    },
    {
      method: 'DELETE', url: '/api/v1/reports/:id', description: 'Delete a report. Set permanent=true to permanently delete.',
      params: [
        { name: 'id', type: 'string', required: true, desc: 'Report ID (path parameter)' },
        { name: 'permanent', type: 'boolean', required: false, desc: 'Permanently delete (default: false = soft delete)' },
      ],
      response: `{ "message": "Report deleted successfully" }`,
      examples: {
        curl: `curl -X DELETE "https://YOUR_API_BASE_URL/api/v1/reports/REPORT_ID?permanent=false" \\
  -H "Authorization: Bearer YOUR_TOKEN"`,
        js: `await fetch(\`https://YOUR_API_BASE_URL/api/v1/reports/\${id}\`, {
  method: 'DELETE',
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
});`,
        python: `requests.delete(f'https://YOUR_API_BASE_URL/api/v1/reports/{report_id}',
  headers={'Authorization': 'Bearer YOUR_TOKEN'})`,
      },
    },
  ],
  Users: [
    {
      method: 'GET', url: '/api/v1/users/profile', description: 'Get the authenticated user profile.',
      params: [],
      response: `{ "profile": { "uid": "...", "email": "...", "tier": "agency", "displayName": "...", "usage": {...} } }`,
      examples: {
        curl: `curl https://YOUR_API_BASE_URL/api/v1/users/profile \\
  -H "Authorization: Bearer YOUR_TOKEN"`,
        js: `const res = await fetch('https://YOUR_API_BASE_URL/api/v1/users/profile', {
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
});`,
        python: `response = requests.get('https://YOUR_API_BASE_URL/api/v1/users/profile',
  headers={'Authorization': 'Bearer YOUR_TOKEN'})`,
      },
    },
    {
      method: 'POST', url: '/api/v1/users/api-keys', description: 'Create a new API key for programmatic access.',
      params: [
        { name: 'name', type: 'string', required: true, desc: 'Descriptive name for the key' },
      ],
      response: `{ "key": "flac_live_xxxxxxxxxxxx", "keyId": "...", "name": "Production App", "createdAt": "..." }`,
      examples: {
        curl: `curl -X POST https://YOUR_API_BASE_URL/api/v1/users/api-keys \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Production App"}'`,
        js: `const res = await fetch('https://YOUR_API_BASE_URL/api/v1/users/api-keys', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer YOUR_TOKEN', 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Production App' })
});`,
        python: `response = requests.post('https://YOUR_API_BASE_URL/api/v1/users/api-keys',
  json={'name': 'Production App'},
  headers={'Authorization': 'Bearer YOUR_TOKEN'})`,
      },
    },
  ],
  CRM: [
    {
      method: 'GET', url: '/api/v1/crm/clients', description: 'List all CRM clients.',
      params: [
        { name: 'page', type: 'number', required: false, desc: 'Page number' },
        { name: 'search', type: 'string', required: false, desc: 'Search by name/email' },
      ],
      response: `{ "clients": [...], "total": 30, "page": 1 }`,
      examples: {
        curl: `curl https://YOUR_API_BASE_URL/api/v1/crm/clients \\
  -H "Authorization: Bearer YOUR_TOKEN"`,
        js: `const res = await fetch('https://YOUR_API_BASE_URL/api/v1/crm/clients', {
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
});`,
        python: `response = requests.get('https://YOUR_API_BASE_URL/api/v1/crm/clients',
  headers={'Authorization': 'Bearer YOUR_TOKEN'})`,
      },
    },
    {
      method: 'POST', url: '/api/v1/crm/clients', description: 'Create a new CRM client.',
      params: [
        { name: 'name', type: 'string', required: true, desc: 'Client full name' },
        { name: 'email', type: 'string', required: false, desc: 'Client email address' },
        { name: 'phone', type: 'string', required: false, desc: 'Client phone number' },
        { name: 'company', type: 'string', required: false, desc: 'Client company name' },
      ],
      response: `{ "client": { "_id": "...", "name": "Jane Doe", "email": "...", "createdAt": "..." } }`,
      examples: {
        curl: `curl -X POST https://YOUR_API_BASE_URL/api/v1/crm/clients \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Jane Doe","email":"jane@example.com"}'`,
        js: `const res = await fetch('https://YOUR_API_BASE_URL/api/v1/crm/clients', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer YOUR_TOKEN', 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Jane Doe', email: 'jane@example.com' })
});`,
        python: `response = requests.post('https://YOUR_API_BASE_URL/api/v1/crm/clients',
  json={'name': 'Jane Doe', 'email': 'jane@example.com'},
  headers={'Authorization': 'Bearer YOUR_TOKEN'})`,
      },
    },
  ],
  'White-Label': [
    {
      method: 'GET', url: '/api/v1/white-label/config', description: 'Get the current white-label configuration.',
      params: [],
      response: `{ "config": { "companyName": "...", "primaryColor": "#...", "subdomain": "...", ... } }`,
      examples: {
        curl: `curl https://YOUR_API_BASE_URL/api/v1/white-label/config \\
  -H "Authorization: Bearer YOUR_TOKEN"`,
        js: `const res = await fetch('https://YOUR_API_BASE_URL/api/v1/white-label/config', {
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
});`,
        python: `response = requests.get('https://YOUR_API_BASE_URL/api/v1/white-label/config',
  headers={'Authorization': 'Bearer YOUR_TOKEN'})`,
      },
    },
    {
      method: 'PUT', url: '/api/v1/white-label/customize', description: 'Update white-label branding configuration.',
      params: [
        { name: 'companyName', type: 'string', required: false, desc: 'Company display name' },
        { name: 'primaryColor', type: 'string', required: false, desc: 'Hex color code for primary branding' },
        { name: 'subdomain', type: 'string', required: false, desc: 'Subdomain slug (alphanumeric, hyphens)' },
        { name: 'hideFlacronBranding', type: 'boolean', required: false, desc: 'Hide Powered by FlacronAI' },
      ],
      response: `{ "config": { "companyName": "Updated Corp", "primaryColor": "#ff6600", ... } }`,
      examples: {
        curl: `curl -X PUT https://YOUR_API_BASE_URL/api/v1/white-label/customize \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"companyName":"Acme Corp","primaryColor":"#ff6600"}'`,
        js: `await fetch('https://YOUR_API_BASE_URL/api/v1/white-label/customize', {
  method: 'PUT',
  headers: { 'Authorization': 'Bearer YOUR_TOKEN', 'Content-Type': 'application/json' },
  body: JSON.stringify({ companyName: 'Acme Corp', primaryColor: '#ff6600' })
});`,
        python: `requests.put('https://YOUR_API_BASE_URL/api/v1/white-label/customize',
  json={'companyName': 'Acme Corp', 'primaryColor': '#ff6600'},
  headers={'Authorization': 'Bearer YOUR_TOKEN'})`,
      },
    },
  ],
  Payments: [
    {
      method: 'POST', url: '/api/v1/payment/create-checkout-session', description: 'Create a Stripe checkout session to upgrade to a paid plan.',
      params: [
        { name: 'tier', type: 'string', required: true, desc: 'Target plan: professional | agency | enterprise' },
      ],
      response: `{ "url": "https://checkout.stripe.com/...", "sessionId": "cs_..." }`,
      examples: {
        curl: `curl -X POST https://YOUR_API_BASE_URL/api/v1/payment/create-checkout-session \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"tier":"professional"}'`,
        js: `const { url } = await (await fetch('https://YOUR_API_BASE_URL/api/v1/payment/create-checkout-session', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer YOUR_TOKEN', 'Content-Type': 'application/json' },
  body: JSON.stringify({ tier: 'professional' })
})).json();
window.location.href = url;`,
        python: `response = requests.post('https://YOUR_API_BASE_URL/api/v1/payment/create-checkout-session',
  json={'tier': 'professional'},
  headers={'Authorization': 'Bearer YOUR_TOKEN'})
checkout_url = response.json()['url']`,
      },
    },
    {
      method: 'GET', url: '/api/v1/payment/invoices', description: 'Get the billing invoice history.',
      params: [],
      response: `{ "invoices": [{ "id": "...", "amount": 3999, "status": "paid", "date": "...", "pdfUrl": "..." }] }`,
      examples: {
        curl: `curl https://YOUR_API_BASE_URL/api/v1/payment/invoices \\
  -H "Authorization: Bearer YOUR_TOKEN"`,
        js: `const { invoices } = await (await fetch('https://YOUR_API_BASE_URL/api/v1/payment/invoices', {
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
})).json();`,
        python: `response = requests.get('https://YOUR_API_BASE_URL/api/v1/payment/invoices',
  headers={'Authorization': 'Bearer YOUR_TOKEN'})`,
      },
    },
  ],
};

const RATE_LIMITS = [
  { tier: 'All API routes', rpm: '100 / 15 min', daily: 'Not defined', notes: 'Global limiter; health check excluded' },
  { tier: 'Reports routes', rpm: '10 / min', daily: 'Not defined', notes: 'Additional limiter on /api/v1/reports' },
];

const ERROR_CODES = [
  { code: 400, name: 'Bad Request', desc: 'Missing or invalid request parameters.' },
  { code: 401, name: 'Unauthorized', desc: 'Invalid or missing authentication token.' },
  { code: 403, name: 'Forbidden', desc: 'Insufficient tier permissions for this operation.' },
  { code: 404, name: 'Not Found', desc: 'The requested resource does not exist.' },
  { code: 429, name: 'Rate Limited', desc: 'Too many requests. Wait and retry with exponential backoff.' },
  { code: 500, name: 'Server Error', desc: 'Internal server error. Contact support if persistent.' },
  { code: 503, name: 'Service Unavailable', desc: 'A provider-dependent operation is temporarily unavailable. Retry only when safe for that request type.' },
];

const WEBHOOK_EVENTS_DOC = [
  { name: 'report.generated', desc: 'A new draft report was created. Fired after POST /api/v1/reports/generate succeeds. The report is in "draft" status and still requires human review.' },
  { name: 'report.finalized', desc: 'A report was reviewed and approved by a licensed adjuster. Fired after POST /api/v1/reports/:id/approve succeeds.' },
];

const WEBHOOK_MGMT = [
  { method: 'GET', url: '/api/v1/webhooks/events', desc: 'List the events you can subscribe to and the delivery policy.' },
  { method: 'POST', url: '/api/v1/webhooks', desc: 'Register an endpoint. Returns the signing secret once — store it immediately.' },
  { method: 'GET', url: '/api/v1/webhooks', desc: 'List your active endpoints (signing secrets are masked).' },
  { method: 'POST', url: '/api/v1/webhooks/:id/rotate-secret', desc: 'Issue a new signing secret for an endpoint.' },
  { method: 'DELETE', url: '/api/v1/webhooks/:id', desc: 'Deactivate an endpoint (stops future deliveries).' },
];

const QUICK_START_STEPS = [  {
    step: '1',
    title: 'Get Your API Key',
    description: 'API keys are available on Agency and Enterprise plans. Create one from your dashboard.',
    details: [
      'Navigate to your account Settings page',
      'Find the "API Keys" section',
      'Click "Create API Key"',
      'Select the scopes your integration needs (reports:read, reports:write, reports:generate, reports:export, crm:read, crm:write)',
      'Give your key a descriptive name (e.g., "Production Server", "Staging Environment")',
      'Copy and securely store the key — it will only be shown once',
    ],
    code: {
      note: 'Store your API key as an environment variable, never in source code:',
      bash: `# In your .env file or environment
export FLACRON_API_KEY="flac_live_xxxxxxxxxxxxxxxxxxxx"`,
    },
    warning: 'API keys grant full access within their scopes. Treat them like passwords: never commit them to version control, share them publicly, or embed them in client-side code.',
  },
  {
    step: '2',
    title: 'Set Your Base URL',
    description: 'All API requests are relative to your backend host. The base URL depends on your deployment environment.',
    details: [
      'For local development: http://localhost:3000',
      'For production: your deployed backend URL (contact your deployment administrator)',
      'Prefix every path with /api/v1 (current API version). The older unversioned /api base still works but is deprecated-later',
      'All endpoints in this documentation show paths relative to this base',
    ],
    code: {
      note: 'Configure the base URL in your application:',
      javascript: `// JavaScript/Node.js
const FLACRON_API_BASE = process.env.FLACRON_API_BASE || 'http://localhost:3000';
const endpoint = \`\${FLACRON_API_BASE}/api/v1/reports\`;`,
      python: `# Python
import os
FLACRON_API_BASE = os.getenv('FLACRON_API_BASE', 'http://localhost:3000')
endpoint = f'{FLACRON_API_BASE}/api/v1/reports'`,
    },
  },
  {
    step: '3',
    title: 'Make Your First Request',
    description: 'Generate a claim report by sending claim details and photos to the /api/v1/reports/generate endpoint.',
    details: [
      'Use multipart/form-data to include photos',
      'Pass your API key in the X-API-Key header',
      'Required fields: claimNumber, insuredName, propertyAddress, lossDate, lossType, reportType',
      'Photos are optional but improve report quality (max 10 images, JPEG/PNG/GIF/WebP)',
    ],
    code: {
      curl: `curl -X POST http://localhost:3000/api/v1/reports/generate \\
  -H "X-API-Key: flac_live_xxxxxxxxxxxxxxxxxxxx" \\
  -F "claimNumber=CLM-2024-001" \\
  -F "insuredName=John Smith" \\
  -F "propertyAddress=123 Main St, Tampa, FL 33601" \\
  -F "lossDate=2024-01-15" \\
  -F "lossType=Water Damage" \\
  -F "reportType=Initial" \\
  -F "additionalNotes=Kitchen and bathroom damage observed" \\
  -F "images=@kitchen_damage.jpg" \\
  -F "images=@bathroom_damage.jpg"`,
      javascript: `// JavaScript with fetch
const formData = new FormData();
formData.append('claimNumber', 'CLM-2024-001');
formData.append('insuredName', 'John Smith');
formData.append('propertyAddress', '123 Main St, Tampa, FL 33601');
formData.append('lossDate', '2024-01-15');
formData.append('lossType', 'Water Damage');
formData.append('reportType', 'Initial');
formData.append('additionalNotes', 'Kitchen and bathroom damage observed');

// Attach photos under the "images" field (max 100 files)
photos.forEach(file => formData.append('images', file));

const response = await fetch(\`\${FLACRON_API_BASE}/api/v1/reports/generate\`, {
  method: 'POST',
  headers: { 'X-API-Key': process.env.FLACRON_API_KEY },
  body: formData
});

const data = await response.json();
console.log('Report ID:', data.report.id);`,
      python: `# Python with requests
import requests

files = [
    ('images', open('kitchen_damage.jpg', 'rb')),
    ('images', open('bathroom_damage.jpg', 'rb'))
]

data = {
    'claimNumber': 'CLM-2024-001',
    'insuredName': 'John Smith',
    'propertyAddress': '123 Main St, Tampa, FL 33601',
    'lossDate': '2024-01-15',
    'lossType': 'Water Damage',
    'reportType': 'Initial',
    'additionalNotes': 'Kitchen and bathroom damage observed'
}

response = requests.post(
    f'{FLACRON_API_BASE}/api/v1/reports/generate',
    headers={'X-API-Key': os.getenv('FLACRON_API_KEY')},
    data=data,
    files=files
)

report = response.json()['report']
print(f"Report ID: {report['id']}")`,
    },
  },
  {
    step: '4',
    title: 'Handle the Response',
    description: 'The API returns a structured report object with generated content, metadata, and status.',
    details: [
      'Successful responses return HTTP 200-201 with a JSON body',
      'The report includes _id, claimNumber, content, status, qualityScore, and timestamps',
      'Status will be "draft" (requires review) or "processing" (generation in progress)',
      'Check the qualityScore (0-100) to assess confidence',
    ],
    code: {
      json: `{
  "success": true,
  "report": {
    "id": "64f8abc123def456",
    "claimNumber": "CLM-2024-001",
    "insuredName": "John Smith",
    "propertyAddress": "123 Main St, Tampa, FL 33601",
    "lossType": "Water Damage",
    "reportType": "Initial",
    "status": "draft",
    "qualityScore": 94,
    "modelUsed": "[REDACTED]",
    "content": "INSURANCE CLAIM REPORT\\n\\nClaim Number: CLM-2024-001\\n...",
    "imageCount": 2,
    "imagePaths": ["users/abc123/reports/64f8abc123def456/0.jpg", "users/abc123/reports/64f8abc123def456/1.jpg"],
    "createdAt": "2024-01-16T10:30:00.000Z",
    "updatedAt": "2024-01-16T10:30:00.000Z",
    "userId": "abc123",
    "reviewedBy": null,
    "reviewedAt": null
  }
}`,
    },
    note: 'Reports with status "draft" should be reviewed and approved by a licensed professional before final use. Use POST /api/v1/reports/:id/approve to mark a report as reviewed.',
  },
  {
    step: '5',
    title: 'Handle Errors',
    description: 'The API returns structured error responses with HTTP status codes and error details.',
    details: [
      'All errors include success: false, error message, and a code',
      '400: Validation errors (missing fields, invalid format)',
      '401: Authentication failed (invalid/missing API key)',
      '403: Permission denied (insufficient tier or missing scope)',
      '429: Rate limit exceeded (wait and retry with backoff)',
      '500/503: Server errors (check status page, retry if safe)',
    ],
    code: {
      json: `{
  "success": false,
  "error": "API key requires the reports:generate scope",
  "code": "API_SCOPE_REQUIRED",
  "requiredScope": "reports:generate",
  "grantedScopes": ["reports:read", "reports:export"]
}`,
      javascript: `// Error handling example
try {
  const response = await fetch(endpoint, options);
  const data = await response.json();

  if (!response.ok) {
    if (response.status === 429) {
      // Rate limited - wait and retry
      await new Promise(resolve => setTimeout(resolve, 60000));
      // Retry logic here
    } else if (response.status === 401) {
      throw new Error('Invalid API key');
    } else if (response.status === 403) {
      throw new Error(\`Permission denied: \${data.error}\`);
    } else {
      throw new Error(data.error || 'Request failed');
    }
  }

  return data;
} catch (error) {
  console.error('API Error:', error.message);
  throw error;
}`,
    },
  },
  {
    step: '6',
    title: 'Common Workflows',
    description: 'Typical integration patterns for report generation, export, and retrieval.',
    workflows: [
      {
        name: 'Generate and Export',
        steps: [
          '1. Create report via POST /api/v1/reports/generate',
          '2. Wait for status to be "draft" (or poll if processing)',
          '3. Review report content',
          '4. Approve via POST /api/v1/reports/:id/approve',
          '5. Export via POST /api/v1/reports/:id/export with format (pdf, docx, html)',
        ],
      },
      {
        name: 'List and Retrieve',
        steps: [
          '1. List reports via GET /api/v1/reports with pagination',
          '2. Filter by status, search by claim number',
          '3. Retrieve full report via GET /api/v1/reports/:id',
          '4. Download exports via GET /api/v1/reports/:id/download',
        ],
      },
      {
        name: 'Webhook Integration',
        steps: [
          '1. Register your HTTPS endpoint via POST /api/v1/webhooks with the events you want',
          '2. Store the signing secret returned on registration (shown only once)',
          '3. Verify the Flacron-Signature header on every incoming request',
          '4. Acknowledge receipt with HTTP 2xx quickly (within the delivery timeout)',
          '5. Use the event "id" to make processing idempotent (deliveries may repeat)',
        ],
        note: 'See the Webhooks section for supported events, the signed payload structure, signature verification, and the retry policy.',
      },
    ],
  },
];


function CodeBlock({ code, lang: _lang }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative">
      <pre tabIndex={0} role="region" aria-label="Code example" className="bg-black/50 rounded-xl p-4 overflow-x-auto text-xs font-mono leading-relaxed">
        <code className="text-green-300">{code}</code>
      </pre>
      <button onClick={handleCopy} aria-label={copied ? 'Copied' : 'Copy code'} title="Copy code" className="absolute top-2 right-2 p-1.5 hover:bg-gray-100 rounded-lg text-gray-600 hover:text-gray-900">
        {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function EndpointCard({ endpoint }) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('curl');
  return (
    <div className="card overflow-hidden mb-3">
      <button onClick={() => setOpen(p => !p)} className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-100 transition-colors">
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${METHOD_COLORS[endpoint.method]}`}>{endpoint.method}</span>
        <code className="text-sm font-mono text-brand-300 flex-1">{endpoint.url}</code>
        <span className="text-gray-600 text-sm hidden sm:block">{endpoint.description}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-600 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-600 shrink-0" />}
      </button>
      {open && (
        <div className="border-t border-[#e5e7eb] p-4 space-y-4">
          <p className="text-gray-700 text-sm">{endpoint.description}</p>
          {endpoint.params.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-600 uppercase mb-2">Parameters</h4>
              <p className="text-xs text-gray-500 mb-1.5 sm:hidden">Swipe to see full description →</p>
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Endpoint parameters table">
                <table className="w-full min-w-[420px] text-sm">
                  <thead><tr className="border-b border-gray-200">
                    <th className="text-left py-1.5 px-2 text-xs text-gray-500">Name</th>
                    <th className="text-left py-1.5 px-2 text-xs text-gray-500">Type</th>
                    <th className="text-left py-1.5 px-2 text-xs text-gray-500">Required</th>
                    <th className="text-left py-1.5 px-2 text-xs text-gray-500">Description</th>
                  </tr></thead>
                  <tbody>{endpoint.params.map((p, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-1.5 px-2 font-mono text-brand-300 text-xs">{p.name}</td>
                      <td className="py-1.5 px-2 text-amber-400 text-xs">{p.type}</td>
                      <td className="py-1.5 px-2">{p.required ? <span className="text-xs text-red-400">required</span> : <span className="text-xs text-gray-500">optional</span>}</td>
                      <td className="py-1.5 px-2 text-gray-600 text-xs">{p.desc}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
          <div>
            <h4 className="text-xs font-semibold text-gray-600 uppercase mb-2">Response Schema</h4>
            <pre className="bg-black/50 rounded-xl p-3 text-xs font-mono text-green-300 overflow-x-auto">{endpoint.response}</pre>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-gray-600 uppercase mb-2">Code Examples</h4>
            <div className="flex gap-1 mb-2">
              {['curl', 'js', 'python'].map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeTab === t ? 'bg-brand-500 text-gray-900' : 'bg-gray-100 text-gray-600 hover:text-gray-900'}`}>
                  {t === 'js' ? 'JavaScript' : t === 'curl' ? 'cURL' : 'Python'}
                </button>
              ))}
            </div>
            <CodeBlock code={endpoint.examples[activeTab]} lang={activeTab} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ApiDocs() {
  const [activeSection, setActiveSection] = useState('Base URL');
  const categories = Object.keys(ENDPOINTS);

  return (
    <div className="min-h-screen bg-[#ffffff]">
      <Seo title="API Documentation — FlacronAI" description="Full FlacronAI REST API reference: authentication, report generation, exports, rate limits, and code examples in cURL, JavaScript, and Python." path="/docs/api" />
      <Navbar />
      <div className="pt-24 pb-20 px-4 max-w-7xl mx-auto">
        <motion.div className="text-center mb-12" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold text-gray-900 mb-3">API Reference</h1>
          <p className="text-gray-600 max-w-xl mx-auto">Complete documentation for the FlacronAI REST API. Integrate automated claim reports into your applications.</p>
        </motion.div>

        <div className="flex gap-6">
          {/* Sticky Sidebar */}
          <aside className="w-48 shrink-0 hidden lg:block">
            <nav className="sticky top-24 space-y-1">
              <button onClick={() => setActiveSection('Quick Start')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  activeSection === 'Quick Start' ? 'bg-brand-500/20 text-brand-400' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}>
                Quick Start Guide
              </button>
              <div className="border-t border-[#e5e7eb] my-3" />
              <p className="text-xs font-semibold text-gray-500 uppercase px-3 mb-3">Endpoints</p>
              {categories.map(cat => (
                <button key={cat} onClick={() => setActiveSection(cat)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeSection === cat ? 'bg-brand-500/20 text-brand-400' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}>
                  {cat}
                </button>
              ))}
              <div className="border-t border-[#e5e7eb] my-3" />
              {['Base URL', 'Auth Guide', 'Webhooks', 'Downloads', 'Reliability', 'Rate Limits', 'Errors'].map(s => (
                <button key={s} onClick={() => setActiveSection(s)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    activeSection === s ? 'bg-brand-500/20 text-brand-400' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}>
                  {s}
                </button>
              ))}
            </nav>
          </aside>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {/* Mobile/tablet section nav (sidebar above is desktop-only) */}
            <div className="lg:hidden mb-6">
              <label htmlFor="api-docs-section" className="block text-xs font-semibold text-gray-500 uppercase mb-2">
                Jump to section
              </label>
              <select
                id="api-docs-section"
                value={activeSection}
                onChange={(e) => setActiveSection(e.target.value)}
                className="w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2.5 text-sm font-medium text-gray-900"
              >
                <option value="Quick Start">Quick Start Guide</option>
                <optgroup label="Endpoints">
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </optgroup>
                <optgroup label="Guides">
                  {['Base URL', 'Auth Guide', 'Webhooks', 'Downloads', 'Reliability', 'Rate Limits', 'Errors'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Quick Start Guide */}
            {activeSection === 'Quick Start' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Quick Start Guide</h2>
                <p className="text-gray-600 text-sm mb-6">
                  Get from zero to your first generated report in six steps. This guide uses the API-key authentication recommended for all server-to-server integrations.
                </p>
                <div className="space-y-6">
                  {QUICK_START_STEPS.map((s) => (
                    <div key={s.step} className="card p-5">
                      <div className="flex items-start gap-4">
                        <span className="shrink-0 w-8 h-8 rounded-full bg-brand-500 text-white font-bold flex items-center justify-center text-sm">{s.step}</span>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-semibold text-gray-900 mb-1">{s.title}</h3>
                          <p className="text-gray-600 text-sm mb-3">{s.description}</p>

                          {s.details && (
                            <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600 mb-4">
                              {s.details.map((d, i) => <li key={i}>{d}</li>)}
                            </ul>
                          )}

                          {s.workflows && (
                            <div className="space-y-4">
                              {s.workflows.map((w, i) => (
                                <div key={i} className="rounded-lg border border-[#e5e7eb] p-4">
                                  <h4 className="font-semibold text-gray-900 text-sm mb-2">{w.name}</h4>
                                  <ul className="space-y-1 text-sm text-gray-600">
                                    {w.steps.map((step, j) => <li key={j}>{step}</li>)}
                                  </ul>
                                  {w.note && <p className="mt-2 text-xs text-gray-500 italic">{w.note}</p>}
                                </div>
                              ))}
                            </div>
                          )}

                          {s.code && (
                            <div className="space-y-3">
                              {s.code.note && <p className="text-sm text-gray-600">{s.code.note}</p>}
                              {s.code.bash && <CodeBlock code={s.code.bash} lang="bash" />}
                              {s.code.curl && (
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">cURL</p>
                                  <CodeBlock code={s.code.curl} lang="bash" />
                                </div>
                              )}
                              {s.code.javascript && (
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">JavaScript</p>
                                  <CodeBlock code={s.code.javascript} lang="javascript" />
                                </div>
                              )}
                              {s.code.python && (
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Python</p>
                                  <CodeBlock code={s.code.python} lang="python" />
                                </div>
                              )}
                              {s.code.json && (
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Response</p>
                                  <CodeBlock code={s.code.json} lang="json" />
                                </div>
                              )}
                            </div>
                          )}

                          {s.warning && (
                            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                              <p className="text-sm text-amber-800"><strong>Security:</strong> {s.warning}</p>
                            </div>
                          )}
                          {s.note && (
                            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
                              <p className="text-sm text-blue-800">{s.note}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 card p-5 border-brand-200 bg-brand-50/40">
                  <h3 className="font-semibold text-gray-900 mb-2">Next Steps</h3>
                  <p className="text-sm text-gray-700">
                    Browse the full endpoint reference in the sidebar, review the <button onClick={() => setActiveSection('Auth Guide')} className="text-brand-600 underline underline-offset-2">Authentication Guide</button> for scope details, or check <button onClick={() => setActiveSection('Rate Limits')} className="text-brand-600 underline underline-offset-2">Rate Limits</button> before going to production.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Base URL */}
            {activeSection === 'Base URL' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Base URL</h2>
                <div className="card p-5 mb-4">
                  <p className="text-gray-600 text-sm mb-3">
                    All endpoints below are shown relative to your API base URL. Replace <code className="text-brand-700 font-mono text-xs bg-brand-50 px-1.5 py-0.5 rounded">YOUR_API_BASE_URL</code> in every example with your own deployment's backend host — it is not a fixed public hostname you can copy as-is.
                  </p>
                  <p className="text-gray-600 text-sm mb-3">
                    The current API version is <code className="text-brand-700 font-mono text-xs bg-brand-50 px-1.5 py-0.5 rounded">v1</code>. Prefix every path with <code className="text-brand-700 font-mono text-xs bg-brand-50 px-1.5 py-0.5 rounded">/api/v1</code>. For local development, this is:
                  </p>
                </div>
                <CodeBlock code={`http://localhost:3000/api/v1`} lang="text" />
                <p className="text-gray-500 text-xs mt-4">In production, use your deployed backend's own host (see your environment configuration / the person who manages your deployment for the exact address).</p>
                <div className="card p-5 mt-4 border-brand-200 bg-brand-50/40">
                  <p className="text-gray-700 text-sm">
                    <strong>Legacy unversioned paths.</strong> Requests to the older un-prefixed <code className="font-mono text-xs">/api/...</code> base are still served and behave identically to <code className="font-mono text-xs">/api/v1/...</code>, so existing integrations keep working with no change. New integrations should use <code className="font-mono text-xs">/api/v1</code>; the unversioned base is retained only for backward compatibility and may be deprecated in a future release.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Auth Guide */}
            {activeSection === 'Auth Guide' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Authentication Guide</h2>
                <div className="card p-5 mb-4 border-brand-200 bg-brand-50/40">
                  <p className="text-gray-700 text-sm">
                    <strong>For third-party integrations and server-to-server access, use an API key</strong> — it can be revoked and rotated independently of any person's login. Every key has immutable, least-privilege scopes selected at creation. The email/password login below issues a session token for signing into the FlacronAI web app itself; it is not intended as an integration credential and should not be embedded in another application or server.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="card p-5">
                    <h3 className="text-base font-semibold text-gray-900 mb-3">API Key (recommended for integrations — Agency/Enterprise)</h3>
                    <p className="text-gray-600 text-sm mb-3">Create an API key in Settings. Pass it via the X-API-Key header for server-to-server requests.</p>
                    <CodeBlock code={`X-API-Key: flac_live_xxxxxxxxxxxxxxxxxxxx`} lang="text" />
                    <p className="text-gray-600 text-sm mt-3">Available scopes: <code className="font-mono text-xs">reports:read</code>, <code className="font-mono text-xs">reports:write</code>, <code className="font-mono text-xs">reports:generate</code>, <code className="font-mono text-xs">reports:export</code>, <code className="font-mono text-xs">crm:read</code>, and <code className="font-mono text-xs">crm:write</code>. A missing permission returns <code className="font-mono text-xs">403 API_SCOPE_REQUIRED</code>.</p>
                  </div>
                  <div className="card p-5">
                    <h3 className="text-base font-semibold text-gray-900 mb-3">Bearer Token (JWT) — web app sessions only</h3>
                    <p className="text-gray-600 text-sm mb-3">Returned by <code className="text-brand-700 font-mono text-xs bg-brand-50 px-1.5 py-0.5 rounded">/api/v1/auth/login</code> for the FlacronAI web app's own sign-in flow. It represents a specific person's session, expires, and is invalidated on logout or password change — don't use it as a long-lived integration credential.</p>
                    <CodeBlock code={`Authorization: Bearer eyJhbGciOiJSUzI1NiJ9...`} lang="text" />
                  </div>
                </div>
              </motion.div>
            )}

            {activeSection === 'Webhooks' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Webhooks</h2>
                <p className="text-gray-600 text-sm mb-6 leading-relaxed">
                  FlacronAI can notify your application when events occur — such as when a report is generated or finalized — by posting a signed payload to your HTTPS endpoint. Use webhooks to keep your own system in sync without polling.
                </p>

                <div className="space-y-6">
                  {/* Supported Events */}
                  <div className="card p-5">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Supported Events</h3>
                    <div className="space-y-2">
                      {WEBHOOK_EVENTS_DOC.map((e) => (
                        <div key={e.name} className="border-b border-[#e5e7eb] last:border-0 pb-2 last:pb-0">
                          <code className="font-mono text-sm text-brand-600 font-semibold">{e.name}</code>
                          <p className="text-sm text-gray-600 mt-1">{e.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Management Endpoints */}
                  <div className="card p-5">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Webhook Management</h3>
                    <p className="text-sm text-gray-600 mb-3">
                      Manage your webhook endpoints via the API (requires Agency or Enterprise tier for API access):
                    </p>
                    <div className="space-y-2">
                      {WEBHOOK_MGMT.map((ep, i) => (
                        <div key={i} className="flex items-start gap-3 text-sm">
                          <span className={`shrink-0 px-2 py-0.5 rounded font-mono text-xs font-semibold ${METHOD_COLORS[ep.method]}`}>
                            {ep.method}
                          </span>
                          <div className="min-w-0 flex-1">
                            <code className="font-mono text-sm text-gray-700">{ep.url}</code>
                            <p className="text-gray-600 mt-0.5">{ep.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payload Structure */}
                  <div className="card p-5">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Payload Structure</h3>
                    <p className="text-sm text-gray-600 mb-3">
                      Every webhook delivery is a POST request with these headers and a JSON body:
                    </p>
                    <CodeBlock code={`# Headers
Content-Type: application/json
Flacron-Signature: t=1735689600,v1=<hex HMAC-SHA256>
Flacron-Event: report.finalized
Flacron-Delivery: evt_abc123...
Flacron-Attempt: 1

# Body
{
  "id": "evt_abc123...",
  "type": "report.finalized",
  "createdAt": "2026-08-06T12:34:56.789Z",
  "data": {
    "reportId": "report-uuid",
    "status": "finalized",
    "claimNumber": "CLM-2024-001",
    "reviewedBy": "adjuster@example.com",
    "reviewedAt": "2026-08-06T12:34:56.789Z"
  }
}`} lang="json" />
                  </div>

                  {/* Signature Verification */}
                  <div className="card p-5">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Signature Verification</h3>
                    <p className="text-sm text-gray-600 mb-3">
                      Every webhook includes a <code className="font-mono text-xs">Flacron-Signature</code> header signed with HMAC-SHA256 using your endpoint's secret. <strong>Always verify it</strong> before processing the payload to prevent forged requests.
                    </p>
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 mb-2">Verification Steps:</p>
                        <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                          <li>Extract <code className="font-mono text-xs">t</code> (timestamp, Unix seconds) and <code className="font-mono text-xs">v1</code> (signature) from the header</li>
                          <li>Compute HMAC-SHA256 of <code className="font-mono text-xs">t + "." + raw_body</code> using your signing secret</li>
                          <li>Compare the computed signature to <code className="font-mono text-xs">v1</code> using constant-time comparison</li>
                          <li>Reject if the timestamp is more than 5 minutes old (replay protection)</li>
                        </ol>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 mb-2">Node.js Example:</p>
                        <CodeBlock code={`const crypto = require('crypto');

function verifyWebhook(secret, header, rawBody) {
  const parts = Object.fromEntries(
    header.split(',').map(kv => {
      const idx = kv.indexOf('=');
      return [kv.slice(0, idx).trim(), kv.slice(idx + 1).trim()];
    })
  );
  const t = Number(parts.t);
  const providedSig = parts.v1;

  // Reject stale requests (older than 5 minutes)
  if (Math.abs(Date.now() / 1000 - t) > 300) return false;

  // Compute expected signature
  const expected = crypto
    .createHmac('sha256', secret)
    .update(\`\${t}.\${rawBody}\`)
    .digest('hex');

  // Constant-time comparison
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(providedSig, 'utf8')
  );
}

// Express.js handler
app.post('/webhooks/flacronai', express.raw({type: 'application/json'}), (req, res) => {
  const sig = req.headers['flacron-signature'];
  const rawBody = req.body.toString('utf8');

  if (!verifyWebhook(process.env.FLACRON_WEBHOOK_SECRET, sig, rawBody)) {
    return res.status(401).send('Invalid signature');
  }

  const event = JSON.parse(rawBody);
  // Process event.type and event.data...

  res.json({ received: true });
});`} lang="javascript" />
                      </div>
                    </div>
                  </div>

                  {/* Delivery Policy */}
                  <div className="card p-5">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Delivery & Retry Policy</h3>
                    <div className="space-y-3 text-sm text-gray-600">
                      <p><strong>Timeout:</strong> Each delivery attempt has an 8-second timeout. Respond with HTTP 2xx quickly to acknowledge receipt, then process the event asynchronously.</p>
                      <p><strong>Retries:</strong> If your endpoint returns non-2xx or times out, FlacronAI retries up to 3 times with exponential backoff (delays: 5s, 30s, 120s). After 4 failed attempts, delivery stops.</p>
                      <p><strong>Idempotency:</strong> Use <code className="font-mono text-xs">event.id</code> to make processing idempotent — the same event may be delivered more than once (e.g., after a network hiccup or during a retry).</p>
                      <p><strong>Best-effort only:</strong> Retries are in-process and best-effort. A server restart during the backoff window drops pending retries. This is not a durable queue. Design your receiver to tolerate missed events (e.g., poll the reports list periodically as a fallback).</p>
                    </div>
                  </div>

                  {/* Security Notes */}
                  <div className="card border-amber-200 bg-amber-50/50 p-5">
                    <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                      <span className="text-amber-600">⚠️</span> Security Requirements
                    </h3>
                    <ul className="space-y-2 text-sm text-gray-700">
                      <li><strong>HTTPS only:</strong> Webhook URLs must use <code className="font-mono text-xs">https://</code>. HTTP and internal/private IPs are rejected.</li>
                      <li><strong>Verify every request:</strong> Always check the <code className="font-mono text-xs">Flacron-Signature</code> header. Never trust the payload without verification.</li>
                      <li><strong>Store the secret securely:</strong> The signing secret is shown only once when you register or rotate it. Store it in an environment variable or secret manager, never in code.</li>
                      <li><strong>Rotate on compromise:</strong> If your secret is exposed, immediately call <code className="font-mono text-xs">POST /api/v1/webhooks/:id/rotate-secret</code> to issue a new one.</li>
                    </ul>
                  </div>
                </div>
              </motion.div>
            )}

            {activeSection === 'Downloads' && (              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">API files and changelog</h2>
                <div className="grid gap-4 sm:grid-cols-3">
                  {[
                    ['/openapi.json', 'OpenAPI 3.0', 'Machine-readable API definition for generators and validators.'],
                    ['/flacronai.postman_collection.json', 'Postman collection', 'Importable requests with base URL, API-key, and report-ID variables.'],
                    ['/api-changelog.md', 'API changelog', 'Dated behavior and compatibility notes.'],
                  ].map(([href, title, description]) => (
                    <a key={href} href={href} download className="card block p-5 transition-colors hover:border-brand-300">
                      <h3 className="font-semibold text-gray-900">{title}</h3><p className="mt-2 text-sm text-gray-600">{description}</p><span className="mt-4 inline-block text-sm font-semibold text-brand-600">Download</span>
                    </a>
                  ))}
                </div>
              </motion.div>
            )}

            {activeSection === 'Reliability' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Retries, idempotency, and test environments</h2>
                <div className="space-y-4">
                  <div className="card border-amber-200 bg-amber-50/50 p-5"><h3 className="font-semibold text-gray-900">Idempotency keys are not currently supported</h3><p className="mt-2 text-sm leading-6 text-gray-700">The API does not process an <code className="font-mono text-xs">Idempotency-Key</code> header. Do not automatically retry report generation, client creation, checkout creation, approval, deletion, or other mutating requests after an ambiguous timeout. First query the relevant list/detail endpoint and reconcile whether the operation succeeded. GET requests may be retried with bounded exponential backoff for transient 429/5xx responses.</p></div>
                  <div className="card border-amber-200 bg-amber-50/50 p-5">
                    <h3 className="font-semibold text-gray-900">No public sandbox is available</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-700">
                      FlacronAI does not currently host a shared sandbox, and there is no separate test-key type — every API key (<code className="font-mono text-xs">flac_live_…</code>) is a live credential. Requests are sent to the backend host in your base URL and can change real tenant data, consume your monthly report entitlement, and create real provider-side activity such as report generation, storage writes, and webhook deliveries.
                    </p>
                    <p className="mt-3 text-sm leading-6 text-gray-700">
                      To test an integration safely, run your own non-production deployment of the backend with its own isolated credentials:
                    </p>
                    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-gray-700">
                      <li>A separate Firebase project (Auth + Firestore) so test records never mix with production data.</li>
                      <li>A separate storage bucket for uploaded photos and exports.</li>
                      <li>Separate report-generation provider credentials (or a lower-cost tier) so test generations don't affect production spend.</li>
                      <li>Stripe <strong>test-mode</strong> keys and price IDs for any billing or checkout calls.</li>
                      <li>A dedicated test account whose tier and monthly entitlement you can reset freely.</li>
                    </ul>
                    <p className="mt-3 text-sm leading-6 text-gray-700">
                      Point your integration's base URL at that deployment while testing, then switch back to production. A hosted sandbox with shared test credentials and preloaded fixtures is not offered at this time.
                    </p>
                  </div>
                  <div className="card p-5"><h3 className="font-semibold text-gray-900">Safe retry baseline</h3><ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-gray-600"><li>Honor HTTP 429 and rate-limit headers.</li><li>Use exponential backoff with jitter for retryable GET failures.</li><li>Do not retry validation, authentication, permission, or entitlement errors.</li><li>Log the response code and stable error <code className="font-mono text-xs">code</code> value without logging credentials or claim content.</li></ul></div>
                </div>
              </motion.div>
            )}

            {/* Rate Limits */}
            {activeSection === 'Rate Limits' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Rate Limits</h2>
                <p className="text-gray-600 text-sm mb-6">Rate limits are enforced per API key or per user token. When exceeded, a 429 status is returned.</p>
                <div className="card overflow-hidden">
                  <table className="w-full">
                    <thead><tr className="border-b border-[#e5e7eb]">
                      {['Scope', 'Request window', 'Daily limit', 'Notes'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>{RATE_LIMITS.map((r, i) => (
                      <tr key={i} className="border-b border-[#e5e7eb]">
                        <td className="px-4 py-3 text-gray-900 text-sm font-medium">{r.tier}</td>
                        <td className="px-4 py-3 text-brand-400 text-sm font-mono">{r.rpm}</td>
                        <td className="px-4 py-3 text-brand-400 text-sm font-mono">{r.daily}</td>
                        <td className="px-4 py-3 text-gray-600 text-sm">{r.notes}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* Errors */}
            {activeSection === 'Errors' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Error Codes</h2>
                <div className="space-y-3">
                  {ERROR_CODES.map((e, i) => (
                    <div key={i} className="card p-4 flex items-start gap-4">
                      <span className={`text-sm font-bold font-mono px-3 py-1 rounded-lg shrink-0 ${
                        e.code >= 500 ? 'bg-red-500/20 text-red-400' : e.code === 429 ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-500/20 text-gray-600'}`}>{e.code}</span>
                      <div>
                        <p className="text-gray-900 text-sm font-semibold">{e.name}</p>
                        <p className="text-gray-600 text-sm mt-0.5">{e.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Endpoint Sections */}
            {categories.includes(activeSection) && (
              <motion.div key={activeSection} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">{activeSection}</h2>
                {activeSection === 'Authentication' && (
                  <p className="text-gray-600 text-sm mb-4 -mt-2">
                    These endpoints issue a per-person web-app session and aren't meant to be called from a third-party integration. If you're building an integration, see <button onClick={() => setActiveSection('Auth Guide')} className="text-brand-600 underline underline-offset-2">API keys in the Auth Guide</button> instead.
                  </p>
                )}
                {ENDPOINTS[activeSection].map((ep, i) => <EndpointCard key={i} endpoint={ep} />)}
              </motion.div>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
