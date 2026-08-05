const { getFirestore } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');

const safeDate = value => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

const buildDashboardAnalytics = ({ clients = [], claims = [], appointments = [], reports = [] }, now = new Date()) => {
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const claimsByStatus = {};
  const claimsByLossType = {};

  claims.forEach(claim => {
    const status = String(claim.status || 'unknown').toLowerCase();
    const lossType = claim.lossType || 'Other';
    claimsByStatus[status] = (claimsByStatus[status] || 0) + 1;
    claimsByLossType[lossType] = (claimsByLossType[lossType] || 0) + 1;
  });

  const finalizedReports = reports.filter(report => ['finalized', 'approved'].includes(String(report.status || '').toLowerCase()));
  const turnaroundHours = finalizedReports.map(report => {
    const created = safeDate(report.createdAt);
    const reviewed = safeDate(report.reviewedAt || report.signature?.confirmedAt);
    return created && reviewed && reviewed >= created ? (reviewed - created) / 3600000 : null;
  }).filter(value => value != null);

  const usageTrend = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-US', { month: 'short' }),
      reports: reports.filter(report => {
        const created = safeDate(report.createdAt);
        return created && created >= date && created < next;
      }).length,
    };
  });

  return {
    totalClients: clients.length,
    totalClaims: claims.length,
    openClaims: claims.filter(claim => ['open', 'in-progress', 'pending-review'].includes(String(claim.status || '').toLowerCase())).length,
    overdueAppointments: appointments.filter(appt => appt.status === 'scheduled' && appt.date && appt.date < today).length,
    reportsAwaitingReview: reports.filter(report => ['draft', 'completed', 'ready-for-review'].includes(String(report.status || '').toLowerCase())).length,
    reportsThisMonth: reports.filter(report => {
      const created = safeDate(report.createdAt);
      return created && created >= startOfMonth && created <= now;
    }).length,
    finalizationRate: reports.length ? Math.round((finalizedReports.length / reports.length) * 100) : 0,
    averageTurnaroundHours: turnaroundHours.length
      ? Math.round((turnaroundHours.reduce((sum, value) => sum + value, 0) / turnaroundHours.length) * 10) / 10
      : null,
    claimsByStatus,
    claimsByLossType,
    usageTrend,
    recentClaims: [...claims]
      .sort((a, b) => (safeDate(b.createdAt)?.getTime() || 0) - (safeDate(a.createdAt)?.getTime() || 0))
      .slice(0, 5)
      .map(({ id, claimNumber, lossType, status, createdAt, clientId }) => ({ id, claimNumber, lossType, status, createdAt, clientId })),
  };
};

const getDashboardAnalytics = async userId => {
  const db = getFirestore();
  const [clientsSnap, claimsSnap, appointmentsSnap, reportsSnap] = await Promise.all([
    db.collection('crmClients').where('userId', '==', userId).get(),
    db.collection('crmClaims').where('userId', '==', userId).get(),
    db.collection('crmAppointments').where('userId', '==', userId).get(),
    db.collection('reports').where('userId', '==', userId).get(),
  ]);
  const docs = snap => snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  return buildDashboardAnalytics({
    clients: docs(clientsSnap),
    claims: docs(claimsSnap),
    appointments: docs(appointmentsSnap),
    reports: docs(reportsSnap),
  });
};

// ── CLIENTS ────────────────────────────────────────────────────────────────

const getClients = async (userId, { page = 1, limit = 20, search = '' } = {}) => {
  const db = getFirestore();
  const snapshot = await db.collection('crmClients').where('userId', '==', userId).get();
  let clients = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  clients.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (search) {
    const s = search.toLowerCase();
    clients = clients.filter(c =>
      (c.name || '').toLowerCase().includes(s) ||
      (c.email || '').toLowerCase().includes(s) ||
      (c.company || '').toLowerCase().includes(s)
    );
  }

  const total = clients.length;
  const offset = (page - 1) * limit;
  return { data: clients.slice(offset, offset + limit), total, page, limit, hasMore: offset + limit < total };
};

const createClient = async (userId, data) => {
  const db = getFirestore();
  const clientId = uuidv4();
  const client = {
    id: clientId,
    userId,
    name: data.name,
    email: data.email || '',
    phone: data.phone || '',
    company: data.company || '',
    address: data.address || '',
    notes: data.notes || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    totalReports: 0,
  };
  await db.collection('crmClients').doc(clientId).set(client);
  return client;
};

