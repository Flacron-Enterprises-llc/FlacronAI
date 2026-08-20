// Phase 13 (Real Template Builder). Expands the old flat, per-user
// "reportTemplates" field-defaults bag (backend/routes/reports.js, kept
// unchanged for backward compatibility) into a real structural template:
// name/description, wizard field defaults, a required-field subset, custom
// report sections (Phase 9's title+body shape), a photo/export layout
// preference (Phase 11's options), and optional org branding.
//
// Three scopes:
//   'personal'     -- visible only to its owner.
//   'organization' -- visible to every member of the same organization. This
//                     codebase has no separate "organizations" collection --
//                     an enterprise team's owner IS the organization, and a
//                     team member's `teamOwnerId` (set on invite-accept, see
//                     teams.js) links them to it. A solo (non-team) account's
//                     organizationId is just its own uid, so "organization"
//                     templates degrade gracefully to personal-only until that
//                     account actually has teammates.
//   'flacron'      -- seeded, read-only example templates, visible to everyone.
const { v4: uuidv4 } = require('uuid');
const { getFirestore } = require('../config/firebase');
const { deleteObject } = require('../config/storage');
const { sanitizeReportContent, sanitizeInstructions } = require('../utils/richContent');
const { resolveOrganizationId, resolveRole, hasCapability } = require('../utils/orgRoles');

const COLLECTION = 'templates';

const MAX_NAME_LENGTH = 150;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_SECTION_TITLE_LENGTH = 150;
const MAX_SECTION_BODY_LENGTH = 8000;
const MAX_SECTIONS = 20;
const MAX_COMPANY_NAME_LENGTH = 150;
const MAX_FOOTER_TEXT_LENGTH = 500;

// Wizard fields a template may supply as defaults -- kept in sync with
// FORM_INITIAL in frontend/src/pages/Dashboard.jsx and the wizard allowlists
// in backend/routes/reports.js. Deliberately excludes per-claim identity
// fields (claimNumber/insuredName/propertyAddress/lossDate) -- those identify
// ONE specific loss, never a reusable template default.
const TEMPLATE_FIELD_KEYS = [
  'lossType', 'reportType', 'propertyDetails', 'lossDescription', 'damagesObserved',
  'recommendations', 'additionalNotes', 'claimType', 'propertyType', 'inspectionType',
  'weatherConditions', 'occupancyStatus',
];

// Fields a template may mark as required (in addition to the wizard's own
// always-required baseline: claimNumber/insuredName/propertyAddress/lossDate/
// lossType, enforced unconditionally in reports.js regardless of template) --
// a template can only ever ADD stricter requirements, never loosen them.
const TEMPLATE_REQUIRABLE_FIELDS = [
  'policyNumber', 'insuranceCompany', 'propertyDetails', 'lossDescription',
  'damagesObserved', 'recommendations', 'inspectionDate', 'inspectorName',
  'weatherConditions', 'occupancyStatus',
];

const PHOTO_LAYOUT_SIZES = new Set([1, 2, 4]);

// resolveOrganizationId/resolveRole now live in ../utils/orgRoles (Phase 14
// made this the shared source of truth across teams.js/reports.js too,
// instead of three independently-drifting copies of the same two formulas).

// Phase 14 expanded the role model from 4 roles (owner/admin/editor/viewer)
// to 7 (+ a legacy "editor" alias) with an explicit least-privilege
// capability matrix -- organization-template management is now an explicit
// owner/admin/manager allow-list (`canManageTemplates`), not "anything that
// isn't a viewer" (that used to silently include every new role by default,
// which would have wrongly let Adjuster/Inspector/Reviewer manage templates).
const canManageOrganizationTemplates = (user) => hasCapability(user, 'canManageTemplates');

const canView = (tpl, user) => {
  if (!tpl || !user) return false;
  if (tpl.scope === 'flacron') return true;
  if (tpl.scope === 'personal') return tpl.ownerId === user.uid;
  if (tpl.scope === 'organization') return tpl.organizationId === resolveOrganizationId(user);
  return false;
};

const canEdit = (tpl, user) => {
  if (!tpl || !user || tpl.scope === 'flacron') return false;
  if (tpl.scope === 'personal') return tpl.ownerId === user.uid;
  if (tpl.scope === 'organization') {
    return tpl.organizationId === resolveOrganizationId(user) && canManageOrganizationTemplates(user);
  }
  return false;
};

