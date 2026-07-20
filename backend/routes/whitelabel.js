const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const { getFirestore } = require('../config/firebase');
const { authenticateToken, requireTier, optionalAuth } = require('../middleware/auth');
const { generatePDF } = require('../utils/properPdfGenerator');
const { whiteLabelObject, uploadBuffer, downloadBuffer, deleteObject } = require('../config/storage');

const enterpriseOnly = requireTier('enterprise');

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, SVG, WebP allowed'));
  },
});

// GET /api/white-label/config
router.get('/config', authenticateToken, enterpriseOnly, async (req, res) => {
  try {
    const db = getFirestore();
    const snap = await db.collection('enterpriseClients').where('userId', '==', req.user.uid).limit(1).get();

    if (snap.empty) {
      return res.json({ success: true, config: null, message: 'No white-label config yet' });
    }

    return res.json({ success: true, config: { id: snap.docs[0].id, ...snap.docs[0].data() } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, code: 'WL_ERROR' });
  }
});

// PUT /api/white-label/customize
router.put('/customize', authenticateToken, enterpriseOnly, async (req, res) => {
  try {
    const db = getFirestore();
    const {
      companyName, subdomain, primaryColor, secondaryColor, logoUrl, headerText,
      footerText, reportFooter, emailFromName, emailFromAddress, hideFlacronBranding
    } = req.body;

    // Validate subdomain
    if (subdomain && !/^[a-z0-9-]+$/.test(subdomain)) {
      return res.status(400).json({ success: false, error: 'Invalid subdomain format', code: 'INVALID_SUBDOMAIN' });
    }

    const snap = await db.collection('enterpriseClients').where('userId', '==', req.user.uid).limit(1).get();

    const configData = {
      userId: req.user.uid,
      companyName: companyName || '',
      subdomain: subdomain || '',
      primaryColor: primaryColor || '#6366f1',
      secondaryColor: secondaryColor || '#8b5cf6',
      logoUrl: logoUrl || null,
      headerText: headerText || '',
      footerText: footerText || '',
      reportFooter: reportFooter || '',
      emailFromName: emailFromName || '',
      emailFromAddress: emailFromAddress || '',
      hideFlacronBranding: hideFlacronBranding === true,
      updatedAt: new Date().toISOString(),
    };

    let docId;
    if (snap.empty) {
      configData.clientId = uuidv4();
      configData.createdAt = new Date().toISOString();
      docId = configData.clientId;
      await db.collection('enterpriseClients').doc(docId).set(configData);
    } else {
      docId = snap.docs[0].id;
      await snap.docs[0].ref.update(configData);
    }

    return res.json({ success: true, config: { id: docId, ...configData } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, code: 'WL_ERROR' });
  }
});

// POST /api/white-label/logo
router.post('/logo', authenticateToken, enterpriseOnly, logoUpload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'No logo file provided' });

  try {
    const db = getFirestore();
    const snap = await db.collection('enterpriseClients').where('userId', '==', req.user.uid).limit(1).get();
    const prevPath = !snap.empty ? snap.docs[0].data().logoPath : null;

    // SVG: store as-is
    if (req.file.mimetype === 'image/svg+xml') {
      const objectPath = whiteLabelObject(req.user.uid, `wl_logo_${Date.now()}.svg`);
      if (prevPath) await deleteObject(prevPath);
      const { url: svgUrl } = await uploadBuffer(objectPath, req.file.buffer, 'image/svg+xml', { publicToken: true });
      if (!snap.empty) await snap.docs[0].ref.update({ logoUrl: svgUrl, logoPath: objectPath, updatedAt: new Date().toISOString() });
      return res.json({ success: true, logoUrl: svgUrl });
    }

    const buf = await sharp(req.file.buffer)
      .resize(400, 200, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();

    const objectPath = whiteLabelObject(req.user.uid, `wl_logo_${Date.now()}.png`);
    if (prevPath) await deleteObject(prevPath);
    const { url: logoUrl } = await uploadBuffer(objectPath, buf, 'image/png', { publicToken: true });
    if (!snap.empty) {
      await snap.docs[0].ref.update({ logoUrl, logoPath: objectPath, updatedAt: new Date().toISOString() });
    }

    return res.json({ success: true, logoUrl });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, code: 'LOGO_ERROR' });
  }
});

