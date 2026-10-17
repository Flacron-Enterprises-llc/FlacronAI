// Adds frontend hostnames to Firebase Auth "Authorized domains" (needed for
// Google sign-in popup/redirect on the Azure / IBM frontends). Uses the
// backend's Firebase service account from AWS Secrets Manager; prints no secrets.
// Usage: node firebase-authorized-domains.js [--check] host1 host2 ...
// Needs google-auth-library: run with NODE_PATH=<backend>/node_modules.
const { GoogleAuth } = require('google-auth-library');
const { load } = require('./aws-source');

const check = process.argv.includes('--check');
const hosts = process.argv.slice(2).filter((a) => !a.startsWith('--'));

(async () => {
  const { plain, sensitive } = load();
  const auth = new GoogleAuth({
    credentials: { client_email: plain.FIREBASE_CLIENT_EMAIL, private_key: sensitive.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') },
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${plain.FIREBASE_PROJECT_ID}/config`;
  const cur = (await client.request({ url })).data.authorizedDomains || [];
  console.log('current authorized domains:', cur.join(', '));
  const merged = [...new Set([...cur, ...hosts])];
  const added = merged.filter((h) => !cur.includes(h));
  if (check || added.length === 0) { console.log(added.length ? `would add: ${added.join(', ')}` : 'nothing to add'); return; }
  await client.request({ url: `${url}?updateMask=authorizedDomains`, method: 'PATCH', data: { authorizedDomains: merged } });
  console.log('added:', added.join(', '));
})().catch((e) => { console.error('failed:', e.response?.status, e.response?.data?.error?.message || e.message); process.exit(1); });
