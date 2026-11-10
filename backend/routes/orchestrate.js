// GET /api/v1/orchestrate/openapi.json -- the tool definitions IBM watsonx
// Orchestrate imports ("Import tools from OpenAPI") for the FlacronAI agent
// listed in the IBM Cloud catalog. Every operation is an existing,
// scope-checked FlacronAI API route; auth is a FlacronAI API key sent as
// x-api-key (Settings > API keys).
const express = require('express');
const { config } = require('../services/ibmAgentService');

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const ok = (description, schema = { type: 'object' }) => ({ description, content: { 'application/json': { schema } } });
const errors = {
  401: { description: 'Missing or invalid API key' },
  403: { description: 'API key is missing the required scope, or the plan does not include this feature' },
  429: { description: 'Monthly report limit reached for this plan' },
};

const buildSpec = (apiUrl) => ({
  openapi: '3.0.3',
  info: {
    title: 'FlacronAI Agent Tools',
    version: '1.0.0',
    description:
      'Generate insurance and property inspection reports with Super Intelligence, check their progress, '
      + 'export them, and manage CRM clients and claims in FlacronAI.',
  },
  servers: [{ url: `${apiUrl}/api/v1` }],
  security: [{ ApiKeyAuth: [] }],
  components: {
    securitySchemes: { ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key' } },
  },
  paths: {
    '/reports/generate': {
      post: {
        operationId: 'generateReport',
        summary: 'Generate an inspection report with Super Intelligence',
        description:
          'Creates a report and starts generation in the background. Returns the report id immediately; '
          + 'call getReportStatus until it is done, then getReport. Needs scope reports:generate.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['claimNumber', 'insuredName', 'insuredEmail', 'propertyAddress', 'lossDate', 'lossType'],
                properties: {
                  claimNumber: str('Insurance claim number'),
                  insuredName: str('Full name of the insured person'),
                  insuredEmail: str('Email of the insured person', { format: 'email' }),
                  propertyAddress: str('Full property address'),
                  lossDate: str('Date of loss, YYYY-MM-DD', { format: 'date' }),
                  lossType: str('Type of loss, for example Water, Fire, Wind, Hail, Mold, Theft, Flood'),
                  reportType: str('Optional report type'),
                  claimType: str('Optional claim type, for example Residential, Commercial, Auto, Liability'),
                  lossDescription: str('What happened'),
                  damagesObserved: str('Damage the inspector observed'),
                  recommendations: str('Recommended repairs or next steps'),
                  additionalNotes: str('Any other notes for the report'),
                  insuranceCompany: str('Insurance company name'),
                  policyNumber: str('Policy number'),
                  inspectionDate: str('Inspection date, YYYY-MM-DD'),
                  inspectorName: str('Inspector name'),
                  clientId: str('Optional CRM client id to link the report to'),
                  claimId: str('Optional CRM claim id; its details are used for the report'),
                },
              },
            },
          },
        },
        responses: { 201: ok('Report created; generation is running'), 400: { description: 'Missing or invalid fields' }, ...errors },
      },
    },
    '/reports/{id}/analysis-status': {
      get: {
        operationId: 'getReportStatus',
        summary: 'Check whether a report has finished generating',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: ok('Generation progress'), 404: { description: 'Report not found' }, ...errors },
      },
    },
    '/reports': {
      get: {
        operationId: 'listReports',
        summary: 'List recent reports',
        description: 'Needs scope reports:read.',
        responses: { 200: ok('Reports'), ...errors },
      },
    },
    '/reports/{id}': {
      get: {
        operationId: 'getReport',
        summary: 'Get one report with its generated content',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: ok('The report'), 404: { description: 'Report not found' }, ...errors },
      },
    },
    '/reports/{id}/export': {
      post: {
        operationId: 'exportReport',
        summary: 'Export a report as PDF, DOCX or HTML',
        description: 'Returns a short-lived download URL. Needs scope reports:export and a plan that includes the format.',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  format: { type: 'string', enum: ['pdf', 'docx', 'html'], default: 'pdf' },
                  includeImages: { type: 'boolean', default: true },
                },
              },
            },
          },
        },
        responses: {
          200: ok('Download link', {
            type: 'object',
            properties: { downloadUrl: { type: 'string' }, expiresAt: { type: 'string' }, format: { type: 'string' }, filename: { type: 'string' } },
          }),
          ...errors,
        },
      },
    },
    '/crm/clients': {
      get: { operationId: 'listClients', summary: 'List CRM clients (Agency plan and above; scope crm:read)', responses: { 200: ok('Clients'), ...errors } },
      post: {
        operationId: 'createClient',
        summary: 'Create a CRM client (Agency plan and above; scope crm:write)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: str('Client name'), email: str('Email'), phone: str('Phone'),
                  company: str('Company'), address: str('Address'), notes: str('Notes'),
                },
              },
            },
          },
        },
        responses: { 201: ok('Client created'), 400: { description: 'Invalid fields' }, ...errors },
      },
    },
    '/crm/claims': {
      get: { operationId: 'listClaims', summary: 'List CRM claims (Agency plan and above; scope crm:read)', responses: { 200: ok('Claims'), ...errors } },
      post: {
        operationId: 'createClaim',
        summary: 'Create a CRM claim (Agency plan and above; scope crm:write)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['lossType'],
                properties: {
                  lossType: str('Type of loss'), claimNumber: str('Claim number'), lossDate: str('Date of loss, YYYY-MM-DD'),
                  propertyAddress: str('Property address'), description: str('Description'), notes: str('Notes'),
                  clientId: str('CRM client id this claim belongs to'),
                  status: { type: 'string', enum: ['open', 'in-progress', 'pending-review', 'closed'] },
                },
              },
            },
          },
        },
        responses: { 201: ok('Claim created'), 400: { description: 'Invalid fields' }, ...errors },
      },
    },
  },
});

const router = express.Router();
router.get('/openapi.json', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(buildSpec(config().apiUrl));
});

module.exports = router;
module.exports.buildSpec = buildSpec;
