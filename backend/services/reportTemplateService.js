const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { processTemplate, TemplateValidationError } = require('../utils/templateProcessor');

const TEMPLATE_DIR = path.join(__dirname, '../templates');
const OUTPUT_DIR = path.join(__dirname, '../uploads');

const CRU_TEMPLATE_MAPPING = {
  REPORT_DATE: 'reportDate',
  ADJUSTER_NAME: 'adjusterName',
  CLAIM_NUMBER: 'claimNumber',
  POLICY_NUMBER: 'policyNumber',
  INSURED_NAME: 'insuredName',
  INSURED_PHONE: 'insuredPhone',
  INSURED_EMAIL: 'insuredEmail',
  LOSS_LOCATION: 'lossLocation',
  DATE_OF_LOSS: 'dateOfLoss',
  REPORT_TYPE: 'reportType',
  DATE_RECEIVED: 'dateReceived',
  DATE_CONTACTED: 'dateContacted',
  DATE_INSPECTED: 'dateInspected',
  CAUSE_OF_LOSS: 'causeOfLoss',
  PARTIES_PRESENT: 'partiesPresent',
  PROPERTY_DESCRIPTION: 'propertyDescription',
  REMARKS: 'remarks',
  RISK_DESCRIPTION: 'riskDescription',
  ITV_ASSESSMENT: 'itvAssessment',
  OCCURRENCE_DESCRIPTION: 'occurrenceDescription',
  COVERAGE_ASSESSMENT: 'coverageAssessment',
  DWELLING_DAMAGE: 'dwellingDamage',
  OTHER_STRUCTURES_DAMAGE: 'otherStructuresDamage',
  CONTENTS_DAMAGE: 'contentsDamage',
  ALE_FMV_CLAIM: 'aleFmvClaim',
  SUBROGATION_SALVAGE: 'subrogationSalvage',
  WORK_RECOMMENDATION: 'workRecommendation',
  LOSS_ORIGIN_DESCRIPTION: 'lossOriginDescription',
  ROOF_TYPE: 'roofType',
  ROOF_AGE: 'roofAge',
  ROOF_CONDITION: 'roofCondition',
  ROOF_LAYERS: 'roofLayers',
  ROOF_PITCH: 'roofPitch',
  ROOF_DRIP_EDGE: 'roofDripEdge',
  ROOF_DAMAGES: 'roofDamages',
  FRONT_ELEVATION_DAMAGES: 'frontElevationDamages',
  RIGHT_ELEVATION_DAMAGES: 'rightElevationDamages',
  LEFT_ELEVATION_DAMAGES: 'leftElevationDamages',
  REAR_ELEVATION_DAMAGES: 'rearElevationDamages',
  INTERIOR_DAMAGES: 'interiorDamages',
  OTHER_STRUCTURES_DETAILS: 'otherStructuresDetails',
  EXPERTS_SECTION: 'expertsSection',
  OFFICIAL_REPORTS: 'officialReports',
  SUBROGATION_POTENTIAL: 'subrogationPotential',
  SUBROGATION_PARTY: 'subrogationParty',
  SUBROGATION_REMARKS: 'subrogationRemarks',
  SALVAGE_ASSESSMENT: 'salvageAssessment',
  ACTION_PLAN: 'actionPlan',
  FINAL_RECOMMENDATION: 'finalRecommendation',
  DIARY_DATE: 'diaryDate',
  ATTACHMENTS_LIST: 'attachmentsList',
  DWELLING_LIMIT: 'dwellingLimit',
  DWELLING_PRIOR_RESERVE: 'dwellingPriorReserve',
  DWELLING_CHANGE: 'dwellingChange',
  DWELLING_PAID: 'dwellingPaid',
  DWELLING_PAYMENT_REQUEST: 'dwellingPaymentRequest',
  DWELLING_REMAINING: 'dwellingRemaining',
  OTHER_STRUCTURES_LIMIT: 'otherStructuresLimit',
  OTHER_STRUCTURES_PRIOR_RESERVE: 'otherStructuresPriorReserve',
  OTHER_STRUCTURES_CHANGE: 'otherStructuresChange',
  OTHER_STRUCTURES_PAID: 'otherStructuresPaid',
  OTHER_STRUCTURES_PAYMENT_REQUEST: 'otherStructuresPaymentRequest',
  OTHER_STRUCTURES_REMAINING: 'otherStructuresRemaining',
  PERSONAL_PROPERTY_LIMIT: 'personalPropertyLimit',
  PERSONAL_PROPERTY_PRIOR_RESERVE: 'personalPropertyPriorReserve',
  PERSONAL_PROPERTY_CHANGE: 'personalPropertyChange',
  PERSONAL_PROPERTY_PAID: 'personalPropertyPaid',
  PERSONAL_PROPERTY_PAYMENT_REQUEST: 'personalPropertyPaymentRequest',
  PERSONAL_PROPERTY_REMAINING: 'personalPropertyRemaining',
  TOTAL_LIMIT: 'totalLimit',
  TOTAL_PRIOR_RESERVE: 'totalPriorReserve',
  TOTAL_CHANGE: 'totalChange',
  TOTAL_PAID: 'totalPaid',
  TOTAL_PAYMENT_REQUEST: 'totalPaymentRequest',
  TOTAL_REMAINING: 'totalRemaining'
};