// ── Sanitization ─────────────────────────────────────────────────────────────

const sanitizeFields = (fields = {}) => {
  const out = {};
  if (fields && typeof fields === 'object') {
    TEMPLATE_FIELD_KEYS.forEach((k) => {
      if (typeof fields[k] === 'string') out[k] = sanitizeReportContent(fields[k]).slice(0, 5000);
    });
  }
  return out;
};

const sanitizeRequiredFields = (list) => {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((f) => TEMPLATE_REQUIRABLE_FIELDS.includes(f)))];
};

const sanitizeSections = (sections) => {
  if (!Array.isArray(sections)) return [];
  return sections
    .slice(0, MAX_SECTIONS)
    .map((s, i) => ({
      id: (s && typeof s.id === 'string' && s.id) || uuidv4(),
      title: sanitizeInstructions(s?.title || '').slice(0, MAX_SECTION_TITLE_LENGTH),
      body: sanitizeReportContent(s?.body || '').slice(0, MAX_SECTION_BODY_LENGTH),
      order: i,
    }))
    .filter((s) => s.title);
};

const sanitizePhotoLayout = (layout) => {
  const l = layout && typeof layout === 'object' ? layout : {};
  const size = parseInt(l.photoLayout, 10);
  return {
    includeCoverPage: l.includeCoverPage !== false,
    includePhotoCaptions: l.includePhotoCaptions !== false,
    includePageNumbers: l.includePageNumbers !== false,
    includeAppendix: l.includeAppendix !== false,
    includeCompanyBranding: l.includeCompanyBranding !== false,
    photoLayout: PHOTO_LAYOUT_SIZES.has(size) ? size : 2,
  };
};

// Text-only branding fields a client may set directly. `logoObjectPath`/
// `logoUrl` are deliberately NEVER accepted here -- they can only be set by
// setTemplateLogo() below (via the dedicated, server-controlled upload
// endpoint), otherwise a client could point a template's "logo" at an
// arbitrary Storage object path it doesn't own (e.g. another user's private
// report photo) and have it silently downloaded into every export generated
// from this template.
const sanitizeBrandingText = (branding) => {
  const b = branding && typeof branding === 'object' ? branding : {};
  return {
    companyName: sanitizeInstructions(b.companyName || '').slice(0, MAX_COMPANY_NAME_LENGTH),
    footerText: sanitizeInstructions(b.footerText || '').slice(0, MAX_FOOTER_TEXT_LENGTH),
  };
};

// ── Data access ──────────────────────────────────────────────────────────────

const getTemplateDoc = async (id) => {
  if (!id) return null;
  const snap = await getFirestore().collection(COLLECTION).doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
};

const getTemplateForUse = async (user, id) => {
  let tpl = await getTemplateDoc(id);
  // A flacron template requested by ID before any /templates list call has
  // ever run this process's lazy seed -- seed once and retry, rather than
  // 404ing a perfectly valid built-in template on a cold start.
  if (!tpl && id && FLACRON_TEMPLATE_DEFS.some((d) => d.id === id)) {
    await ensureFlacronTemplatesSeeded();
    tpl = await getTemplateDoc(id);
  }
  if (!tpl || !canView(tpl, user)) return null;
  return tpl;
};

const getTemplateForEdit = async (user, id) => {
  const tpl = await getTemplateDoc(id);
  if (!tpl) return { error: 'Template not found', code: 'NOT_FOUND' };
  if (!canEdit(tpl, user)) {
    return { error: 'You do not have permission to modify this template', code: 'FORBIDDEN' };
  }
  return { template: tpl };
};

const listTemplates = async (user, { includeArchived = false } = {}) => {
  await ensureFlacronTemplatesSeeded();
  const db = getFirestore();
  const orgId = resolveOrganizationId(user);
  const toList = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const [personalSnap, orgSnap, flacronSnap] = await Promise.all([
    db.collection(COLLECTION).where('scope', '==', 'personal').where('ownerId', '==', user.uid).get(),
    db.collection(COLLECTION).where('scope', '==', 'organization').where('organizationId', '==', orgId).get(),
    db.collection(COLLECTION).where('scope', '==', 'flacron').get(),
  ]);

  let templates = [...toList(personalSnap), ...toList(orgSnap), ...toList(flacronSnap)];
  if (!includeArchived) templates = templates.filter((t) => !t.archived);
  templates.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return templates;
};

