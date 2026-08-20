const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
require('dotenv').config();

// ── Config ────────────────────────────────────────────────────────────────────
const REGION       = process.env.AWS_REGION      || 'us-east-1';
const FROM_EMAIL   = process.env.SES_FROM_EMAIL  || 'no-reply@flacronenterprises.com';
const FROM_NAME    = process.env.SES_FROM_NAME   || 'FlacronAI';
const REPLY_TO     = process.env.SES_REPLY_TO    || '';
const FRONTEND_URL = process.env.FRONTEND_URL    || 'http://localhost:5173';

// Brand tokens (kept in sync with frontend/tailwind.config.js)
const BRAND  = '#FD4403';
const NAVY   = '#002A64';

// Lazy SES client — returns null when creds are absent so sends degrade gracefully
let _client = null;
const getClient = () => {
  if (_client) return _client;
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) return null;
  _client = new SESClient({
    region: REGION,
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  return _client;
};

// ── HTML escape (for user-supplied values injected into templates) ─────────────
const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// ── Shared layout ───────────────────────────────────────────────────────────────
// Renders a branded, transactional email. `cta` is optional { label, url }.
const layout = ({ preheader, heading, bodyHtml, cta, footNote }) => {
  const year = new Date().getFullYear();
  const button = cta
    ? `<div style="text-align:center;margin:32px 0;">
         <a href="${cta.url}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 36px;border-radius:10px;">
           ${esc(cta.label)}
         </a>
       </div>
       <p style="margin:24px 0 0;color:#9ca3af;font-size:13px;text-align:center;">Button not working? Copy and paste this link into your browser:</p>
       <p style="margin:8px 0 0;word-break:break-all;color:${BRAND};font-size:12px;text-align:center;">${cta.url}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(heading)} – FlacronAI</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader || heading)}</span>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background:${NAVY};padding:28px 32px;text-align:center;">
              <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">Flacron<span style="color:${BRAND};">AI</span></span>
            </td>
          </tr>
          <!-- Heading strip -->
          <tr>
            <td style="padding:36px 32px 0;">
              <h1 style="margin:0;color:#111827;font-size:24px;font-weight:700;letter-spacing:-0.5px;">${esc(heading)}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:20px 32px 36px;">
              ${bodyHtml}
              ${button}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;background:#f8f8f8;border-top:1px solid #e5e7eb;text-align:center;">
              ${footNote ? `<p style="margin:0 0 8px;color:#9ca3af;font-size:12px;">${footNote}</p>` : ''}
              <p style="margin:0;color:#9ca3af;font-size:12px;">This is a transactional email regarding your FlacronAI account.</p>
              <p style="margin:8px 0 0;color:#d1d5db;font-size:11px;">&copy; ${year} Flacron Enterprises LLC. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

// ── Core sender (SES) ───────────────────────────────────────────────────────────
const sendEmail = async ({ to, subject, html, text, replyTo }) => {
  const client = getClient();
  if (!client) {
    console.warn('[Email] AWS SES not configured (missing AWS creds) — skipping send');
    return { skipped: true };
  }

  const source = `${FROM_NAME} <${FROM_EMAIL}>`;
  const reply  = replyTo || REPLY_TO;

  const command = new SendEmailCommand({
    Source:      source,
    Destination: { ToAddresses: [to] },
    ...(reply ? { ReplyToAddresses: [reply] } : {}),
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        ...(html ? { Html: { Data: html, Charset: 'UTF-8' } } : {}),
        ...(text ? { Text: { Data: text, Charset: 'UTF-8' } } : {}),
      },
    },
  });

  try {
    const res = await client.send(command);
    console.log(`[Email] SES sent "${subject}" to ${to} (MessageId=${res.MessageId})`);
    return { messageId: res.MessageId };
  } catch (err) {
    console.error(`[Email] SES error sending to ${to}:`, err.name, '-', err.message);
    throw err;
  }
};

// ── Welcome ───────────────────────────────────────────────────────────────────
const sendWelcomeEmail = async (email, displayName) => {
  const name = esc(displayName || 'there');
  const html = layout({
    preheader: 'Welcome to FlacronAI — your account is ready.',
    heading:   'Welcome to FlacronAI',
    bodyHtml: `
      <p style="margin:0 0 16px;color:#374151;font-size:16px;">Hi <strong>${name}</strong>,</p>
      <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">Your account is ready. FlacronAI helps you turn inspection photos and claim details into a structured draft report in minutes — which you then review, edit, and approve as the professional.</p>
      <p style="margin:0;color:#6b7280;font-size:15px;line-height:1.6;">Head to your dashboard to generate your first report.</p>`,
    cta: { label: 'Go to Dashboard', url: `${FRONTEND_URL}/dashboard` },
  });
  const text = `Hi ${displayName || 'there'},\n\nWelcome to FlacronAI! Your account is ready. Head to your dashboard to generate your first report:\n${FRONTEND_URL}/dashboard\n\n— FlacronAI`;
  return sendEmail({ to: email, subject: 'Welcome to FlacronAI', html, text });
};

// ── Password reset ────────────────────────────────────────────────────────────
const sendPasswordResetEmail = async (email, resetLink) => {
  const html = layout({
    preheader: 'Reset your FlacronAI password.',
    heading:   'Reset Your Password',
    bodyHtml: `
      <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">We received a request to reset the password for your FlacronAI account. Click the button below to choose a new password.</p>`,
    cta:      { label: 'Reset Password', url: resetLink },
    footNote: 'This link expires in 1 hour. If you didn\'t request a password reset, you can safely ignore this email.',
  });
  const text = `Reset your FlacronAI password by clicking the link below:\n\n${resetLink}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.\n\n— FlacronAI`;
  return sendEmail({ to: email, subject: 'Reset your FlacronAI password', html, text });
};

