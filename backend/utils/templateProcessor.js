const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const libre = require('libreoffice-convert');
const util = require('util');

const libreConvert = util.promisify(libre.convert);

class TemplateValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'TemplateValidationError';
    this.details = details;
  }
}

class TemplateProcessor {
  constructor(templatePath) {
    if (!fs.existsSync(templatePath)) {
      throw new TemplateValidationError('Template file not found', { path: templatePath });
    }
    this.templatePath = templatePath;
    this.templateBuffer = fs.readFileSync(templatePath);
  }

  extractPlaceholders(content) {
    const placeholders = new Set();
    const simplePattern = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
    const sectionStartPattern = /\{#([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
    const sectionEndPattern = /\{\/([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
    const invertedSectionPattern = /\{\^([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

    let match;
    while ((match = simplePattern.exec(content)) !== null) {
      placeholders.add(match[1]);
    }
    while ((match = sectionStartPattern.exec(content)) !== null) {
      placeholders.add(match[1]);
    }
    while ((match = invertedSectionPattern.exec(content)) !== null) {
      placeholders.add(match[1]);
    }

    return placeholders;
  }

  validateSectionBlocks(content) {
    const openSections = [];
    const errors = [];
    const combinedPattern = /\{([#^\/])([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

    let match;
    while ((match = combinedPattern.exec(content)) !== null) {
      const [fullMatch, type, name] = match;
      if (type === '#' || type === '^') {
        openSections.push({ type, name, position: match.index });
      } else if (type === '/') {
        if (openSections.length === 0) {
          errors.push(`Closing tag {/${name}} without matching opening tag at position ${match.index}`);
        } else {
          const last = openSections.pop();
          if (last.name !== name) {
            errors.push(`Mismatched section tags: opened {${last.type}${last.name}} but closed {/${name}}`);
          }
        }
      }
    }

    for (const section of openSections) {
      errors.push(`Unclosed section tag {${section.type}${section.name}} at position ${section.position}`);
    }

    if (errors.length > 0) {
      throw new TemplateValidationError('Malformed conditional blocks', { errors });
    }
  }

  flattenKeys(obj, prefix = '') {
    const keys = new Set();
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      keys.add(prefix ? key : fullKey);
      if (!prefix) {
        keys.add(key);
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const nestedKeys = this.flattenKeys(value, fullKey);
        nestedKeys.forEach(k => keys.add(k));
      } else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
        keys.add(key);
        const nestedKeys = this.flattenKeys(value[0], '');
        nestedKeys.forEach(k => keys.add(k));
      }
    }
    return keys;
  }

  validatePlaceholdersAgainstData(templatePlaceholders, jsonKeys) {
    const missingInJson = [];
    const unusedInJson = [];

    for (const placeholder of templatePlaceholders) {
      if (!jsonKeys.has(placeholder)) {
        missingInJson.push(placeholder);
      }
    }

    for (const key of jsonKeys) {
      let found = false;
      for (const placeholder of templatePlaceholders) {
        if (placeholder === key || placeholder.startsWith(key + '.') || key.includes('.')) {
          found = true;
          break;
        }
      }
      if (!found && !key.includes('.')) {
        const isNestedKey = Array.from(jsonKeys).some(k => k.startsWith(key + '.'));
        if (!isNestedKey) {
          unusedInJson.push(key);
        }
      }
    }

    const errors = [];
    if (missingInJson.length > 0) {
      errors.push(`Placeholders in template but missing in JSON: ${missingInJson.join(', ')}`);
    }
    if (unusedInJson.length > 0) {
      errors.push(`Keys in JSON but not used in template: ${unusedInJson.join(', ')}`);
    }

    if (errors.length > 0) {
      throw new TemplateValidationError('Placeholder validation failed', {
        missingInJson,
        unusedInJson,
        errors
      });
    }
  }

  process(data, options = { strictValidation: true }) {
    const zip = new PizZip(this.templateBuffer);

    let allContent = '';
    const xmlFiles = ['word/document.xml', 'word/header1.xml', 'word/header2.xml', 'word/header3.xml', 'word/footer1.xml', 'word/footer2.xml', 'word/footer3.xml'];

    for (const xmlFile of xmlFiles) {
      try {
        const content = zip.file(xmlFile);
        if (content) {
          allContent += content.asText();
        }
      } catch (e) {
      }
    }

    // Only validate section blocks if strict validation is enabled
    if (options.strictValidation) {
      this.validateSectionBlocks(allContent);
    }

    const templatePlaceholders = this.extractPlaceholders(allContent);
    const jsonKeys = this.flattenKeys(data);

    if (options.strictValidation) {
      this.validatePlaceholdersAgainstData(templatePlaceholders, jsonKeys);
    }

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{', end: '}' },
      nullGetter: function(part) {
        if (options.strictValidation) {
          throw new TemplateValidationError(`Missing value for placeholder: ${part.value}`, { placeholder: part.value });
        }
        return '';
      }
    });

    try {
      doc.render(data);
    } catch (error) {
      if (error.properties && error.properties.errors) {
        const details = error.properties.errors.map(e => ({
          message: e.message,
          properties: e.properties
        }));
        throw new TemplateValidationError('Template rendering failed', { errors: details });
      }
      throw error;
    }

    return doc.getZip().generate({ type: 'nodebuffer' });
  }

  async processAndSave(data, outputDocxPath, outputPdfPath = null, options = { strictValidation: true }) {
    const docxBuffer = this.process(data, options);

    const outputDir = path.dirname(outputDocxPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputDocxPath, docxBuffer);

    let pdfBuffer = null;
    if (outputPdfPath) {
      try {
        pdfBuffer = await libreConvert(docxBuffer, '.pdf', undefined);
        fs.writeFileSync(outputPdfPath, pdfBuffer);
      } catch (error) {
        throw new TemplateValidationError('PDF conversion failed', {
          message: error.message,
          hint: 'Ensure LibreOffice is installed and accessible in PATH'
        });
      }
    }

    return {
      docxPath: outputDocxPath,
      pdfPath: outputPdfPath,
      docxBuffer,
      pdfBuffer
    };
  }
}

async function processTemplate(templatePath, data, outputDocxPath, outputPdfPath = null, options = { strictValidation: false }) {
  const processor = new TemplateProcessor(templatePath);
  return processor.processAndSave(data, outputDocxPath, outputPdfPath, options);
}

function processTemplateSync(templatePath, data, options = { strictValidation: false }) {
  const processor = new TemplateProcessor(templatePath);
  return processor.process(data, options);
}

module.exports = {
  TemplateProcessor,
  TemplateValidationError,
  processTemplate,
  processTemplateSync
};
