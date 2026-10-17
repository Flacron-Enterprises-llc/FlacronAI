// Reads FlacronAI production runtime config from the AWS source of truth.
// Never logs values. Requires an AWS profile with secretsmanager:GetSecretValue
// on flacronai/production/* and ecs:Describe* (default: flacron-cloudadmin).
const { execFileSync } = require('child_process');

const PROFILE = process.env.FLACRON_AWS_PROFILE || 'flacron-cloudadmin';
const P = ['--profile', PROFILE, '--region', 'us-east-1', '--output', 'json'];
const aws = (args) => JSON.parse(execFileSync('aws', [...args, ...P], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 50e6 }));
const secret = (id) => aws(['secretsmanager', 'get-secret-value', '--secret-id', id]).SecretString;

// Values that differ per host -- never copied from AWS.
const PER_HOST = new Set(['FRONTEND_URL', 'PORT', 'NODE_ENV', 'GIT_SHA', 'DEPLOY_PLATFORM', 'CORS_ADDITIONAL_ORIGINS', 'SES_USE_DEFAULT_CREDENTIALS']);

function load() {
  const svc = aws(['ecs', 'describe-services', '--cluster', 'flacronai-production-cluster', '--services', 'flacronai-backend-service']).services[0];
  const td = aws(['ecs', 'describe-task-definition', '--task-definition', svc.taskDefinition]).taskDefinition;
  const c = td.containerDefinitions[0];

  const plain = {};
  for (const { name, value } of c.environment || []) if (!PER_HOST.has(name)) plain[name] = value;

  const sensitive = JSON.parse(secret('flacronai/production/app'));
  // Off-AWS hosts use the dedicated send-only SES key, not the ECS one.
  Object.assign(sensitive, JSON.parse(secret('flacronai/production/ses-multicloud')));
  for (const s of c.secrets || []) {
    if (s.valueFrom.includes(':secret:flacronai/production/app')) continue;
    const id = s.valueFrom.replace(/^(arn:aws:secretsmanager:[^:]+:\d+:secret:[^:]+).*$/, '$1');
    const raw = secret(id);
    let v = raw;
    try { const j = JSON.parse(raw); if (j && typeof j === 'object') v = j[s.name] ?? Object.values(j)[0]; } catch { /* plain string secret */ }
    sensitive[s.name] = v;
  }
  for (const k of Object.keys(sensitive)) if (PER_HOST.has(k)) delete sensitive[k];
  return { plain, sensitive, taskDefinition: svc.taskDefinition };
}

module.exports = { load };

if (require.main === module) {
  const { plain, sensitive, taskDefinition } = load();
  console.log('source task def:', taskDefinition);
  console.log('plain    :', Object.keys(plain).sort().join(', '));
  console.log('sensitive:', Object.keys(sensitive).sort().join(', '));
  console.log('empty    :', Object.entries(sensitive).filter(([, v]) => !v).map(([k]) => k).join(', ') || 'none');
}