// POST /api/white-label/preview
router.post('/preview', authenticateToken, enterpriseOnly, async (req, res) => {
  try {
    const db = getFirestore();
    const snap = await db.collection('enterpriseClients').where('userId', '==', req.user.uid).limit(1).get();
    const wlConfig = snap.empty ? {} : snap.docs[0].data();

    const sampleReport = {
      id: 'preview',
      claimNumber: 'CLM-2024-DEMO',
      insuredName: 'John Smith',
      propertyAddress: '123 Main Street, Anytown, CA 90210',
      lossDate: new Date().toLocaleDateString(),
      lossType: 'Water Damage',
      reportType: 'Initial',
      content: `# INSURANCE INSPECTION REPORT\n\n## SECTION 1: REPORT HEADER\nThis is a preview of your white-label branded report.\n\n## SECTION 2: INSURED INFORMATION\nInsured: John Smith\nProperty: 123 Main Street\n\n## SECTION 3: PROPERTY DESCRIPTION\nSingle-family residential property, approximately 2,400 sq ft.\n\n## SECTION 4: SCOPE OF LOSS\nWater damage from burst pipe affecting multiple areas.\n\n## SECTION 5: DAMAGE ASSESSMENT\n- Living Room: Moderate water damage to flooring\n- Kitchen: Water intrusion behind cabinets\n\n## SECTION 6: SCOPE OF WORK\nEmergency water extraction and drying required.\n\n## SECTION 7: ESTIMATED LOSS SUMMARY\n| Category | Cost |\n|----------|------|\n| Water Extraction | $2,500 |\n| Drywall Repair | $3,200 |\n| Flooring Replacement | $4,800 |\n| **Total** | **$10,500** |\n\n## SECTION 9: CONCLUSION\nClaim approved pending contractor estimates.`,
    };

    const hexToRgb = (hex) => {
      const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return r ? [parseInt(r[1], 16), parseInt(r[2], 16), parseInt(r[3], 16)] : [99, 102, 241];
    };

    let logoBuffer = null;
    if (wlConfig.logoPath) {
      try { logoBuffer = await downloadBuffer(wlConfig.logoPath); } catch { /* logo optional */ }
    }

    const buffer = await generatePDF(sampleReport, {
      logoBuffer,
      companyName: wlConfig.companyName || 'Your Company',
      primaryColor: hexToRgb(wlConfig.primaryColor || '#6366f1'),
      watermark: false,
      reportFooter: wlConfig.reportFooter || null,
      hideFlacronBranding: wlConfig.hideFlacronBranding || false,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="white-label-preview.pdf"');
    return res.send(buffer);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, code: 'PREVIEW_ERROR' });
  }
});

// GET /api/white-label/portal/:subdomain (public)
router.get('/portal/:subdomain', async (req, res) => {
  try {
    const db = getFirestore();
    const snap = await db.collection('enterpriseClients')
      .where('subdomain', '==', req.params.subdomain)
      .limit(1)
      .get();

    if (snap.empty) {
      return res.status(404).json({ success: false, error: 'Portal not found', code: 'NOT_FOUND' });
    }

    const config = snap.docs[0].data();
    // Only return public-safe fields
    return res.json({
      success: true,
      portal: {
        companyName: config.companyName,
        subdomain: config.subdomain,
        primaryColor: config.primaryColor,
        secondaryColor: config.secondaryColor,
        logoUrl: config.logoUrl,
        headerText: config.headerText,
        footerText: config.footerText,
        hideFlacronBranding: config.hideFlacronBranding,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message, code: 'PORTAL_ERROR' });
  }
});

module.exports = router;
