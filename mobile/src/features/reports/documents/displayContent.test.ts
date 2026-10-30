import { injectSection3PropertyBlock, injectSection7Detail } from './displayContent';

const doc = '# R\n## SECTION 3 PROPERTY\nNarrative\n### Sub\nx\n## SECTION 7 COSTS\nold costs\n## SECTION 8\nend';

describe('display composition (port of web inject helpers)', () => {
  it('replaces the Section 7 narrative with the server detail', () => {
    expect(injectSection7Detail(doc, 'NEW')).toBe('# R\n## SECTION 3 PROPERTY\nNarrative\n### Sub\nx\n## SECTION 7 COSTS\n\nNEW\n\n## SECTION 8\nend');
    expect(injectSection7Detail(doc, '')).toBe(doc);
  });
  it('appends the Section 3 block after the whole Section 3 narrative (sub-headings included)', () => {
    expect(injectSection3PropertyBlock(doc, 'P')).toBe('# R\n## SECTION 3 PROPERTY\nNarrative\n### Sub\nx\n\nP\n\n## SECTION 7 COSTS\nold costs\n## SECTION 8\nend');
  });
});
