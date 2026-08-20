const test = require('node:test');
const assert = require('node:assert/strict');
const {
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
  buildTemplateGuidance,
  TEMPLATE_REQUIRABLE_FIELDS,
  FLACRON_TEMPLATE_DEFS,
} = require('../services/templateService');
const { appendTemplateSections } = require('../utils/richContent');

// Phase 13 (Real Template Builder). All pure-logic tests -- no Firestore
// involved (matches this repo's existing convention, e.g.
// photo-job-service.test.js exercising mergeImageAnalysis directly).

const soloUser = { uid: 'u1' };
const orgOwner = { uid: 'owner1' };
const orgAdmin = { uid: 'admin1', teamOwnerId: 'owner1', teamRole: 'admin' };
const orgViewer = { uid: 'viewer1', teamOwnerId: 'owner1', teamRole: 'viewer' };
const outsider = { uid: 'stranger1' };

test('resolveOrganizationId: a solo/owner account is its own organization; a team member resolves to their owner', () => {
  assert.equal(resolveOrganizationId(soloUser), 'u1');
  assert.equal(resolveOrganizationId(orgOwner), 'owner1');
  assert.equal(resolveOrganizationId(orgAdmin), 'owner1');
});

test('resolveRole: the org owner is implicitly "owner"; a team member uses their stored teamRole; unknown falls back to viewer', () => {
  assert.equal(resolveRole(orgOwner), 'owner');
  assert.equal(resolveRole(orgAdmin), 'admin');
  assert.equal(resolveRole(orgViewer), 'viewer');
  assert.equal(resolveRole({ uid: 'u2' }), 'owner'); // solo account, uid === own org id
  assert.equal(resolveRole(null), 'viewer');
});

test('canManageOrganizationTemplates: every role except viewer can manage', () => {
  assert.equal(canManageOrganizationTemplates(orgOwner), true);
  assert.equal(canManageOrganizationTemplates(orgAdmin), true);
  assert.equal(canManageOrganizationTemplates(orgViewer), false);
});

test('canView: personal templates are visible only to their owner', () => {
  const tpl = { scope: 'personal', ownerId: 'u1' };
  assert.equal(canView(tpl, soloUser), true);
  assert.equal(canView(tpl, outsider), false);
});

test('canView: organization templates are visible to every member sharing the same organizationId', () => {
  const tpl = { scope: 'organization', organizationId: 'owner1' };
  assert.equal(canView(tpl, orgOwner), true);
  assert.equal(canView(tpl, orgAdmin), true);
  assert.equal(canView(tpl, orgViewer), true);
  assert.equal(canView(tpl, outsider), false, 'a member of a DIFFERENT organization must not see this template');
});

test('canView: flacron templates are visible to everyone', () => {
  const tpl = { scope: 'flacron' };
  assert.equal(canView(tpl, soloUser), true);
  assert.equal(canView(tpl, outsider), true);
});

test('canEdit: flacron templates are never editable by anyone', () => {
  const tpl = { scope: 'flacron' };
  assert.equal(canEdit(tpl, orgOwner), false);
  assert.equal(canEdit(tpl, soloUser), false);
});

test('canEdit: personal templates are editable only by their owner', () => {
  const tpl = { scope: 'personal', ownerId: 'u1' };
  assert.equal(canEdit(tpl, soloUser), true);
  assert.equal(canEdit(tpl, outsider), false);
});

test('canEdit: organization templates are editable by any non-viewer member of that org, not by outsiders or viewers', () => {
  const tpl = { scope: 'organization', organizationId: 'owner1' };
  assert.equal(canEdit(tpl, orgOwner), true);
  assert.equal(canEdit(tpl, orgAdmin), true);
  assert.equal(canEdit(tpl, orgViewer), false);
  assert.equal(canEdit(tpl, outsider), false);
});

test('sanitizeFields: only known template field keys survive, everything else is dropped', () => {
  const out = sanitizeFields({ lossType: 'Fire', evil: '<script>', claimNumber: 'should-never-be-a-template-default' });
  assert.deepEqual(out, { lossType: 'Fire' });
});

test('sanitizeFields: non-object input never throws', () => {
  assert.deepEqual(sanitizeFields(null), {});
  assert.deepEqual(sanitizeFields(undefined), {});
});

test('sanitizeRequiredFields: only allowlisted field names survive, deduped', () => {
  const out = sanitizeRequiredFields(['propertyDetails', 'propertyDetails', 'claimNumber', 'not-a-real-field']);
  assert.deepEqual(out, ['propertyDetails']);
});