const createTemplate = async ({ user, name, description, scope, fields, requiredFields, sections, photoLayout, branding }) => {
  const trimmedName = String(name || '').trim().slice(0, MAX_NAME_LENGTH);
  if (!trimmedName) return { error: 'Template name is required', code: 'VALIDATION_ERROR' };

  const resolvedScope = scope === 'organization' ? 'organization' : 'personal';
  if (resolvedScope === 'organization' && !canManageOrganizationTemplates(user)) {
    return { error: 'You do not have permission to create organization templates', code: 'FORBIDDEN' };
  }

  const now = new Date().toISOString();
  const id = uuidv4();
  const doc = {
    id,
    scope: resolvedScope,
    ownerId: user.uid,
    organizationId: resolvedScope === 'organization' ? resolveOrganizationId(user) : null,
    name: trimmedName,
    description: sanitizeReportContent(description || '').slice(0, MAX_DESCRIPTION_LENGTH),
    fields: sanitizeFields(fields),
    requiredFields: sanitizeRequiredFields(requiredFields),
    sections: sanitizeSections(sections),
    photoLayout: sanitizePhotoLayout(photoLayout),
    branding: { ...sanitizeBrandingText(branding), logoObjectPath: null, logoUrl: null },
    archived: false,
    sourceTemplateId: null,
    createdBy: user.uid,
    updatedBy: user.uid,
    createdAt: now,
    updatedAt: now,
  };

  await getFirestore().collection(COLLECTION).doc(id).set(doc);
  return { template: doc };
};

const updateTemplate = async (user, id, patch = {}) => {
  const check = await getTemplateForEdit(user, id);
  if (check.error) return check;
  const tpl = check.template;

  const now = new Date().toISOString();
  const updates = { updatedAt: now, updatedBy: user.uid };

  if (patch.name !== undefined) {
    const trimmedName = String(patch.name || '').trim().slice(0, MAX_NAME_LENGTH);
    if (!trimmedName) return { error: 'Template name is required', code: 'VALIDATION_ERROR' };
    updates.name = trimmedName;
  }
  if (patch.description !== undefined) {
    updates.description = sanitizeReportContent(patch.description).slice(0, MAX_DESCRIPTION_LENGTH);
  }
  if (patch.fields !== undefined) updates.fields = sanitizeFields(patch.fields);
  if (patch.requiredFields !== undefined) updates.requiredFields = sanitizeRequiredFields(patch.requiredFields);
  if (patch.sections !== undefined) updates.sections = sanitizeSections(patch.sections);
  if (patch.photoLayout !== undefined) updates.photoLayout = sanitizePhotoLayout(patch.photoLayout);
  if (patch.branding !== undefined) {
    updates.branding = { ...tpl.branding, ...sanitizeBrandingText(patch.branding) };
  }
  // scope/ownerId/organizationId are immutable after creation -- moving an
  // existing template between visibility boundaries other users may already
  // depend on (e.g. personal -> organization) is not supported; duplicate
  // into a new template instead.

  await getFirestore().collection(COLLECTION).doc(id).update(updates);
  return { template: { ...tpl, ...updates } };
};

const duplicateTemplate = async (user, id) => {
  const tpl = await getTemplateDoc(id);
  if (!tpl || !canView(tpl, user)) return { error: 'Template not found', code: 'NOT_FOUND' };

  const now = new Date().toISOString();
  const newId = uuidv4();
  const copy = {
    ...tpl,
    id: newId,
    scope: 'personal',
    ownerId: user.uid,
    organizationId: null,
    name: `${tpl.name} (Copy)`.slice(0, MAX_NAME_LENGTH),
    archived: false,
    // A duplicate never inherits the source's Storage-backed logo -- that
    // object may live under a different owner's/org's path the duplicator
    // has no rights to read; the copy starts branding-logo-less.
    branding: { ...tpl.branding, logoObjectPath: null, logoUrl: null },
    sourceTemplateId: tpl.id,
    createdBy: user.uid,
    updatedBy: user.uid,
    createdAt: now,
    updatedAt: now,
  };

  await getFirestore().collection(COLLECTION).doc(newId).set(copy);
  return { template: copy };
};

