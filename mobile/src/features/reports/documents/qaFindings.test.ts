import { emptyCanonicalLineItem, parseAmount, validateCanonicalEstimateDraft, buildCanonicalEstimatePayload } from './canonicalEstimate';
import { reportAddressParts } from './PropertyIntelligenceSheet';

describe('QA findings (Nov 2026)', () => {
  it('POT-11: reports every missing required field at once', () => {
    const blank = { ...emptyCanonicalLineItem(), room: '', category: '', trade: '', description: '', quantity: '1' };
    expect(validateCanonicalEstimateDraft([blank])).toBe('Item 1: add a room/area, a category and a description.');
  });

  it('POT-11: validates labeled amounts with clear messages', () => {
    const li = { ...emptyCanonicalLineItem(), room: 'Kitchen', category: 'Cleanup', description: 'Clean', quantity: '1' };
    const msg = validateCanonicalEstimateDraft([li], [
      { label: 'Permits', rows: [{ id: 'p', description: 'Permit', amount: '-5', taxable: false }], allowNegative: false },
      { label: 'Manual Adjustments', rows: [{ id: 'a', description: '', amount: 'abc', taxable: true }], allowNegative: true },
    ]);
    expect(msg).toBe("Permits 1: amount can't be negative.\nManual Adjustments 1: add a description; amount must be a number.");
  });

  it('FAI-006: a negative (credit) adjustment and formatted amounts reach the payload', () => {
    expect(parseAmount('$1,250.50')).toBe(1250.5);
    expect(parseAmount('-50')).toBe(-50);
    expect(Number.isNaN(parseAmount('12a'))).toBe(true);
    const li = { ...emptyCanonicalLineItem(), room: 'Kitchen', category: 'Drywall', description: 'Replace', quantity: '1', materialUnitCost: '1,770' };
    const draft = {
      currency: 'USD',
      region: '',
      lineItems: [li],
      permits: [],
      generalConditions: [{ id: 'g', description: 'Cleanup', amount: '200', taxable: true }],
      manualAdjustments: [{ id: 'm', description: 'Discount', amount: '-50', taxable: false }],
      overheadProfitPercent: '10',
      taxRatePercent: '8',
    };
    const payload = buildCanonicalEstimatePayload({ revision: 2, schemaVersion: 1 }, draft, '');
    expect(payload.lineItems[0]).toMatchObject({ materialUnitCost: 1770 });
    expect(payload.manualAdjustments[0]).toMatchObject({ amount: -50, taxable: false });
    expect(payload.generalConditions[0]).toMatchObject({ amount: 200, taxable: true });
  });

  it('POT-09/10: splits a claim address into parts', () => {
    expect(reportAddressParts({ propertyAddress: '1200 Main St, Dallas, TX 75201' })).toEqual({ street: '1200 Main St', city: 'Dallas', state: 'TX', zip: '75201' });
    expect(reportAddressParts({ propertyAddress: '1200 Main St, Apt 4, Dallas, TX 75201, USA' })).toEqual({ street: '1200 Main St, Apt 4', city: 'Dallas', state: 'TX', zip: '75201' });
    expect(reportAddressParts({ propertyStreet: '9 Elm', propertyCity: 'Austin', propertyState: 'TX', propertyZip: '73301', propertyAddress: 'x' })).toEqual({ street: '9 Elm', city: 'Austin', state: 'TX', zip: '73301' });
  });
});