// ── Payment failed ────────────────────────────────────────────────────────────
const sendPaymentFailedEmail = async (email, displayName) => {
  const name = esc(displayName || 'there');
  const settingsLink = `${FRONTEND_URL}/settings?tab=billing`;
  const html = layout({
    preheader: 'We couldn\'t process your latest FlacronAI payment.',
    heading:   'Payment Issue',
    bodyHtml: `
      <p style="margin:0 0 16px;color:#374151;font-size:16px;">Hi <strong>${name}</strong>,</p>
      <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">We weren't able to process the most recent payment for your FlacronAI subscription. To avoid any interruption to your plan, please update your payment method.</p>`,
    cta:      { label: 'Update Payment Method', url: settingsLink },
    footNote: 'If you\'ve already updated your payment details, you can disregard this message.',
  });
  const text = `Hi ${displayName || 'there'},\n\nWe weren't able to process your latest FlacronAI payment. Please update your payment method to avoid interruption:\n\n${settingsLink}\n\n— FlacronAI`;
  return sendEmail({ to: email, subject: 'Action needed: FlacronAI payment issue', html, text });
};

// ── Team invite ───────────────────────────────────────────────────────────────
const sendTeamInviteEmail = async (email, ownerName, role, inviteLink) => {
  const owner = esc(ownerName);
  const roleLabel = esc(role.charAt(0).toUpperCase() + role.slice(1));
  const html = layout({
    preheader: `${ownerName} invited you to a team on FlacronAI.`,
    heading:   'You\'ve Been Invited',
    bodyHtml: `
      <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;"><strong>${owner}</strong> has invited you to join their team on FlacronAI as a <strong>${roleLabel}</strong>. Accept the invitation to get started.</p>`,
    cta:      { label: 'Accept Invitation', url: inviteLink },
    footNote: 'If you weren\'t expecting this invitation, you can safely ignore this email.',
  });
  const text = `${ownerName} has invited you to join their team on FlacronAI as a ${roleLabel}.\n\nAccept the invitation:\n${inviteLink}\n\n— FlacronAI`;
  return sendEmail({ to: email, subject: `${ownerName} invited you to FlacronAI`, html, text });
};

// ── Sales lead notification (internal → admin) ─────────────────────────────────
const sendSalesNotificationEmail = async (lead) => {
  const row = (label, value) =>
    `<tr>
       <td style="padding:8px 0;color:#9ca3af;font-size:13px;width:140px;vertical-align:top;">${label}</td>
       <td style="padding:8px 0;color:#111827;font-size:14px;">${esc(value || '—')}</td>
     </tr>`;
  const html = layout({
    preheader: `New sales lead: ${lead.name}`,
    heading:   'New Sales Lead',
    bodyHtml: `
      <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">A new lead was submitted through the FlacronAI website.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;">
        ${row('Name', lead.name)}
        ${row('Email', lead.email)}
        ${row('Company', lead.company)}
        ${row('Phone', lead.phone)}
        ${row('Type', lead.companyType)}
        ${row('Monthly volume', lead.monthlyVolume)}
        ${row('Message', lead.message)}
      </table>`,
    cta: lead.email ? { label: 'Reply to Lead', url: `mailto:${lead.email}` } : undefined,
  });
  const text = `New sales lead:\n\nName: ${lead.name}\nEmail: ${lead.email}\nCompany: ${lead.company || '—'}\nPhone: ${lead.phone || '—'}\nType: ${lead.companyType || '—'}\nMonthly volume: ${lead.monthlyVolume || '—'}\nMessage: ${lead.message || '—'}`;
  return sendEmail({ to: process.env.ADMIN_EMAIL, subject: `New sales lead: ${lead.name}`, html, text });
};