const setArchived = async (user, id, archived) => {
  const check = await getTemplateForEdit(user, id);
  if (check.error) return check;
  const now = new Date().toISOString();
  await getFirestore().collection(COLLECTION).doc(id).update({
    archived: !!archived,
    updatedAt: now,
    updatedBy: user.uid,
  });
  return { template: { ...check.template, archived: !!archived, updatedAt: now } };
};

const deleteTemplate = async (user, id) => {
  const check = await getTemplateForEdit(user, id);
  if (check.error) return check;
  await getFirestore().collection(COLLECTION).doc(id).delete();
  if (check.template.branding?.logoObjectPath) {
    await deleteObject(check.template.branding.logoObjectPath).catch(() => {});
  }
  return { success: true };
};

// Only ever called from the /logo upload route (templates.js), which is what
// actually controls the objectPath/url values -- never accepts them from an
// arbitrary client body (see sanitizeBrandingText above).
const setTemplateLogo = async (user, id, { objectPath, url }) => {
  const check = await getTemplateForEdit(user, id);
  if (check.error) return check;
  const tpl = check.template;
  const prevPath = tpl.branding?.logoObjectPath || null;
  const now = new Date().toISOString();
  const branding = { ...tpl.branding, logoObjectPath: objectPath || null, logoUrl: url || null };
  await getFirestore().collection(COLLECTION).doc(id).update({ branding, updatedAt: now, updatedBy: user.uid });
  if (prevPath && prevPath !== objectPath) await deleteObject(prevPath).catch(() => {});
  return { template: { ...tpl, branding, updatedAt: now } };
};

// Summarizes a template's own defined structure into a short instruction the
// AI prompt can use to keep tone/scope consistent -- the actual guaranteed
// structure delivery is appendTemplateSections() (richContent.js), applied
// deterministically after generation; this is only a style/consistency nudge,
// never the sole mechanism relied on for the template's sections to appear.
const buildTemplateGuidance = (tpl) => {
  if (!tpl) return null;
  const parts = [];
  if (tpl.description) parts.push(`This report uses the "${tpl.name}" template: ${tpl.description}`);
  if (Array.isArray(tpl.sections) && tpl.sections.length > 0) {
    const titles = tpl.sections.map((s) => s.title).join(', ');
    parts.push(
      `The final report will also include these additional template-defined sections appended after your output -- do not duplicate them yourself, and keep your writing style and cautious language consistent with them: ${titles}.`
    );
  }
  return parts.length > 0 ? parts.join(' ') : null;
};

