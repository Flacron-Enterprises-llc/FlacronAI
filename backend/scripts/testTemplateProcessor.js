const path = require('path');
const fs = require('fs');
const { processTemplate, TemplateProcessor } = require('../utils/templateProcessor');
const { generateReportFromTemplate, transformAIDataToTemplate, getDefaultValues } = require('../services/reportTemplateService');

const TEST_OUTPUT_DIR = path.join(__dirname, '../test-output');

if (!fs.existsSync(TEST_OUTPUT_DIR)) {
  fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
}

const sampleUserInput = {
  claimNumber: 'CLM-2025-001234',
  policyNumber: 'POL-IAT-987654',
  insuredName: 'John Smith',
  insuredPhone: '(555) 123-4567',
  insuredEmail: 'john.smith@email.com',
  propertyAddress: '123 Main Street, Dallas, TX 75001',
  lossDate: 'January 15, 2025',
  lossType: 'Wind/Hail Storm',
  reportType: 'Initial Inspection',
  dateReceived: 'January 16, 2025',
  dateContacted: 'January 16, 2025',
  dateInspected: 'January 18, 2025',
  adjusterName: 'Sarah Johnson',
  partiesPresent: 'John Smith (Insured), Mike Wilson (Contractor)',
  propertyDescription: 'Single-family residential dwelling, two-story wood-framed construction with composition shingle roof.'
};

// Sample AI data using EXACT template placeholder names
const sampleAIData = {
  remarks: 'Thank you for the assignment. Sarah Johnson was present during the inspection conducted on January 18, 2025. The inspection was performed alongside John Smith (Insured) and Mike Wilson (Contractor). A comprehensive assessment of the property was completed to document all storm-related damages.',

  // Use exact template placeholder names
  risk: 'The risk is a two-story wood-framed residential dwelling with composition shingle roofing and vinyl siding in fair condition. The property is approximately 2,400 square feet with an attached two-car garage. The occupancy is consistent as listed in the policy declarations.',

  itv: 'The limit of insurance appears adequate based on the size, construction quality, and occupancy type of the dwelling.',

  occurrence: 'On the date of loss, a severe wind and hail storm occurred in the Dallas metropolitan area, resulting in widespread property damage. The National Weather Service confirmed hail up to 1.5 inches in diameter and wind gusts exceeding 60 mph in the vicinity of the insured property. The cause of loss is confirmed as wind/hail per field inspection.',

  coverage: 'The risk is insured with the above stated limits, policy forms, and deductible. All aspects pertaining to coverage are submitted for the carrier\'s review and final disposition. No pertinent exclusions or limitations were observed.',

  dwellingDamage: 'The dwelling sustained damage to the roof system and exterior elevations as a result of the wind/hail event. Detailed findings are outlined below.',

  roofType: 'Composition Shingle',
  roofAge: '8 Years',
  roofCondition: 'Fair - Storm Damaged',
  roofLayers: 'Single Layer',
  roofPitch: '6/12',
  roofDripEdge: 'Metal - Damaged',

  roofDamages: 'Upon inspection, the roof exhibited multiple areas of hail impact damage to the composition shingles. Damage was observed on all slopes with concentrated impact on the south and west facing slopes. Granule loss, bruising, and cracked shingles were documented. The metal drip edge showed denting consistent with hail impact. Recommendation: Full roof replacement is warranted due to the extent of functional damage.',

  // Use exact template elevation names
  rightElevation: 'The right (west) elevation showed similar hail damage to siding. The exterior HVAC condenser unit sustained cosmetic damage to the fins. One exterior light fixture was cracked.',

  leftElevation: 'The left (east) elevation exhibited moderate hail damage to vinyl siding. A downspout was dented and partially detached from the gutter system.',

  rearElevation: 'The rear (north) elevation showed minor hail damage to siding. The wooden fence gate was damaged and requires replacement.',

  interiorDamages: 'No visible interior damages were observed during our inspection. The insured reported no leaks or water intrusion following the storm event.',

  otherStructuresDamage: 'The insured sustained damage to other structures including the wooden privacy fence along the west and south property lines. Multiple fence sections exhibited wind damage and will require replacement.',

  otherStructuresDetails: 'Wooden privacy fence - approximately 120 linear feet of fencing sustained wind damage with broken pickets and leaning posts. The fence gate at the rear of the property was damaged beyond repair.',

  contentsDamage: 'The insured did not sustain damage to contents or personal property.',

  // Use exact template names
  aleClaim: 'The risk did not become uninhabitable. Additional Living Expenses (ALE) / Fair Market Value (FMV) claims are not anticipated.',

  expertsInfo: 'No experts were retained or recommended for this loss.',

  officialReports: 'No official reports were provided or pending with this assignment.',

  subrogationPotential: 'None',
  subrogationParty: '',
  subrogationRemarks: 'Our investigation did not reveal any third-party liability or product defects; therefore, subrogation potential is not present at this time.',
  subrogation: 'Our investigation did not reveal any third-party liability or product defects; therefore, subrogation potential is not present at this time.',

  salvageInfo: 'An inspection of the damaged property determined that there is no viable salvage opportunities associated with this claim.',

  workToBeCompleted: '1. Review and approve the attached estimate for dwelling repairs.\n2. Issue payment for roof replacement and exterior repairs.\n3. Coordinate with insured for repair scheduling.',

  recommendation: 'Based on our inspection findings, we recommend approval of the claim for wind/hail damage repairs. The attached estimate details the scope of repairs required to restore the property to pre-loss condition. We recommend issuing an ACV payment for dwelling repairs pending completion and submission of contractor invoice for recoverable depreciation.',

  diaryDate: 'February 1, 2025',

  // Financial - use exact template names
  dwellingPrior: '$0',
  dwellingChange: '+$28,500',
  dwellingPaid: '$0',
  dwellingPayment: '$22,800',
  dwellingRemaining: '$5,700',

  otherStructuresLimit: '$35,000',
  otherStructuresPrior: '$0',
  otherStructuresChange: '+$4,200',
  otherStructuresPaid: '$0',
  otherStructuresPayment: '$3,360',
  otherStructuresRemaining: '$840',

  personalPropertyLimit: '$175,000',
  personalPropertyPrior: '$0',
  personalPropertyChange: '$0',
  personalPropertyPaid: '$0',
  personalPropertyPayment: '$0',
  personalPropertyRemaining: '$0',

  totalChange: '+$32,700',
  totalPaid: '$0',
  totalPayment: '$26,160',
  totalRemaining: '$6,540'
};