function getDefaultValues() {
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // These placeholder names MUST match exactly what's in the CRU template
  return {
    // Header & Basic Info
    reportDate: today,
    insuredName: '',
    insuredPhone: '',
    insuredEmail: '',
    riskAddress: '',
    causeOfLoss: '',
    reportType: 'Initial Inspection',
    dateReceived: '',
    dateContacted: '',
    dateInspected: '',
    propertyDescription: '',

    // Main content sections - EXACT template placeholder names
    remarks: '',
    risk: '',  // Template uses {risk} not {riskDescription}
    itv: 'The limit of insurance appears adequate based on the size, construction quality, and occupancy type.',  // Template uses {itv}
    occurrence: '',  // Template uses {occurrence}
    coverage: 'The risk is insured with the above stated limits, policy forms, and deductible. All aspects pertaining to coverage are submitted for the carrier\'s review and final disposition.',  // Template uses {coverage}

    // Damage sections
    dwellingDamage: '',
    otherStructuresDamage: 'The insured did not sustain damage to other structures.',
    otherStructuresDetails: 'No other structures were affected.',
    contentsDamage: 'The insured did not sustain damage to contents or personal property.',

    // ALE / Subrogation / Salvage
    aleClaim: 'The risk did not become uninhabitable. Additional Living Expenses (ALE) / Fair Market Value (FMV) claims are not anticipated.',  // Template uses {aleClaim}
    subrogation: 'Our investigation did not reveal any third-party liability or product defects; therefore, subrogation potential is not present at this time.',  // Template uses {subrogation}
    subrogationPotential: 'None',
    subrogationParty: '',
    subrogationRemarks: 'Our investigation did not reveal any third-party liability or product defects.',
    salvageInfo: 'An inspection of the damaged property determined that there is no viable salvage opportunities associated with this claim.',  // Template uses {salvageInfo}

    // Work & Recommendations
    workToBeCompleted: '',  // Template uses {workToBeCompleted}
    recommendation: '',  // Template uses {recommendation}

    // Loss origin
    lossOriginDetails: '',  // Template uses {lossOriginDetails}

    // Roof details
    roofType: 'N/A',
    roofAge: 'N/A',
    roofCondition: 'N/A',
    roofLayers: 'N/A',
    roofPitch: 'N/A',
    roofDripEdge: 'N/A',
    roofDamages: 'No visible / related damages were observed to the roof during our inspection.',

    // Elevation damages - Template uses shorter names
    rightElevation: 'No visible / related damages were observed to the Right Elevation during our inspection.',
    leftElevation: 'No visible / related damages were observed to the Left Elevation during our inspection.',
    rearElevation: 'No visible / related damages were observed to the Rear Elevation during our inspection.',
    interiorDamages: 'No visible / related damages were observed to the interior during our inspection.',

    // Experts & Reports
    expertsInfo: 'No experts were retained or recommended for this loss.',  // Template uses {expertsInfo}
    officialReports: 'No official reports were provided or pending with this assignment.',
    ownershipInfo: '',  // Template uses {ownershipInfo}

    // Diary
    diaryDate: '',

    // Financial table - Template uses shorter names
    dwellingPrior: '',
    dwellingChange: '',
    dwellingPaid: '',
    dwellingPayment: '',
    dwellingRemaining: '',

    otherStructuresLimit: '',
    otherStructuresPrior: '',
    otherStructuresChange: '',
    otherStructuresPaid: '',
    otherStructuresPayment: '',
    otherStructuresRemaining: '',

    personalPropertyLimit: '',
    personalPropertyPrior: '',
    personalPropertyChange: '',
    personalPropertyPaid: '',
    personalPropertyPayment: '',
    personalPropertyRemaining: '',

    totalLimit: '',
    totalPrior: '',
    totalChange: '',
    totalPaid: '',
    totalPayment: '',
    totalRemaining: '',

    // Attachments loop
    attachments: [{ attachmentName: 'Photo Report' }],

    // Parties present loop
    partiesPresent: [],

    // Conditional flags
    hasRoofDamage: false,
    hasExteriorDamage: false,
    hasInteriorDamage: false,
    hasOtherStructures: false,
    hasContents: false,
    hasAle: false,
    hasSubrogation: false,
    hasSalvage: false,
    hasExperts: false,

    // Include flags for sections
    includeRoof: true,
    includeExterior: true,
    includeOtherStructures: true,
    hasDiaryDate: false,
    actionItems: []
  };
}