// ── Seeding (Flacron-provided example templates) ────────────────────────────
// Fixed, deterministic IDs so seeding is idempotent (a per-template existence
// check, not a wholesale wipe-and-recreate) -- safe to call on every server
// start / first template-list request without clobbering a future admin edit
// to one of these docs.
const FLACRON_TEMPLATE_DEFS = [
  {
    id: 'flacron-residential-property',
    name: 'Residential Property',
    description: 'General-purpose residential property inspection covering interior and exterior areas.',
    fields: {
      lossType: 'Other', reportType: 'Initial', claimType: 'Property',
      propertyType: 'Single-Family Home', inspectionType: 'Interior & Exterior', occupancyStatus: 'Occupied',
    },
    requiredFields: ['propertyDetails'],
    sections: [{
      title: 'GENERAL PROPERTY CONDITION NOTES',
      body: 'Document the overall condition of the property prior to the reported loss, including any pre-existing wear, deferred maintenance, or prior repairs the adjuster should be aware of.',
    }],
  },
  {
    id: 'flacron-water-loss',
    name: 'Water Loss',
    description: 'Water damage inspection with dedicated moisture and mitigation tracking.',
    fields: { lossType: 'Water Damage', reportType: 'Initial', claimType: 'Property', inspectionType: 'Interior & Exterior' },
    requiredFields: ['damagesObserved', 'lossDescription'],
    sections: [{
      title: 'MOISTURE & MITIGATION TRACKING',
      body: 'Record moisture meter readings by area, drying equipment deployed (air movers/dehumidifiers), and the date mitigation began, to support the adjuster\'s review of the mitigation timeline and cost reasonableness.',
    }],
  },
  {
    id: 'flacron-roof',
    name: 'Roof',
    description: 'Roof-focused exterior inspection for suspected wind, hail, or wear-related roof damage.',
    fields: { lossType: 'Hail', reportType: 'Initial', claimType: 'Property', inspectionType: 'Exterior' },
    requiredFields: ['propertyDetails'],
    sections: [{
      title: 'ROOF-SPECIFIC FINDINGS',
      body: 'Note the apparent roof covering material and age, slope count, test-square findings if performed, and any interior evidence of active leaks -- framed as observations for the adjuster\'s confirmation, not a coverage or causation determination.',
    }],
  },
  {
    id: 'flacron-wind-hail',
    name: 'Wind / Hail',
    description: 'Storm-event inspection covering both wind and hail damage indicators.',
    fields: {
      lossType: 'Wind', reportType: 'Initial', claimType: 'Property',
      inspectionType: 'Interior & Exterior', weatherConditions: 'High Wind',
    },
    requiredFields: ['lossDescription'],
    sections: [{
      title: 'STORM EVENT CONTEXT',
      body: 'Summarize the reported storm date and type and any storm-tracking data referenced, and note apparent wind-driven versus non-wind-related damage indicators for the adjuster to evaluate.',
    }],
  },
  {
    id: 'flacron-fire',
    name: 'Fire',
    description: 'Fire and smoke damage inspection with dedicated smoke/soot extent tracking.',
    fields: { lossType: 'Fire', reportType: 'Initial', claimType: 'Property', inspectionType: 'Interior & Exterior' },
    requiredFields: ['damagesObserved'],
    sections: [{
      title: 'SMOKE & SOOT EXTENT',
      body: 'Document rooms affected by smoke/soot versus direct fire damage, apparent HVAC contamination, and any odor concerns -- noting that origin-and-cause determinations remain with the fire marshal/adjuster, not this draft.',
    }],
  },
  {
    id: 'flacron-commercial-property',
    name: 'Commercial Property',
    description: 'Commercial property inspection with a business-operations impact section.',
    fields: {
      lossType: 'Other', reportType: 'Initial', claimType: 'Commercial',
      propertyType: 'Commercial', inspectionType: 'Interior & Exterior', occupancyStatus: 'Occupied',
    },
    requiredFields: ['propertyDetails'],
    sections: [{
      title: 'BUSINESS OPERATIONS IMPACT',
      body: 'Note any apparent impact to business operations, affected square footage by tenant/unit, and whether the space appears occupied/operating -- for the adjuster\'s business-interruption review.',
    }],
  },
];

let seedPromise = null;
const seedFlacronTemplates = async () => {
  const db = getFirestore();
  const now = new Date().toISOString();
  await Promise.all(FLACRON_TEMPLATE_DEFS.map(async (def) => {
    const ref = db.collection(COLLECTION).doc(def.id);
    const snap = await ref.get();
    if (snap.exists) return;
    await ref.set({
      id: def.id,
      scope: 'flacron',
      ownerId: null,
      organizationId: null,
      name: def.name,
      description: sanitizeReportContent(def.description).slice(0, MAX_DESCRIPTION_LENGTH),
      fields: sanitizeFields(def.fields),
      requiredFields: sanitizeRequiredFields(def.requiredFields),
      sections: sanitizeSections(def.sections),
      photoLayout: sanitizePhotoLayout(def.photoLayout),
      branding: { companyName: '', footerText: '', logoObjectPath: null, logoUrl: null },
      archived: false,
      sourceTemplateId: null,
      createdBy: null,
      updatedBy: null,
      createdAt: now,
      updatedAt: now,
    });
  }));
};

const ensureFlacronTemplatesSeeded = () => {
  if (!seedPromise) {
    seedPromise = seedFlacronTemplates().catch((err) => {
      console.warn('[templates] Flacron template seed failed:', err.message);
      seedPromise = null; // allow a retry on the next call
    });
  }
  return seedPromise;
};

module.exports = {
  TEMPLATE_FIELD_KEYS,
  TEMPLATE_REQUIRABLE_FIELDS,
  resolveOrganizationId,
  resolveRole,
  canManageOrganizationTemplates,
  canView,
  canEdit,
  sanitizeFields,
  sanitizeRequiredFields,
  sanitizeSections,
  sanitizePhotoLayout,
  sanitizeBrandingText,
  getTemplateDoc,
  getTemplateForUse,
  getTemplateForEdit,
  listTemplates,
  createTemplate,
  updateTemplate,
  duplicateTemplate,
  setArchived,
  deleteTemplate,
  setTemplateLogo,
  buildTemplateGuidance,
  ensureFlacronTemplatesSeeded,
  FLACRON_TEMPLATE_DEFS,
};
