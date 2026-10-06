// The webhook paths the Teaching Assistant frontend calls, copied from WEBHOOKS
// in its src/context/AppContext.js. Keep the two in step: a path added there
// and not here shows on the dashboard under "Not in the frontend list".
export const ENDPOINT_GROUPS = [
  { name: 'Sign-in', paths: ['login', 'signup'] },
  {
    name: 'Chat',
    paths: ['teaching-assistant', 'load_chat_messages', 'delete_chat', 'header', 'generate-image', 'voice-assistant', 'message-feedback'],
  },
  {
    name: 'Documents',
    paths: ['document', 'cowriter', 'document-generate', 'cowriter-splice', 'autosave', 'load_document_history', 'load_document', 'delete_document'],
  },
  {
    name: 'Corrections',
    paths: ['correction', 'autosave_correction', 'load_correction_history', 'load_correction', 'correction_recent_files', 'delete_correction'],
  },
  {
    name: 'Knowledge base',
    paths: ['upload-knowledge-file', 'delete-knowledge-file', 'load-knowledge-files', 'datasources-list', 'datasource-create', 'datasource-test', 'datasource-delete'],
  },
  { name: 'Analysis', paths: ['teacher-analytics', 'data-analysis'] },
  {
    name: 'Content generator',
    paths: [
      'worksheet-generation', 'edit-worksheet', 'export-worksheet',
      'generate-course-plan', 'export-course-plan', 'suggested-videos',
      'generate-activities', 'edit-activities', 'export-activities',
      'presentation-plan', 'presentation-edit', 'presentation-build', 'presentation-regenerate-image',
    ],
  },
  { name: 'Tasks', paths: ['tasks-list', 'task-create', 'task-update', 'task-delete'] },
  {
    name: 'Scholarships',
    paths: ['scholarship-applicants', 'scholarship-check', 'scholarship-explain', 'scholarship-pipeline', 'scholarship-letter', 'users-directory'],
  },
  { name: 'Platform', paths: ['platform-feedback', 'log-error'] },
];

// n8n hosts per environment (the frontend's netlify.toml).
export const ENVIRONMENTS = [
  { id: 'dev', label: 'Dev', base: 'https://dev.n8n-direct.maisumhayati-ai.com' },
  { id: 'staging', label: 'Staging', base: 'https://staging.n8n-direct.maisumhayati-ai.com' },
  { id: 'production', label: 'Production', base: 'https://n8n-direct.maisumhayati-ai.com' },
];

export const RANGES = [
  { id: '1h', label: '1 hour' },
  { id: '24h', label: '24 hours' },
  { id: '7d', label: '7 days' },
];