/**
 * Parse raw AI-generated content text into structured sections
 * This extracts sections from the free-form AI text and maps them to template fields
 */
function parseAIContentToStructured(aiContent) {
  if (!aiContent || typeof aiContent !== 'string') {
    return {};
  }

  const structured = {};
  const lines = aiContent.split('\n');
  let currentSection = '';
  let currentContent = [];

  // Section mappings from AI output to EXACT template placeholder names
  // Maps various AI output header formats to exact template placeholder names
  const sectionMappings = {
    // Main sections
    'REMARKS': 'remarks',
    'RISK': 'risk',  // Template uses {risk}
    'ITV': 'itv',  // Template uses {itv}
    'INSURANCE TO VALUE': 'itv',
    'OCCURRENCE': 'occurrence',  // Template uses {occurrence}
    'COVERAGE': 'coverage',  // Template uses {coverage}

    // Damage sections
    'DWELLING DAMAGE': 'dwellingDamage',
    'DWELLING': 'dwellingDamage',
    'OTHER STRUCTURES DAMAGE': 'otherStructuresDamage',
    'OTHER STRUCTURES': 'otherStructuresDetails',
    'CONTENTS DAMAGE': 'contentsDamage',
    'CONTENTS': 'contentsDamage',
    'DAMAGES': 'dwellingDamage',

    // ALE / Subrogation / Salvage - handle multiple formats
    'ALE': 'aleClaim',  // Template uses {aleClaim}
    'ALE / FMV': 'aleClaim',
    'ALE / FMV CLAIM': 'aleClaim',
    'ALE/FMV': 'aleClaim',
    'ALE/FMV CLAIM': 'aleClaim',
    'SUBROGATION': 'subrogation',  // Template uses {subrogation}
    'SUBROGATION / SALVAGE': 'subrogation',
    'SUBROGATION/SALVAGE': 'subrogation',
    'SALVAGE': 'salvageInfo',  // Template uses {salvageInfo}

    // Work & Recommendations - handle multiple formats
    'WORK TO BE COMPLETED': 'workToBeCompleted',  // Template uses {workToBeCompleted}
    'RECOMMENDATION': 'recommendation',  // Template uses {recommendation}
    'RECOMMENDATIONS': 'recommendation',
    'WORK TO BE COMPLETED / RECOMMENDATION': 'workToBeCompleted',
    'WORK TO BE COMPLETED/RECOMMENDATION': 'workToBeCompleted',
    'ACTION PLAN': 'workToBeCompleted',
    'ACTION PLAN / PENDING ITEMS': 'workToBeCompleted',
    'ACTION PLAN/PENDING ITEMS': 'workToBeCompleted',
    'PENDING ITEMS': 'workToBeCompleted',

    // Loss, Experts, Reports
    'LOSS AND ORIGIN': 'lossOriginDetails',  // Template uses {lossOriginDetails}
    'LOSS ORIGIN': 'lossOriginDetails',
    'EXPERTS': 'expertsInfo',  // Template uses {expertsInfo}
    'OFFICIAL REPORTS': 'officialReports',
    'DIARY DATE': 'diaryDate',

    // Assignment & Contact info
    'ASSIGNMENT': 'remarks',
    'INSURED': 'contactInfo',

    // Ownership
    'OWNERSHIP': 'ownershipInfo',  // Template uses {ownershipInfo}
    'OWNERSHIP / INSURABLE INTEREST': 'ownershipInfo',
    'OWNERSHIP/INSURABLE INTEREST': 'ownershipInfo',
    'INSURABLE INTEREST': 'ownershipInfo',

    // Roof and Elevations
    'ROOF': 'roofDamages',
    'ROOF DAMAGE': 'roofDamages',
    'EXTERIOR': 'rightElevation',
    'PROPERTY DESCRIPTION': 'propertyDescription',
    'FRONT ELEVATION': 'rightElevation',
    'RIGHT ELEVATION': 'rightElevation',
    'LEFT ELEVATION': 'leftElevation',
    'REAR ELEVATION': 'rearElevation',
    'INTERIOR': 'interiorDamages',
    'INTERIOR DAMAGES': 'interiorDamages'
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines or separators
    if (!trimmed || trimmed === '---' || trimmed === '___') {
      if (currentContent.length > 0) {
        currentContent.push('');
      }
      continue;
    }

    // Remove markdown formatting and parenthetical notes
    const cleanedLine = trimmed
      .replace(/^\*\*|\*\*$/g, '')  // Remove bold markdown
      .replace(/^##\s*/, '')         // Remove ## header prefix
      .replace(/\s*\([^)]*\)\s*/g, ' ')  // Remove parenthetical notes like (Insurance to Value)
      .trim();

    // Check if this is a section header
    const upperLine = cleanedLine.toUpperCase().replace(/:$/, '').trim();

    if (sectionMappings[upperLine]) {
      // Save previous section
      if (currentSection && currentContent.length > 0) {
        const contentText = currentContent.join('\n').trim();
        if (contentText && !structured[currentSection]) {
          structured[currentSection] = contentText;
        }
      }

      // Start new section
      currentSection = sectionMappings[upperLine];
      currentContent = [];
    } else if (currentSection) {
      // Add content to current section
      currentContent.push(trimmed);
    }
  }

  // Save last section
  if (currentSection && currentContent.length > 0) {
    const contentText = currentContent.join('\n').trim();
    if (contentText && !structured[currentSection]) {
      structured[currentSection] = contentText;
    }
  }

  // ============================================
  // EXTRACT FINANCIAL/RESERVE VALUES FROM AI OUTPUT
  // ============================================
  // Look for reserve table or monetary values in the content
  const extractCurrencyValue = (text, patterns) => {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        // Extract the dollar amount
        const amountMatch = match[0].match(/\$[\d,]+(?:\.\d{2})?/);
        if (amountMatch) {
          return amountMatch[0];
        }
      }
    }
    return null;
  };

  // Search through all content for reserve values
  const fullContent = aiContent.toUpperCase();
  const originalContent = aiContent;

  // Patterns to find dwelling reserve/change values
  const dwellingPatterns = [
    /DWELLING[^$]*(\$[\d,]+(?:\.\d{2})?)/gi,
    /DWELLING\s*(?:DAMAGE|RESERVE|CHANGE|LIMIT)[^$]*(\$[\d,]+(?:\.\d{2})?)/gi
  ];

  const otherStructuresPatterns = [
    /OTHER\s*STRUCTURES[^$]*(\$[\d,]+(?:\.\d{2})?)/gi
  ];

  const personalPropertyPatterns = [
    /PERSONAL\s*PROPERTY[^$]*(\$[\d,]+(?:\.\d{2})?)/gi,
    /CONTENTS[^$]*(\$[\d,]+(?:\.\d{2})?)/gi
  ];

  // Try to extract values from table format (pipe-separated)
  const tableRowPattern = /\|\s*([^|]+)\s*\|\s*(\$[\d,]+(?:\.\d{2})?)\s*\|\s*(\$[\d,]+(?:\.\d{2})?)\s*\|\s*(\$[\d,]+(?:\.\d{2})?)\s*\|\s*(\$[\d,]+(?:\.\d{2})?)\s*\|/gi;
  let tableMatch;
  while ((tableMatch = tableRowPattern.exec(originalContent)) !== null) {
    const rowName = tableMatch[1].trim().toLowerCase();
    const limit = tableMatch[2];
    const prior = tableMatch[3];
    const change = tableMatch[4];
    const remaining = tableMatch[5];

    if (rowName.includes('dwelling') && !rowName.includes('other')) {
      structured.dwellingLimit = limit;
      structured.dwellingPrior = prior;
      structured.dwellingChange = change;
      structured.dwellingRemaining = remaining;
    } else if (rowName.includes('other') && rowName.includes('structure')) {
      structured.otherStructuresLimit = limit;
      structured.otherStructuresPrior = prior;
      structured.otherStructuresChange = change;
      structured.otherStructuresRemaining = remaining;
    } else if (rowName.includes('personal') || rowName.includes('property') || rowName.includes('content')) {
      structured.personalPropertyLimit = limit;
      structured.personalPropertyPrior = prior;
      structured.personalPropertyChange = change;
      structured.personalPropertyRemaining = remaining;
    }
  }

  // If no table found, try to extract from narrative text
  if (!structured.dwellingChange) {
    // Look for patterns like "Dwelling: $X" or "estimated at $X"
    const dwellingMatch = originalContent.match(/dwelling[^$\n]*\$[\d,]+(?:\.\d{2})?/i);
    if (dwellingMatch) {
      const amount = dwellingMatch[0].match(/\$[\d,]+(?:\.\d{2})?/);
      if (amount) structured.dwellingChange = amount[0];
    }
  }

  // Look for total estimate values
  const totalEstimatePatterns = [
    /total\s*(?:estimate|damage|loss|reserve)[^$]*(\$[\d,]+(?:\.\d{2})?)/i,
    /estimated\s*(?:total|loss|damage)[^$]*(\$[\d,]+(?:\.\d{2})?)/i,
    /reserve[^$]*(\$[\d,]+(?:\.\d{2})?)/i
  ];

  for (const pattern of totalEstimatePatterns) {
    const match = originalContent.match(pattern);
    if (match && match[1] && !structured.dwellingChange) {
      // If we found a total but no dwelling breakdown, use it as dwelling change
      structured.dwellingChange = match[1];
      break;
    }
  }

  return structured;
}

