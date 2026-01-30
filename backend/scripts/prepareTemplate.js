const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const PLACEHOLDER_MAP = {
  "Today's Date": "{reportDate}",
  "Client Adjusters Name (Can be found in Workstation under the \"Loss Summary\" tab then the \"Custom Fields\" group.": "{adjusterName}",
  "(Found under Loss Summary Tab in Workstation)": "",
  "Choose an item": "{reportType}",
  "Date Received": "{dateReceived}",
  "Date Contacted": "{dateContacted}",
  "Date Inspected": "{dateInspected}",
  "Insured's Name": "{insuredName}",
  "(XXX) XXX-XXXX": "{insuredPhone}",
  "John@gmail.com": "{insuredEmail}",
  "Risk Address": "{lossLocation}",
  "Choose a date": "{dateOfLoss}",
  "Cause of Loss": "{causeOfLoss}"
};

function updateTemplatePlaceholders(inputPath, outputPath) {
  const content = fs.readFileSync(inputPath);
  const zip = new PizZip(content);

  const docXml = zip.file('word/document.xml');
  if (!docXml) {
    console.error('Could not find document.xml in template');
    return;
  }

  let xmlContent = docXml.asText();

  for (const [original, replacement] of Object.entries(PLACEHOLDER_MAP)) {
    if (replacement) {
      const regex = new RegExp(escapeRegExp(original), 'g');
      xmlContent = xmlContent.replace(regex, replacement);
    }
  }

  zip.file('word/document.xml', xmlContent);

  const outputBuffer = zip.generate({ type: 'nodebuffer' });
  fs.writeFileSync(outputPath, outputBuffer);

  console.log('Template updated successfully:', outputPath);
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const templateDir = path.join(__dirname, '../templates');
const inputPath = path.join(templateDir, 'CRU_Property_Report_Template.docx');
const outputPath = path.join(templateDir, 'CRU_Property_Report_Template_Prepared.docx');

if (fs.existsSync(inputPath)) {
  updateTemplatePlaceholders(inputPath, outputPath);
} else {
  console.error('Template file not found:', inputPath);
}