test('sanitizeRequiredFields: every allowlisted field is actually requirable', () => {
  const out = sanitizeRequiredFields(TEMPLATE_REQUIRABLE_FIELDS);
  assert.deepEqual(out.sort(), [...TEMPLATE_REQUIRABLE_FIELDS].sort());
});

test('sanitizeSections: assigns order, drops empty-title entries, generates an id when missing', () => {
  const out = sanitizeSections([{ title: 'Roof Findings', body: 'text' }, { title: '  ', body: 'dropped' }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'Roof Findings');
  assert.equal(out[0].order, 0);
  assert.ok(out[0].id);
});

test('sanitizeSections: caps the number of sections', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ title: `Section ${i}`, body: '' }));
  const out = sanitizeSections(many);
  assert.ok(out.length <= 20);
});

test('sanitizePhotoLayout: defaults every checkbox to true and clamps photoLayout to 1/2/4', () => {
  assert.deepEqual(sanitizePhotoLayout({}), {
    includeCoverPage: true, includePhotoCaptions: true, includePageNumbers: true,
    includeAppendix: true, includeCompanyBranding: true, photoLayout: 2,
  });
  assert.equal(sanitizePhotoLayout({ photoLayout: 4 }).photoLayout, 4);
  assert.equal(sanitizePhotoLayout({ photoLayout: 3 }).photoLayout, 2, 'an invalid layout size falls back to the default');
  assert.equal(sanitizePhotoLayout({ includeCoverPage: false }).includeCoverPage, false);
});

test('sanitizeBrandingText: never accepts a client-supplied logoObjectPath/logoUrl (IDOR guard)', () => {
  const out = sanitizeBrandingText({ companyName: 'Acme', footerText: 'Confidential', logoObjectPath: 'users/other-uid/reports/x/secret.jpg', logoUrl: 'https://evil.example/x' });
  assert.equal(out.companyName, 'Acme');
  assert.equal(out.footerText, 'Confidential');
  assert.equal(out.logoObjectPath, undefined);
  assert.equal(out.logoUrl, undefined);
});

test('buildTemplateGuidance: null template yields no guidance', () => {
  assert.equal(buildTemplateGuidance(null), null);
});

test('buildTemplateGuidance: mentions the template name/description and every custom section title', () => {
  const tpl = { name: 'Roof', description: 'Roof-focused inspection.', sections: [{ title: 'ROOF-SPECIFIC FINDINGS' }] };
  const guidance = buildTemplateGuidance(tpl);
  assert.match(guidance, /Roof/);
  assert.match(guidance, /ROOF-SPECIFIC FINDINGS/);
});

test('appendTemplateSections: no-op when there are no sections', () => {
  assert.equal(appendTemplateSections('## SECTION 9: CONCLUSION\ntext', []), '## SECTION 9: CONCLUSION\ntext');
  assert.equal(appendTemplateSections('content', null), 'content');
});

test('appendTemplateSections: appends each section as an uppercased heading with its sanitized body', () => {
  const out = appendTemplateSections('base content', [{ title: 'Extra Notes', body: 'Some **guidance** text' }]);
  assert.match(out, /## EXTRA NOTES/);
  assert.match(out, /Some \*\*guidance\*\* text/);
  assert.match(out, /^base content/);
});

test('appendTemplateSections: an empty body still renders a placeholder rather than a blank section', () => {
  const out = appendTemplateSections('base', [{ title: 'Empty Section', body: '' }]);
  assert.match(out, /\[To be completed by the adjuster\]/);
});

test('FLACRON_TEMPLATE_DEFS: covers every example named in PHASES.md Phase 13 (Residential Property, Water Loss, Roof, Wind/Hail, Fire, Commercial Property)', () => {
  const names = FLACRON_TEMPLATE_DEFS.map((t) => t.name);
  assert.deepEqual(names.sort(), ['Commercial Property', 'Fire', 'Residential Property', 'Roof', 'Water Loss', 'Wind / Hail'].sort());
});

test('FLACRON_TEMPLATE_DEFS: every def has a unique id and at least one custom section', () => {
  const ids = FLACRON_TEMPLATE_DEFS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  FLACRON_TEMPLATE_DEFS.forEach((def) => {
    assert.ok(Array.isArray(def.sections) && def.sections.length > 0, `${def.name} should define at least one section`);
  });
});
