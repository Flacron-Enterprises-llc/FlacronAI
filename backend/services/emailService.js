// Email Service for FlacronAI
const nodemailer = require('nodemailer');

// Email configuration from environment variables
const EMAIL_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || process.env.EMAIL_USER,
    pass: process.env.SMTP_PASS || process.env.EMAIL_PASS
  }
};

// Create transporter
let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    // Check if email credentials are configured
    if (!EMAIL_CONFIG.auth.user || !EMAIL_CONFIG.auth.pass) {
      console.warn('⚠️ Email service not configured. Set SMTP_USER and SMTP_PASS environment variables.');
      return null;
    }

    transporter = nodemailer.createTransport(EMAIL_CONFIG);
  }
  return transporter;
};

/**
 * Send verification email to user
 * @param {string} email - Recipient email address
 * @param {string} verificationLink - Firebase verification link
 * @returns {Promise<{success: boolean, error?: string}>}
 */
const sendVerificationEmail = async (email, verificationLink) => {
  const transport = getTransporter();

  if (!transport) {
    console.log('📧 Email service not configured. Verification link:', verificationLink);
    return {
      success: false,
      error: 'Email service not configured',
      verificationLink // Return link for development/testing
    };
  }

  const mailOptions = {
    from: `"FlacronAI" <${EMAIL_CONFIG.auth.user}>`,
    to: email,
    subject: 'Verify Your FlacronAI Account',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">FlacronAI</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">AI-Powered Insurance Reports</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <h2 style="color: #333333; margin: 0 0 20px 0; font-size: 22px;">Verify Your Email Address</h2>
              <p style="color: #666666; line-height: 1.6; margin: 0 0 25px 0;">
                Thank you for signing up for FlacronAI! Please click the button below to verify your email address and activate your account.
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verificationLink}"
                   style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
                  Verify Email Address
                </a>
              </div>
              <p style="color: #999999; font-size: 13px; line-height: 1.5; margin: 25px 0 0 0;">
                If you didn't create an account with FlacronAI, you can safely ignore this email.
              </p>
              <hr style="border: none; border-top: 1px solid #eeeeee; margin: 30px 0;">
              <p style="color: #999999; font-size: 12px; margin: 0;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${verificationLink}" style="color: #667eea; word-break: break-all;">${verificationLink}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 30px; text-align: center;">
              <p style="color: #999999; font-size: 12px; margin: 0;">
                &copy; ${new Date().getFullYear()} FlacronAI by Flacron Enterprises. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `
FlacronAI - Verify Your Email Address

Thank you for signing up for FlacronAI!

Please click the link below to verify your email address:
${verificationLink}

If you didn't create an account with FlacronAI, you can safely ignore this email.

© ${new Date().getFullYear()} FlacronAI by Flacron Enterprises
    `
  };

  try {
    const info = await transport.sendMail(mailOptions);
    console.log(`✅ Verification email sent to ${email} (Message ID: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Failed to send verification email to ${email}:`, error.message);
    return {
      success: false,
      error: error.message,
      verificationLink // Return link as fallback
    };
  }
};

/**
 * Send password reset email
 * @param {string} email - Recipient email address
 * @param {string} resetLink - Firebase password reset link
 * @returns {Promise<{success: boolean, error?: string}>}
 */
const sendPasswordResetEmail = async (email, resetLink) => {
  const transport = getTransporter();

  if (!transport) {
    console.log('📧 Email service not configured. Reset link:', resetLink);
    return {
      success: false,
      error: 'Email service not configured',
      resetLink
    };
  }

  const mailOptions = {
    from: `"FlacronAI" <${EMAIL_CONFIG.auth.user}>`,
    to: email,
    subject: 'Reset Your FlacronAI Password',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">FlacronAI</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">AI-Powered Insurance Reports</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #ffffff; padding: 40px 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <h2 style="color: #333333; margin: 0 0 20px 0; font-size: 22px;">Reset Your Password</h2>
              <p style="color: #666666; line-height: 1.6; margin: 0 0 25px 0;">
                We received a request to reset your FlacronAI password. Click the button below to create a new password.
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetLink}"
                   style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);">
                  Reset Password
                </a>
              </div>
              <p style="color: #999999; font-size: 13px; line-height: 1.5; margin: 25px 0 0 0;">
                If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
              </p>
              <hr style="border: none; border-top: 1px solid #eeeeee; margin: 30px 0;">
              <p style="color: #999999; font-size: 12px; margin: 0;">
                This link will expire in 1 hour for security reasons.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 30px; text-align: center;">
              <p style="color: #999999; font-size: 12px; margin: 0;">
                &copy; ${new Date().getFullYear()} FlacronAI by Flacron Enterprises. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `
FlacronAI - Reset Your Password

We received a request to reset your FlacronAI password.

Click the link below to create a new password:
${resetLink}

If you didn't request a password reset, you can safely ignore this email.

This link will expire in 1 hour for security reasons.

© ${new Date().getFullYear()} FlacronAI by Flacron Enterprises
    `
  };

  try {
    const info = await transport.sendMail(mailOptions);
    console.log(`✅ Password reset email sent to ${email} (Message ID: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Failed to send password reset email to ${email}:`, error.message);
    return {
      success: false,
      error: error.message,
      resetLink
    };
  }
};

/**
 * Test email configuration
 * @returns {Promise<{success: boolean, error?: string}>}
 */
const testEmailConfig = async () => {
  const transport = getTransporter();

  if (!transport) {
    return { success: false, error: 'Email service not configured' };
  }

  try {
    await transport.verify();
    console.log('✅ Email service configured and ready');
    return { success: true };
  } catch (error) {
    console.error('❌ Email configuration error:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  testEmailConfig
};