// ── Email verification ────────────────────────────────────────────────────────
const sendEmailVerificationEmail = async (email, displayName, verificationLink) => {
  const name = esc(displayName || 'there');
  const html = layout({
    preheader: 'Verify your email to activate your FlacronAI account.',
    heading:   'Verify Your Email',
    bodyHtml: `
      <p style="margin:0 0 16px;color:#374151;font-size:16px;">Hi <strong>${name}</strong>,</p>
      <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">Thanks for signing up for FlacronAI! Please verify your email address to activate your account and start generating professional insurance inspection reports.</p>`,
    cta:      { label: 'Verify Email Address', url: verificationLink },
    footNote: 'This link expires in 24 hours. If you didn\'t create an account, you can safely ignore this email.',
  });
  const text = `Hi ${displayName || 'there'},\n\nPlease verify your email address by clicking the link below:\n\n${verificationLink}\n\nThis link expires in 24 hours.\n\n— FlacronAI`;
  return sendEmail({ to: email, subject: 'Verify your FlacronAI email address', html, text });
};

// ── New-device / new-location login alert ──────────────────────────────────────
const sendNewDeviceLoginAlert = async (email, displayName, { ip, userAgent, at }) => {
  const name = esc(displayName || 'there');
  const when = esc(new Date(at).toUTCString());
  const html = layout({
    preheader: 'New sign-in to your FlacronAI account.',
    heading:   'New Sign-In Detected',
    bodyHtml: `
      <p style="margin:0 0 16px;color:#374151;font-size:16px;">Hi <strong>${name}</strong>,</p>
      <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">We noticed a sign-in to your FlacronAI account from a device or location we haven't seen before.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;">
        <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;width:100px;">Time</td><td style="padding:8px 0;color:#111827;font-size:14px;">${when}</td></tr>
        <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">IP address</td><td style="padding:8px 0;color:#111827;font-size:14px;">${esc(ip || 'unknown')}</td></tr>
        <tr><td style="padding:8px 0;color:#9ca3af;font-size:13px;">Device</td><td style="padding:8px 0;color:#111827;font-size:14px;">${esc(userAgent || 'unknown')}</td></tr>
      </table>
      <p style="margin:16px 0 0;color:#6b7280;font-size:15px;line-height:1.6;">If this was you, no action is needed. If you don't recognize this activity, change your password immediately.</p>`,
    cta:      { label: 'Change Password', url: `${FRONTEND_URL}/settings?tab=security` },
  });
  const text = `Hi ${displayName || 'there'},\n\nWe noticed a sign-in to your FlacronAI account from a new device/location.\n\nTime: ${when}\nIP: ${ip || 'unknown'}\nDevice: ${userAgent || 'unknown'}\n\nIf this wasn't you, change your password immediately:\n${FRONTEND_URL}/settings?tab=security\n\n— FlacronAI`;
  return sendEmail({ to: email, subject: 'New sign-in to your FlacronAI account', html, text });
};

// ── Report completed (Phase 18: Notifications) ─────────────────────────────
const sendReportCompletedEmail = async (email, displayName, { reportId, claimNumber }) => {
  const name = esc(displayName || 'there');
  const link = `${FRONTEND_URL}/reports/${reportId}/preview`;
  const html = layout({
    preheader: 'Your FlacronAI report draft is ready for review.',
    heading:   'Your Report Is Ready',
    bodyHtml: `
      <p style="margin:0 0 16px;color:#374151;font-size:16px;">Hi <strong>${name}</strong>,</p>
      <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">Your report draft${claimNumber ? ` for claim <strong>${esc(claimNumber)}</strong>` : ''} has finished generating and is ready for your review before it's finalized.</p>`,
    cta: { label: 'Review Report', url: link },
    footNote: 'You can turn this email off anytime in Settings → Notifications.',
  });
  const text = `Hi ${displayName || 'there'},\n\nYour report draft${claimNumber ? ` for claim ${claimNumber}` : ''} has finished generating and is ready for review:\n${link}\n\n— FlacronAI`;
  return sendEmail({ to: email, subject: 'Your FlacronAI report is ready for review', html, text });
};