async function runTest() {
  console.log('='.repeat(60));
  console.log('FLACRONAI TEMPLATE PROCESSOR TEST');
  console.log('='.repeat(60));
  console.log('');

  console.log('1. Testing data transformation...');
  const transformedData = transformAIDataToTemplate(sampleAIData, sampleUserInput);
  console.log('   ✓ Data transformed successfully');
  console.log('   - Claim Number:', transformedData.claimNumber);
  console.log('   - Insured Name:', transformedData.insuredName);
  console.log('   - Has Roof Damage:', transformedData.hasRoofDamage);
  console.log('   - Has Subrogation:', transformedData.hasSubrogation);
  console.log('');

  console.log('2. Testing template processing...');
  const templatePath = path.join(__dirname, '../templates/CRU_Property_Report_Template.docx');

  if (!fs.existsSync(templatePath)) {
    console.log('   ✗ Template file not found at:', templatePath);
    console.log('   Please ensure the template is copied to the templates directory.');
    return;
  }
  console.log('   ✓ Template file found');

  const outputDocx = path.join(TEST_OUTPUT_DIR, 'test_report.docx');
  const outputPdf = path.join(TEST_OUTPUT_DIR, 'test_report.pdf');

  try {
    console.log('');
    console.log('3. Generating DOCX...');

    const result = await processTemplate(
      templatePath,
      transformedData,
      outputDocx,
      null,
      { strictValidation: false }
    );

    console.log('   ✓ DOCX generated successfully');
    console.log('   - Output path:', outputDocx);
    console.log('   - File size:', fs.statSync(outputDocx).size, 'bytes');

    console.log('');
    console.log('4. Attempting PDF conversion...');

    try {
      const pdfResult = await processTemplate(
        templatePath,
        transformedData,
        outputDocx,
        outputPdf,
        { strictValidation: false }
      );

      if (fs.existsSync(outputPdf)) {
        console.log('   ✓ PDF generated successfully');
        console.log('   - Output path:', outputPdf);
        console.log('   - File size:', fs.statSync(outputPdf).size, 'bytes');
      }
    } catch (pdfError) {
      console.log('   ⚠ PDF conversion failed (LibreOffice may not be installed)');
      console.log('   - Error:', pdfError.message);
      console.log('   - Note: DOCX was still generated successfully');
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('TEST COMPLETED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log('');
    console.log('Output files:');
    console.log('  DOCX:', outputDocx);
    if (fs.existsSync(outputPdf)) {
      console.log('  PDF:', outputPdf);
    }
    console.log('');
    console.log('You can open the DOCX file to verify the placeholders were replaced correctly.');

  } catch (error) {
    console.log('');
    console.log('✗ TEST FAILED');
    console.log('Error:', error.message);
    if (error.details) {
      console.log('Details:', JSON.stringify(error.details, null, 2));
    }
  }
}

runTest().catch(console.error);
