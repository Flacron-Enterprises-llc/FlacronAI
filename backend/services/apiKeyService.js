const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getFirestore } = require('../config/firebase');
const { normalizeApiKeyScopes } = require('../config/apiScopes');

const generateApiKey = async (userId, keyName, scopes) => {
  const rawKey = 'flac_live_' + crypto.randomBytes(16).toString('hex');
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyId = uuidv4();

  const db = getFirestore();
  await db.collection('apiKeys').doc(keyId).set({
    keyId,
    userId,
    name: keyName || 'Default Key',
    keyHash,
    active: true,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    usageCount: 0,
    scopes: normalizeApiKeyScopes(scopes),
  });

  return { key: rawKey, keyId, name: keyName, scopes: normalizeApiKeyScopes(scopes) };
};

const validateApiKey = async (rawKey) => {
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const db = getFirestore();
  const snapshot = await db.collection('apiKeys')
    .where('keyHash', '==', keyHash)
    .where('active', '==', true)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const keyData = snapshot.docs[0].data();
  const userDoc = await db.collection('users').doc(keyData.userId).get();
  return userDoc.exists ? { ...userDoc.data(), uid: keyData.userId } : null;
};

const revokeKey = async (keyId, userId) => {
  const db = getFirestore();
  const keyRef = db.collection('apiKeys').doc(keyId);
  const keyDoc = await keyRef.get();

  if (!keyDoc.exists) throw new Error('API key not found');
  if (keyDoc.data().userId !== userId) throw new Error('Unauthorized');

  await keyRef.update({ active: false, revokedAt: new Date().toISOString() });
};

const getUserKeys = async (userId) => {
  const db = getFirestore();
  const snapshot = await db.collection('apiKeys')
    .where('userId', '==', userId)
    .where('active', '==', true)
    .get();

  const sortedDocs = snapshot.docs.sort((a, b) =>
    new Date(b.data().createdAt) - new Date(a.data().createdAt)
  );

  return Promise.all(sortedDocs.map(async doc => {
    const data = doc.data();
    const usageAggregate = await db.collection('apiUsage')
      .where('keyId', '==', doc.id)
      .count()
      .get();

    return {
      id: doc.id,
      name: data.name,
      createdAt: data.createdAt,
      lastUsedAt: data.lastUsedAt,
      usageCount: usageAggregate.data().count,
      scopes: normalizeApiKeyScopes(data.scopes, { legacy: true }),
    };
  }));
};

const getKeyUsage = async (keyId, userId) => {
  const db = getFirestore();
  const keyDoc = await db.collection('apiKeys').doc(keyId).get();
  if (!keyDoc.exists || keyDoc.data().userId !== userId) throw new Error('Not found');

  // Get usage from last 30 days
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const usageSnap = await db.collection('apiUsage')
    .where('keyId', '==', keyId)
    .where('timestamp', '>=', since.toISOString())
    .get();

  const byDay = {};
  const byEndpoint = {};

  usageSnap.docs.forEach(doc => {
    const d = doc.data();
    const day = d.timestamp.split('T')[0];
    byDay[day] = (byDay[day] || 0) + 1;
    byEndpoint[d.endpoint] = (byEndpoint[d.endpoint] || 0) + 1;
  });

  return {
    total: usageSnap.size,
    byDay,
    byEndpoint,
    key: {
      name: keyDoc.data().name,
      createdAt: keyDoc.data().createdAt,
      lastUsedAt: keyDoc.data().lastUsedAt,
      scopes: normalizeApiKeyScopes(keyDoc.data().scopes, { legacy: true }),
    },
  };
};

module.exports = { generateApiKey, validateApiKey, revokeKey, getUserKeys, getKeyUsage };