// ── Photo analysis completed (Phase 18: Notifications) ─────────────────────
const sendAnalysisCompletedEmail = async (email, displayName, { reportId, claimNumber, photoCount }) => {
  const name = esc(displayName || 'there');
  const link = `${FRONTEND_URL}/reports/${reportId}/preview`;
  const html = layout({
    preheader: 'Photo analysis finished on your FlacronAI report.',
    heading:   'Photo Analysis Complete',
    bodyHtml: `
      <p style="margin:0 0 16px;color:#374151;font-size:16px;">Hi <strong>${name}</strong>,</p>
      <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">FLACRON ENGINE has finished analyzing ${photoCount ? `${photoCount} photo${photoCount === 1 ? '' : 's'}` : 'your photos'}${claimNumber ? ` for claim <strong>${esc(claimNumber)}</strong>` : ''}. Report generation is now underway.</p>`,
    cta: { label: 'View Report', url: link },
    footNote: 'You can turn this email off anytime in Settings → Notifications.',
  });
  const text = `Hi ${displayName || 'there'},\n\nPhoto analysis has finished${claimNumber ? ` for claim ${claimNumber}` : ''}. Report generation is now underway:\n${link}\n\n— FlacronAI`;
  return sendEmail({ to: email, subject: 'Photo analysis complete on your FlacronAI report', html, text });
};

// ── Report approved (Phase 18: Notifications) ──────────────────────────────
const sendReportApprovedEmail = async (email, displayName, { reportId, claimNumber }) => {
  const name = esc(displayName || 'there');
  const link = `${FRONTEND_URL}/reports/${reportId}/preview`;
  const html = layout({
    preheader: 'Your FlacronAI report has been approved and finalized.',
    heading:   'Report Approved',
    bodyHtml: `
      <p style="margin:0 0 16px;color:#374151;font-size:16px;">Hi <strong>${name}</strong>,</p>
      <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">Your report${claimNumber ? ` for claim <strong>${esc(claimNumber)}</strong>` : ''} has been reviewed, approved, and finalized. It's ready to export or share.</p>`,
    cta: { label: 'View Report', url: link },
    footNote: 'You can turn this email off anytime in Settings → Notifications.',
  });
  const text = `Hi ${displayName || 'there'},\n\nYour report${claimNumber ? ` for claim ${claimNumber}` : ''} has been approved and finalized:\n${link}\n\n— FlacronAI`;
  return sendEmail({ to: email, subject: 'Your FlacronAI report has been approved', html, text });
};

// ── Report shared (Phase 18: Notifications) ─────────────────────────────────
const sendReportSharedEmail = async (email, displayName, { claimNumber, shareUrl }) => {
  const name = esc(displayName || 'there');
  const html = layout({
    preheader: 'A secure share link was created for your FlacronAI report.',
    heading:   'Report Share Link Created',
    bodyHtml: `
      <p style="margin:0 0 16px;color:#374151;font-size:16px;">Hi <strong>${name}</strong>,</p>
      <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;">A secure share link was just created for your report${claimNumber ? ` for claim <strong>${esc(claimNumber)}</strong>` : ''}. Anyone with the link below can view it.</p>`,
    cta: { label: 'Open Share Link', url: shareUrl },
    footNote: 'If you didn\'t expect this, you can revoke the share link from My Reports at any time.',
  });
  const text = `Hi ${displayName || 'there'},\n\nA secure share link was just created for your report${claimNumber ? ` for claim ${claimNumber}` : ''}:\n${shareUrl}\n\n— FlacronAI`;
  return sendEmail({ to: email, subject: 'Your FlacronAI report share link', html, text });
};

// ── Review requested (Phase 19: Sharing, Comments & Review Requests) ───────
// Sent to the REVIEWER being assigned, not the requester -- gated by the
// reviewer's own 'reviewRequested' preference (Phase 18 defined this key but
// never had an event to fire it; this is that event).
const sendReviewRequestedEmail = async (email, displayName, { reportId, claimNumber, requestedByName, notes }) => {
  const name = esc(displayName || 'there');
  const link = `${FRONTEND_URL}/reports/${reportId}/preview`;
  const html = layout({
    preheader: 'A report has been sent to you for review on FlacronAI.',
    heading:   'Review Requested',
    bodyHtml: `
      <p style="margin:0 0 16px;color:#374151;font-size:16px;">Hi <strong>${name}</strong>,</p>
      <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;"><strong>${esc(requestedByName || 'A team member')}</strong> asked you to review a report${claimNumber ? ` for claim <strong>${esc(claimNumber)}</strong>` : ''}. You can comment, edit, and approve or return it for changes.</p>
      ${notes ? `<p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;background:#f9fafb;border-left:3px solid ${BRAND};padding:10px 14px;border-radius:6px;">"${esc(notes)}"</p>` : ''}`,
    cta: { label: 'Review Report', url: link },
    footNote: 'You can turn this email off anytime in Settings → Notifications.',
  });
  const text = `Hi ${displayName || 'there'},\n\n${requestedByName || 'A team member'} asked you to review a report${claimNumber ? ` for claim ${claimNumber}` : ''}:\n${link}\n\n— FlacronAI`;
  return sendEmail({ to: email, subject: 'A report is waiting for your review — FlacronAI', html, text });
};

