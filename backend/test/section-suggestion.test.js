const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSectionSuggestionPrompt } = require('../services/aiService');

test('section suggestion prompt requires cautious language and human review', () => {
  const prompt = buildSectionSuggestionPrompt({
    title: 'Damage Assessment', body: 'Water staining is visible.', reportContext: 'Loss type: Water Damage',
  });
  assert.match(prompt, /do not invent/i);
  assert.match(prompt, /do not determine coverage, liability, cause of loss/i);
  assert.match(prompt, /human reviewer will explicitly accept, reject, or edit/i);
  assert.match(prompt, /Water staining is visible/);
});