const getClient = async (userId, clientId) => {
  const db = getFirestore();
  const doc = await db.collection('crmClients').doc(clientId).get();
  if (!doc.exists || doc.data().userId !== userId) throw new Error('Client not found');
  return { id: doc.id, ...doc.data() };
};

const updateClient = async (userId, clientId, data) => {
  const db = getFirestore();
  const ref = db.collection('crmClients').doc(clientId);
  const doc = await ref.get();
  if (!doc.exists || doc.data().userId !== userId) throw new Error('Client not found');
  const updates = { ...data, updatedAt: new Date().toISOString() };
  delete updates.userId; delete updates.id;
  await ref.update(updates);
  return { id: clientId, ...doc.data(), ...updates };
};

const deleteClient = async (userId, clientId) => {
  const db = getFirestore();
  const ref = db.collection('crmClients').doc(clientId);
  const doc = await ref.get();
  if (!doc.exists || doc.data().userId !== userId) throw new Error('Client not found');
  await ref.delete();
};

const getClientReports = async (userId, clientId) => {
  const db = getFirestore();
  const snap = await db.collection('reports')
    .where('userId', '==', userId)
    .where('clientId', '==', clientId)
    .get();
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const buildClientProfile = (client, { claims = [], appointments = [], reports = [] } = {}) => ({
  client,
  claims: claims.sort((a, b) => new Date(b.createdAt || b.lossDate) - new Date(a.createdAt || a.lossDate)),
  appointments: appointments.sort((a, b) => new Date(`${b.date || ''}T${b.time || '00:00'}`) - new Date(`${a.date || ''}T${a.time || '00:00'}`)),
  reports: reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
  summary: {
    totalClaims: claims.length,
    openClaims: claims.filter(item => ['open', 'in-progress', 'pending-review'].includes(String(item.status || '').toLowerCase())).length,
    totalReports: reports.length,
    upcomingAppointments: appointments.filter(item => item.status === 'scheduled' && item.date >= new Date().toISOString().slice(0, 10)).length,
  },
});

const getClientProfile = async (userId, clientId) => {
  const db = getFirestore();
  const client = await getClient(userId, clientId);
  const [claimsSnap, appointmentsSnap, reportsSnap] = await Promise.all([
    db.collection('crmClaims').where('userId', '==', userId).get(),
    db.collection('crmAppointments').where('userId', '==', userId).get(),
    db.collection('reports').where('userId', '==', userId).get(),
  ]);
  const linked = snapshot => snapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(item => item.clientId === clientId);
  return buildClientProfile(client, {
    claims: linked(claimsSnap), appointments: linked(appointmentsSnap), reports: linked(reportsSnap),
  });
};

// ── APPOINTMENTS ──────────────────────────────────────────────────────────

const getAppointments = async (userId, { startDate, endDate, status } = {}) => {
  const db = getFirestore();
  let query = db.collection('crmAppointments').where('userId', '==', userId);
  if (status) query = query.where('status', '==', status);
  const snap = await query.get();

  let appts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  appts.sort((a, b) => new Date(a.date) - new Date(b.date));
  if (startDate) appts = appts.filter(a => a.date >= startDate);
  if (endDate) appts = appts.filter(a => a.date <= endDate);
  return appts;
};

const createAppointment = async (userId, data) => {
  const db = getFirestore();
  const id = uuidv4();
  const appt = {
    id, userId,
    title: data.title,
    clientId: data.clientId || null,
    date: data.date,
    time: data.time || '',
    location: data.location || '',
    notes: data.notes || '',
    status: data.status || 'scheduled',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.collection('crmAppointments').doc(id).set(appt);
  return appt;
};

const updateAppointment = async (userId, apptId, data) => {
  const db = getFirestore();
  const ref = db.collection('crmAppointments').doc(apptId);
  const doc = await ref.get();
  if (!doc.exists || doc.data().userId !== userId) throw new Error('Appointment not found');
  const updates = { ...data, updatedAt: new Date().toISOString() };
  delete updates.userId; delete updates.id;
  await ref.update(updates);
  return { id: apptId, ...doc.data(), ...updates };
};

const deleteAppointment = async (userId, apptId) => {
  const db = getFirestore();
  const ref = db.collection('crmAppointments').doc(apptId);
  const doc = await ref.get();
  if (!doc.exists || doc.data().userId !== userId) throw new Error('Not found');
  await ref.delete();
};

// ── CLAIMS ────────────────────────────────────────────────────────────────

const getClaims = async (userId, { page = 1, limit = 20, status, search = '' } = {}) => {
  const db = getFirestore();
  let query = db.collection('crmClaims').where('userId', '==', userId);
  if (status) query = query.where('status', '==', status);
  const snap = await query.get();

  let claims = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  claims.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (search) {
    const s = search.toLowerCase();
    claims = claims.filter(c =>
      (c.claimNumber || '').toLowerCase().includes(s) ||
      (c.lossType || '').toLowerCase().includes(s) ||
      (c.propertyAddress || '').toLowerCase().includes(s)
    );
  }

  const total = claims.length;
  const offset = (page - 1) * limit;
  return { data: claims.slice(offset, offset + limit), total, page, limit, hasMore: offset + limit < total };
};

// Checks whether another claim already uses this claim number for this user.
// Pass excludeId when checking during an update so a claim doesn't collide with itself.
const claimNumberExists = async (userId, claimNumber, excludeId = null) => {
  const db = getFirestore();
  const snap = await db.collection('crmClaims')
    .where('userId', '==', userId)
    .where('claimNumber', '==', claimNumber)
    .get();
  return snap.docs.some(d => d.id !== excludeId);
};

const createClaim = async (userId, data) => {
  const db = getFirestore();
  const id = uuidv4();
  const claim = {
    id, userId,
    claimNumber: data.claimNumber || `CLM-${Date.now()}`,
    clientId: data.clientId || null,
    lossType: data.lossType || 'Other',
    lossDate: data.lossDate || '',
    status: data.status || 'Open',
    description: data.description || '',
    propertyAddress: data.propertyAddress || '',
    notes: data.notes || '',
    linkedReports: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.collection('crmClaims').doc(id).set(claim);
  return claim;
};

const getClaim = async (userId, claimId) => {
  const db = getFirestore();
  const doc = await db.collection('crmClaims').doc(claimId).get();
  if (!doc.exists || doc.data().userId !== userId) throw new Error('Claim not found');
  return { id: doc.id, ...doc.data() };
};

const getClaimReports = async (userId, claimId) => {
  const db = getFirestore();
  const snap = await db.collection('reports')
    .where('userId', '==', userId)
    .where('claimId', '==', claimId)
    .get();
  const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const buildClaimProfile = (claim, { client = null, reports = [] } = {}) => {
  const orderedReports = reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return {
    claim,
    client,
    reports: orderedReports,
    summary: {
      totalReports: orderedReports.length,
      drafts: orderedReports.filter(report => !['finalized', 'completed'].includes(String(report.status || '').toLowerCase())).length,
      finalized: orderedReports.filter(report => ['finalized', 'completed'].includes(String(report.status || '').toLowerCase())).length,
      latestReportAt: orderedReports[0]?.createdAt || null,
    },
  };
};

const getClaimProfile = async (userId, claimId) => {
  const db = getFirestore();
  const claim = await getClaim(userId, claimId);
  const [reportsSnap, clientDoc] = await Promise.all([
    db.collection('reports').where('userId', '==', userId).get(),
    claim.clientId ? db.collection('crmClients').doc(claim.clientId).get() : Promise.resolve(null),
  ]);
  const client = clientDoc?.exists && clientDoc.data().userId === userId
    ? { id: clientDoc.id, ...clientDoc.data() }
    : null;
  const reports = reportsSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(report => report.claimId === claimId);
  return buildClaimProfile(claim, { client, reports });
};

const updateClaim = async (userId, claimId, data) => {
  const db = getFirestore();
  const ref = db.collection('crmClaims').doc(claimId);
  const doc = await ref.get();
  if (!doc.exists || doc.data().userId !== userId) throw new Error('Claim not found');
  const updates = { ...data, updatedAt: new Date().toISOString() };
  delete updates.userId; delete updates.id;
  await ref.update(updates);
  return { id: claimId, ...doc.data(), ...updates };
};

const deleteClaim = async (userId, claimId) => {
  const db = getFirestore();
  const ref = db.collection('crmClaims').doc(claimId);
  const doc = await ref.get();
  if (!doc.exists || doc.data().userId !== userId) throw new Error('Not found');
  await ref.delete();
};

module.exports = {
  buildDashboardAnalytics, getDashboardAnalytics,
  buildClientProfile, getClientProfile,
  getClients, createClient, getClient, updateClient, deleteClient, getClientReports,
  getAppointments, createAppointment, updateAppointment, deleteAppointment,
  buildClaimProfile, getClaimProfile,
  getClaims, createClaim, getClaim, updateClaim, deleteClaim, claimNumberExists, getClaimReports,
};