// ── Review response (Phase 19): reviewer returned changes or declined ──────
// Sent to the report OWNER, gated by the owner's own 'reviewRequested'
// preference (the closest existing toggle to "review lifecycle updates" --
// approval itself still goes through the existing 'reportApproved' hook).
const sendReviewResponseEmail = async (email, displayName, { reportId, claimNumber, reviewerName, decision, notes }) => {
  const name = esc(displayName || 'there');
  const link = `${FRONTEND_URL}/reports/${reportId}/preview`;
  const decisionLabel = decision === 'rejected' ? 'declined to approve' : 'requested changes on';
  const html = layout({
    preheader: `A reviewer ${decisionLabel} your FlacronAI report.`,
    heading:   decision === 'rejected' ? 'Review Declined' : 'Changes Requested',
    bodyHtml: `
      <p style="margin:0 0 16px;color:#374151;font-size:16px;">Hi <strong>${name}</strong>,</p>
      <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;"><strong>${esc(reviewerName || 'Your reviewer')}</strong> ${decisionLabel} your report${claimNumber ? ` for claim <strong>${esc(claimNumber)}</strong>` : ''}. It's back in your drafts for edits.</p>
      ${notes ? `<p style="margin:0 0 16px;color:#6b7280;font-size:14px;line-height:1.6;background:#f9fafb;border-left:3px solid ${BRAND};padding:10px 14px;border-radius:6px;">"${esc(notes)}"</p>` : ''}`,
    cta: { label: 'Open Report', url: link },
    footNote: 'You can turn this email off anytime in Settings → Notifications.',
  });
  const text = `Hi ${displayName || 'there'},\n\n${reviewerName || 'Your reviewer'} ${decisionLabel} your report${claimNumber ? ` for claim ${claimNumber}` : ''}:\n${link}\n\n— FlacronAI`;
  return sendEmail({ to: email, subject: `FlacronAI report ${decision === 'rejected' ? 'review declined' : 'changes requested'}`, html, text });
};

// ── Direct report access granted (Phase 19: "Invite User" sharing) ─────────
// Sent to the invited (existing-account) user -- gated by their own
// 'reportShared' preference, the closest existing toggle to "someone gave
// you access to a report" (distinct from the anonymous-link flow above).
const sendReportAccessGrantedEmail = async (email, displayName, { reportId, claimNumber, grantedByName, permission }) => {
  const name = esc(displayName || 'there');
  const link = `${FRONTEND_URL}/reports/${reportId}/preview`;
  const permissionLabel = { view: 'view', comment: 'view and comment on', review: 'view, comment on, and review' }[permission] || 'view';
  const html = layout({
    preheader: 'You were given access to a report on FlacronAI.',
    heading:   'Report Shared With You',
    bodyHtml: `
      <p style="margin:0 0 16px;color:#374151;font-size:16px;">Hi <strong>${name}</strong>,</p>
      <p style="margin:0 0 16px;color:#6b7280;font-size:15px;line-height:1.6;"><strong>${esc(grantedByName || 'A FlacronAI user')}</strong> gave you access to ${permissionLabel} a report${claimNumber ? ` for claim <strong>${esc(claimNumber)}</strong>` : ''}.</p>`,
    cta: { label: 'Open Report', url: link },
    footNote: 'You can turn this email off anytime in Settings → Notifications.',
  });
  const text = `Hi ${displayName || 'there'},\n\n${grantedByName || 'A FlacronAI user'} gave you access to ${permissionLabel} a report${claimNumber ? ` for claim ${claimNumber}` : ''}:\n${link}\n\n— FlacronAI`;
  return sendEmail({ to: email, subject: 'A FlacronAI report was shared with you', html, text });
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPaymentFailedEmail,
  sendTeamInviteEmail,
  sendSalesNotificationEmail,
  sendEmailVerificationEmail,
  sendNewDeviceLoginAlert,
  sendReportCompletedEmail,
  sendAnalysisCompletedEmail,
  sendReportApprovedEmail,
  sendReportSharedEmail,
  sendReviewRequestedEmail,
  sendReviewResponseEmail,
  sendReportAccessGrantedEmail,
};