function transformAIDataToTemplate(aiGeneratedData, userInputData) {
  const defaults = getDefaultValues();
  const merged = { ...defaults };

  // Map user input data to EXACT template placeholder names
  if (userInputData) {
    if (userInputData.insuredName) merged.insuredName = userInputData.insuredName;
    if (userInputData.insuredPhone) merged.insuredPhone = userInputData.insuredPhone;
    if (userInputData.insuredEmail) merged.insuredEmail = userInputData.insuredEmail;
    if (userInputData.claimNumber) merged.claimNumber = userInputData.claimNumber;
    if (userInputData.propertyAddress) {
      merged.riskAddress = userInputData.propertyAddress;
      merged.lossLocation = userInputData.propertyAddress;
    }
    if (userInputData.lossDate) merged.dateOfLoss = userInputData.lossDate;
    if (userInputData.lossType) merged.causeOfLoss = userInputData.lossType;
    if (userInputData.reportType) merged.reportType = userInputData.reportType;
    if (userInputData.dateReceived) merged.dateReceived = userInputData.dateReceived;
    if (userInputData.dateContacted) merged.dateContacted = userInputData.dateContacted;
    if (userInputData.dateInspected) merged.dateInspected = userInputData.dateInspected;
    if (userInputData.propertyDescription) merged.propertyDescription = userInputData.propertyDescription;
    if (userInputData.propertyDetails) merged.propertyDescription = userInputData.propertyDetails;

    // Map lossDescription to occurrence (exact template field name)
    if (userInputData.lossDescription) merged.occurrence = userInputData.lossDescription;
    // Map damages to dwellingDamage
    if (userInputData.damages) merged.dwellingDamage = userInputData.damages;
    // Map recommendations to both fields
    if (userInputData.recommendations) {
      merged.recommendation = userInputData.recommendations;
      merged.workToBeCompleted = userInputData.recommendations;
    }

    // Financial fields
    if (userInputData.dwellingLimit) merged.dwellingLimit = userInputData.dwellingLimit;
    if (userInputData.otherStructuresLimit) merged.otherStructuresLimit = userInputData.otherStructuresLimit;
    if (userInputData.personalPropertyLimit) merged.personalPropertyLimit = userInputData.personalPropertyLimit;
  }

  // Map AI-generated data to EXACT template placeholder names
  if (aiGeneratedData) {
    // Main sections - use exact template names
    if (aiGeneratedData.remarks) merged.remarks = aiGeneratedData.remarks;
    if (aiGeneratedData.risk) merged.risk = aiGeneratedData.risk;
    if (aiGeneratedData.itv) merged.itv = aiGeneratedData.itv;
    if (aiGeneratedData.occurrence) merged.occurrence = aiGeneratedData.occurrence;
    if (aiGeneratedData.coverage) merged.coverage = aiGeneratedData.coverage;

    // Damage sections
    if (aiGeneratedData.dwellingDamage) merged.dwellingDamage = aiGeneratedData.dwellingDamage;
    if (aiGeneratedData.otherStructuresDamage) merged.otherStructuresDamage = aiGeneratedData.otherStructuresDamage;
    if (aiGeneratedData.otherStructuresDetails) merged.otherStructuresDetails = aiGeneratedData.otherStructuresDetails;
    if (aiGeneratedData.contentsDamage) merged.contentsDamage = aiGeneratedData.contentsDamage;

    // ALE / Subrogation / Salvage - exact template names
    if (aiGeneratedData.aleClaim) merged.aleClaim = aiGeneratedData.aleClaim;
    if (aiGeneratedData.subrogation) merged.subrogation = aiGeneratedData.subrogation;
    if (aiGeneratedData.salvageInfo) merged.salvageInfo = aiGeneratedData.salvageInfo;
    if (aiGeneratedData.subrogationPotential) merged.subrogationPotential = aiGeneratedData.subrogationPotential;
    if (aiGeneratedData.subrogationParty) merged.subrogationParty = aiGeneratedData.subrogationParty;
    if (aiGeneratedData.subrogationRemarks) merged.subrogationRemarks = aiGeneratedData.subrogationRemarks;

    // Work & Recommendations - exact template names
    if (aiGeneratedData.workToBeCompleted) merged.workToBeCompleted = aiGeneratedData.workToBeCompleted;
    if (aiGeneratedData.recommendation) merged.recommendation = aiGeneratedData.recommendation;

    // Loss origin - exact template name
    if (aiGeneratedData.lossOriginDetails) merged.lossOriginDetails = aiGeneratedData.lossOriginDetails;

    // Roof details
    if (aiGeneratedData.roofDamages) merged.roofDamages = aiGeneratedData.roofDamages;
    if (aiGeneratedData.roofType) merged.roofType = aiGeneratedData.roofType;
    if (aiGeneratedData.roofAge) merged.roofAge = aiGeneratedData.roofAge;
    if (aiGeneratedData.roofCondition) merged.roofCondition = aiGeneratedData.roofCondition;
    if (aiGeneratedData.roofLayers) merged.roofLayers = aiGeneratedData.roofLayers;
    if (aiGeneratedData.roofPitch) merged.roofPitch = aiGeneratedData.roofPitch;
    if (aiGeneratedData.roofDripEdge) merged.roofDripEdge = aiGeneratedData.roofDripEdge;

    // Elevations - exact template names
    if (aiGeneratedData.rightElevation) merged.rightElevation = aiGeneratedData.rightElevation;
    if (aiGeneratedData.leftElevation) merged.leftElevation = aiGeneratedData.leftElevation;
    if (aiGeneratedData.rearElevation) merged.rearElevation = aiGeneratedData.rearElevation;
    if (aiGeneratedData.interiorDamages) merged.interiorDamages = aiGeneratedData.interiorDamages;

    // Experts & Reports - exact template names
    if (aiGeneratedData.expertsInfo) merged.expertsInfo = aiGeneratedData.expertsInfo;
    if (aiGeneratedData.officialReports) merged.officialReports = aiGeneratedData.officialReports;
    if (aiGeneratedData.ownershipInfo) merged.ownershipInfo = aiGeneratedData.ownershipInfo;

    // Diary
    if (aiGeneratedData.diaryDate) {
      merged.diaryDate = aiGeneratedData.diaryDate;
      merged.hasDiaryDate = true;
    }

    // Financial - Map all extracted reserve values
    // Dwelling
    if (aiGeneratedData.dwellingLimit) merged.dwellingLimit = aiGeneratedData.dwellingLimit;
    if (aiGeneratedData.dwellingPrior) merged.dwellingPrior = aiGeneratedData.dwellingPrior;
    if (aiGeneratedData.dwellingChange) merged.dwellingChange = aiGeneratedData.dwellingChange;
    if (aiGeneratedData.dwellingPaid) merged.dwellingPaid = aiGeneratedData.dwellingPaid;
    if (aiGeneratedData.dwellingPayment) merged.dwellingPayment = aiGeneratedData.dwellingPayment;
    if (aiGeneratedData.dwellingRemaining) merged.dwellingRemaining = aiGeneratedData.dwellingRemaining;

    // Other Structures
    if (aiGeneratedData.otherStructuresLimit) merged.otherStructuresLimit = aiGeneratedData.otherStructuresLimit;
    if (aiGeneratedData.otherStructuresPrior) merged.otherStructuresPrior = aiGeneratedData.otherStructuresPrior;
    if (aiGeneratedData.otherStructuresChange) merged.otherStructuresChange = aiGeneratedData.otherStructuresChange;
    if (aiGeneratedData.otherStructuresPaid) merged.otherStructuresPaid = aiGeneratedData.otherStructuresPaid;
    if (aiGeneratedData.otherStructuresPayment) merged.otherStructuresPayment = aiGeneratedData.otherStructuresPayment;
    if (aiGeneratedData.otherStructuresRemaining) merged.otherStructuresRemaining = aiGeneratedData.otherStructuresRemaining;

    // Personal Property
    if (aiGeneratedData.personalPropertyLimit) merged.personalPropertyLimit = aiGeneratedData.personalPropertyLimit;
    if (aiGeneratedData.personalPropertyPrior) merged.personalPropertyPrior = aiGeneratedData.personalPropertyPrior;
    if (aiGeneratedData.personalPropertyChange) merged.personalPropertyChange = aiGeneratedData.personalPropertyChange;
    if (aiGeneratedData.personalPropertyPaid) merged.personalPropertyPaid = aiGeneratedData.personalPropertyPaid;
    if (aiGeneratedData.personalPropertyPayment) merged.personalPropertyPayment = aiGeneratedData.personalPropertyPayment;
    if (aiGeneratedData.personalPropertyRemaining) merged.personalPropertyRemaining = aiGeneratedData.personalPropertyRemaining;
  }

  // Set conditional flags
  merged.hasRoofDamage = merged.roofDamages && !merged.roofDamages.includes('No visible');
  merged.hasExteriorDamage = (merged.rightElevation && !merged.rightElevation.includes('No visible')) ||
    (merged.leftElevation && !merged.leftElevation.includes('No visible')) ||
    (merged.rearElevation && !merged.rearElevation.includes('No visible'));
  merged.hasInteriorDamage = merged.interiorDamages && !merged.interiorDamages.includes('No visible');
  merged.hasOtherStructures = merged.otherStructuresDamage && !merged.otherStructuresDamage.includes('did not sustain');
  merged.hasContents = merged.contentsDamage && !merged.contentsDamage.includes('did not sustain');
  merged.hasAle = merged.aleClaim && !merged.aleClaim.includes('did not become');
  merged.hasSubrogation = merged.subrogationPotential && merged.subrogationPotential.toLowerCase() !== 'none';
  merged.hasSalvage = merged.salvageInfo && !merged.salvageInfo.includes('no viable salvage');
  merged.hasExperts = merged.expertsInfo && !merged.expertsInfo.includes('No experts');
  merged.hasDiaryDate = !!merged.diaryDate;

  // ============================================
  // FALLBACK: ESTIMATE RESERVES BASED ON LOSS TYPE
  // ============================================
  // If no financial values were provided, generate estimates based on loss type
  const hasFinancialData = merged.dwellingLimit || merged.dwellingChange || merged.dwellingPrior;

  if (!hasFinancialData && merged.causeOfLoss) {
    const lossType = (merged.causeOfLoss || '').toLowerCase();
    let estimatedDwellingChange = 0;
    let estimatedDwellingLimit = 250000; // Default dwelling coverage

    // Estimate based on loss type
    if (lossType.includes('water') || lossType.includes('flood') || lossType.includes('pipe')) {
      estimatedDwellingChange = 12500; // Average water damage claim
    } else if (lossType.includes('fire') || lossType.includes('smoke')) {
      estimatedDwellingChange = 45000; // Average fire damage claim
    } else if (lossType.includes('wind') || lossType.includes('storm') || lossType.includes('hail')) {
      estimatedDwellingChange = 15000; // Average wind/hail damage claim
    } else if (lossType.includes('theft') || lossType.includes('burglary')) {
      estimatedDwellingChange = 5000; // Average theft claim
    } else if (lossType.includes('vandalism')) {
      estimatedDwellingChange = 3500; // Average vandalism claim
    } else if (lossType.includes('mold')) {
      estimatedDwellingChange = 8000; // Average mold remediation
    } else {
      estimatedDwellingChange = 10000; // Default estimate
    }

    // Set estimated values
    merged.dwellingLimit = '$' + estimatedDwellingLimit.toLocaleString('en-US', { minimumFractionDigits: 2 });
    merged.dwellingPrior = '$0.00';
    merged.dwellingChange = '$' + estimatedDwellingChange.toLocaleString('en-US', { minimumFractionDigits: 2 });

    // Other structures = 10% of dwelling
    merged.otherStructuresLimit = '$' + (estimatedDwellingLimit * 0.1).toLocaleString('en-US', { minimumFractionDigits: 2 });
    merged.otherStructuresPrior = '$0.00';
    merged.otherStructuresChange = '$0.00';

    // Personal property = 50% of dwelling
    merged.personalPropertyLimit = '$' + (estimatedDwellingLimit * 0.5).toLocaleString('en-US', { minimumFractionDigits: 2 });
    merged.personalPropertyPrior = '$0.00';
    merged.personalPropertyChange = '$0.00';
  }

  // ============================================
  // FINANCIAL TABLE CALCULATIONS
  // ============================================
  // Helper to parse currency/number strings to float
  const parseAmount = (val) => {
    if (!val || val === '') return 0;
    // Remove currency symbols, commas, and spaces
    const cleaned = String(val).replace(/[$,\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  // Helper to format number as currency
  const formatCurrency = (num) => {
    if (num === 0) return '';
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Parse all financial values
  const dwelling = {
    limit: parseAmount(merged.dwellingLimit),
    prior: parseAmount(merged.dwellingPrior),
    change: parseAmount(merged.dwellingChange),
    paid: parseAmount(merged.dwellingPaid),
    payment: parseAmount(merged.dwellingPayment)
  };

  const otherStructures = {
    limit: parseAmount(merged.otherStructuresLimit),
    prior: parseAmount(merged.otherStructuresPrior),
    change: parseAmount(merged.otherStructuresChange),
    paid: parseAmount(merged.otherStructuresPaid),
    payment: parseAmount(merged.otherStructuresPayment)
  };

  const personalProperty = {
    limit: parseAmount(merged.personalPropertyLimit),
    prior: parseAmount(merged.personalPropertyPrior),
    change: parseAmount(merged.personalPropertyChange),
    paid: parseAmount(merged.personalPropertyPaid),
    payment: parseAmount(merged.personalPropertyPayment)
  };

  // Calculate remaining reserves for each coverage
  // Remaining = Prior Reserve + Change - Paid (or simpler: current reserve after adjustments)
  dwelling.remaining = dwelling.prior + dwelling.change - dwelling.paid;
  otherStructures.remaining = otherStructures.prior + otherStructures.change - otherStructures.paid;
  personalProperty.remaining = personalProperty.prior + personalProperty.change - personalProperty.paid;

  // Calculate totals
  const totals = {
    limit: dwelling.limit + otherStructures.limit + personalProperty.limit,
    prior: dwelling.prior + otherStructures.prior + personalProperty.prior,
    change: dwelling.change + otherStructures.change + personalProperty.change,
    paid: dwelling.paid + otherStructures.paid + personalProperty.paid,
    payment: dwelling.payment + otherStructures.payment + personalProperty.payment,
    remaining: dwelling.remaining + otherStructures.remaining + personalProperty.remaining
  };

  // Update merged with calculated values (only if there's actual data)
  if (dwelling.limit > 0 || dwelling.prior > 0 || dwelling.change > 0) {
    merged.dwellingLimit = formatCurrency(dwelling.limit) || merged.dwellingLimit;
    merged.dwellingPrior = formatCurrency(dwelling.prior) || merged.dwellingPrior;
    merged.dwellingChange = formatCurrency(dwelling.change) || merged.dwellingChange;
    merged.dwellingPaid = formatCurrency(dwelling.paid) || merged.dwellingPaid;
    merged.dwellingPayment = formatCurrency(dwelling.payment) || merged.dwellingPayment;
    merged.dwellingRemaining = formatCurrency(dwelling.remaining);
  }

  if (otherStructures.limit > 0 || otherStructures.prior > 0 || otherStructures.change > 0) {
    merged.otherStructuresLimit = formatCurrency(otherStructures.limit) || merged.otherStructuresLimit;
    merged.otherStructuresPrior = formatCurrency(otherStructures.prior) || merged.otherStructuresPrior;
    merged.otherStructuresChange = formatCurrency(otherStructures.change) || merged.otherStructuresChange;
    merged.otherStructuresPaid = formatCurrency(otherStructures.paid) || merged.otherStructuresPaid;
    merged.otherStructuresPayment = formatCurrency(otherStructures.payment) || merged.otherStructuresPayment;
    merged.otherStructuresRemaining = formatCurrency(otherStructures.remaining);
  }

  if (personalProperty.limit > 0 || personalProperty.prior > 0 || personalProperty.change > 0) {
    merged.personalPropertyLimit = formatCurrency(personalProperty.limit) || merged.personalPropertyLimit;
    merged.personalPropertyPrior = formatCurrency(personalProperty.prior) || merged.personalPropertyPrior;
    merged.personalPropertyChange = formatCurrency(personalProperty.change) || merged.personalPropertyChange;
    merged.personalPropertyPaid = formatCurrency(personalProperty.paid) || merged.personalPropertyPaid;
    merged.personalPropertyPayment = formatCurrency(personalProperty.payment) || merged.personalPropertyPayment;
    merged.personalPropertyRemaining = formatCurrency(personalProperty.remaining);
  }

  // Always calculate totals if any values exist
  if (totals.limit > 0 || totals.prior > 0 || totals.change > 0) {
    merged.totalLimit = formatCurrency(totals.limit);
    merged.totalPrior = formatCurrency(totals.prior);
    merged.totalChange = formatCurrency(totals.change);
    merged.totalPaid = formatCurrency(totals.paid);
    merged.totalPayment = formatCurrency(totals.payment);
    merged.totalRemaining = formatCurrency(totals.remaining);
  }

  return merged;
}

async function generateReportFromTemplate(templatePath, aiData, userInputData, userId, reportId) {
  if (!fs.existsSync(TEMPLATE_DIR)) {
    fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
  }

  const resolvedTemplatePath = templatePath || path.join(TEMPLATE_DIR, 'CRU_Property_Report_Template.docx');

  if (!fs.existsSync(resolvedTemplatePath)) {
    throw new TemplateValidationError('Template file not found', { path: resolvedTemplatePath });
  }

  const templateData = transformAIDataToTemplate(aiData, userInputData);

  const outputId = reportId || uuidv4();
  const userOutputDir = path.join(OUTPUT_DIR, userId, 'reports', outputId);

  if (!fs.existsSync(userOutputDir)) {
    fs.mkdirSync(userOutputDir, { recursive: true });
  }

  const outputDocxPath = path.join(userOutputDir, `report_${outputId}.docx`);
  const outputPdfPath = path.join(userOutputDir, `report_${outputId}.pdf`);

  const result = await processTemplate(
    resolvedTemplatePath,
    templateData,
    outputDocxPath,
    outputPdfPath,
    { strictValidation: false }
  );

  return {
    success: true,
    reportId: outputId,
    docxPath: result.docxPath,
    pdfPath: result.pdfPath,
    docxUrl: `/uploads/${userId}/reports/${outputId}/report_${outputId}.docx`,
    pdfUrl: `/uploads/${userId}/reports/${outputId}/report_${outputId}.pdf`
  };
}

module.exports = {
  generateReportFromTemplate,
  transformAIDataToTemplate,
  parseAIContentToStructured,
  getDefaultValues,
  CRU_TEMPLATE_MAPPING,
  TEMPLATE_DIR,
  OUTPUT_DIR
};
