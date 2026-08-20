const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSectionSuggestionPrompt,
  buildAssistPrompt,
  SECTION_ASSIST_ACTIONS,
} = require('../services/aiService');

// Phase 9 (Report Editor Rich-Text & AI Panel Upgrade): "Regenerate Section" is
// the existing open-ended rewrite ("Suggest") extended with an `instructions`
// field -- the reviewer's own free-text request for what to change, shown in
// the editor's Cancel/Regenerate modal before any comparison/approval.

test('Regenerate Section: without instructions, behaves like the original open rewrite', () => {
  const prompt = buildSectionSuggestionPrompt({
    title: 'Area Observations',
    body: 'Water staining is visible.',
  });
  assert.doesNotMatch(prompt, /REVIEWER SPECIFICALLY REQUESTED/);
  assert.match(prompt, /do not invent/i);
});

test('Regenerate Section: instructions are included and the model is told to apply them', () => {
  const prompt = buildSectionSuggestionPrompt({
    title: 'Area Observations',
    body: 'Water staining is visible.',
    instructions: 'Make this more concise and mention the hallway too.',
  });
  assert.match(prompt, /REVIEWER SPECIFICALLY REQUESTED THIS CHANGE/);
  assert.match(prompt, /Make this more concise and mention the hallway too\./);
  assert.match(prompt, /Apply the reviewer's requested change/);
  // Golden Rule #2 constraints still apply even with a custom instruction.
  assert.match(prompt, /do not invent/i);
  assert.match(prompt, /do not determine coverage, liability, cause of loss/i);
});

test('SECTION_ASSIST_ACTIONS exposes exactly the 7 FLACRON ENGINE writing-assistance functions', () => {
  assert.deepEqual(
    [...SECTION_ASSIST_ACTIONS].sort(),
    [
      'check_consistency',
      'check_missing_info',
      'expand',
      'improve',
      'review_photos',
      'rewrite_professional',
      'shorten',
    ].sort()
  );
});

test('each of the 7 assist actions builds a distinct prompt with the shared Golden Rule #2 guardrails', () => {
  for (const action of SECTION_ASSIST_ACTIONS) {
    const prompt = buildAssistPrompt({
      action,
      title: 'Area Observations',
      body: 'Water staining is visible on the ceiling.',
    });
    assert.match(
      prompt,
      /Water staining is visible on the ceiling\./,
      `${action} includes the current section text`
    );
    assert.match(
      prompt,
      /cautious observational wording/i,
      `${action} carries the shared cautious-language rule`
    );
    assert.match(prompt, /Apply or Discard/, `${action} states the never-auto-overwrite contract`);
  }
});

test('check_consistency includes the full report content for cross-section comparison', () => {
  const prompt = buildAssistPrompt({
    action: 'check_consistency',
    title: 'Area Observations',
    body: 'x',
    fullContent: '## SECTION 3: PROPERTY INFO\nA distinctive marker string XYZ123',
  });
  assert.match(prompt, /XYZ123/);
  assert.match(prompt, /AI Review Notes — Consistency Check:/);
});

test('review_photos includes the per-photo documentation summary', () => {
  const prompt = buildAssistPrompt({
    action: 'review_photos',
    title: 'Area Observations',
    body: 'x',
    photosSummary: '1. [approved] Interior - Kitchen — Water Damage: staining visible',
  });
  assert.match(prompt, /Interior - Kitchen/);
  assert.match(prompt, /AI Review Notes — Photo Documentation:/);
});

test('an unknown action throws rather than silently falling through', () => {
  assert.throws(() => buildAssistPrompt({ action: 'not_a_real_action', title: 'x', body: 'y' }));
});
