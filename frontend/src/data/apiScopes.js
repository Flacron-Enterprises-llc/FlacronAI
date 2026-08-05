export const API_KEY_SCOPES = [
  { id: 'reports:read', label: 'Read reports', description: 'List reports, templates, details, and versions.' },
  { id: 'reports:write', label: 'Manage reports', description: 'Edit, approve, share, delete, and upload report images.' },
  { id: 'reports:generate', label: 'Generate reports', description: 'Generate reports, image analysis, and section suggestions.' },
  { id: 'reports:export', label: 'Export reports', description: 'Create and download PDF, DOCX, and HTML exports.' },
  { id: 'crm:read', label: 'Read CRM', description: 'View CRM analytics, clients, claims, and appointments.' },
  { id: 'crm:write', label: 'Manage CRM', description: 'Create, edit, and delete CRM records.' },
];

export const DEFAULT_API_KEY_SCOPES = ['reports:read'];

export const formatApiScope = scope => API_KEY_SCOPES.find(item => item.id === scope)?.label || scope;
