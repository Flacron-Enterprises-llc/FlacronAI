const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

/**
 * Generate a high-fidelity PDF that mimics the CRU Group Word template using Puppeteer
 */
async function generateProperPDF(reportData, templateData) {
    let browser = null;
    try {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // Prepare the HTML content that mimics the Word template
        const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <style>
        @page {
            size: Letter;
            margin: 0;
        }
        body {
            font-family: Arial, sans-serif;
            font-size: 10pt;
            line-height: 1.3;
            color: #000;
            background: #fff;
        }
        .header-table {
            width: 100%;
            margin-bottom: 20pt;
            border-collapse: collapse;
        }
        .date-row {
            text-align: left;
            margin-bottom: 20pt;
        }
        .company-header {
            font-weight: bold;
            margin-bottom: 5pt;
        }
        .destination-block {
            margin-top: 20pt;
            margin-bottom: 20pt;
        }
        .claim-info-table {
            width: 100%;
            margin-bottom: 20pt;
            border-collapse: collapse;
        }
        .claim-info-table td {
            padding: 2pt 0;
            vertical-align: top;
        }
        .label {
            font-weight: bold;
            width: 120pt;
        }
        .section-header {
            font-weight: bold;
            font-size: 11pt;
            margin-top: 15pt;
            margin-bottom: 5pt;
            border-bottom: 1pt solid #000;
            padding-bottom: 2pt;
        }
        .estimated-loss-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10pt;
            margin-bottom: 15pt;
        }
        .estimated-loss-table th, .estimated-loss-table td {
            border: 0.5pt solid #000;
            padding: 4pt;
            text-align: left;
        }
        .estimated-loss-table th {
            background-color: #f2f2f2;
        }
        .narrative {
            white-space: pre-wrap;
            margin-bottom: 10pt;
            text-align: justify;
        }
        .signature-block {
            margin-top: 40pt;
        }
        .footer {
            position: fixed;
            bottom: 0;
            width: 100%;
            font-size: 8pt;
            text-align: center;
            border-top: 0.5pt solid #ccc;
            padding-top: 5pt;
        }
        .logo {
            color: #FF7C08;
            font-size: 24pt;
            font-weight: bold;
            text-align: center;
            margin-bottom: 10pt;
        }
    </style>
</head>
<body>
    <div class="date-row">${templateData.reportDate || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>

    <div class="destination-block">
        IAT Insurance Group<br>
        702 Oberlin Rd.<br>
        Raleigh, NC 27605
    </div>

    <table class="claim-info-table">
        <tr>
            <td class="label">Client Claim #:</td>
            <td>${templateData.claimNumber || 'N/A'}</td>
        </tr>
        <tr>
            <td class="label">Insured:</td>
            <td>${templateData.insuredName || 'N/A'}</td>
        </tr>
        <tr>
            <td class="label">Loss Location:</td>
            <td>${templateData.riskAddress || 'N/A'}</td>
        </tr>
        <tr>
            <td class="label">Date of Loss:</td>
            <td>${templateData.dateOfLoss || 'N/A'}</td>
        </tr>
    </table>

    <p>This will serve as our ${templateData.reportType || 'inspection report'} on the above captioned assignment.</p>

    <div class="section-header">ESTIMATED LOSS</div>
    <p>The following reserves are suggested for damages observed to date:</p>
    
    <table class="estimated-loss-table">
        <thead>
            <tr>
                <th>Coverage</th>
                <th>Limit</th>
                <th>Prior Reserve</th>
                <th>Change +/-</th>
                <th>Remaining Reserve</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>Dwelling</td>
                <td>${templateData.dwellingLimit || ''}</td>
                <td>${templateData.dwellingPrior || ''}</td>
                <td>${templateData.dwellingChange || ''}</td>
                <td>${templateData.dwellingRemaining || ''}</td>
            </tr>
            <tr>
                <td>Other Structures</td>
                <td>${templateData.otherStructuresLimit || ''}</td>
                <td>${templateData.otherStructuresPrior || ''}</td>
                <td>${templateData.otherStructuresChange || ''}</td>
                <td>${templateData.otherStructuresRemaining || ''}</td>
            </tr>
            <tr>
                <td>Personal Property</td>
                <td>${templateData.personalPropertyLimit || ''}</td>
                <td>${templateData.personalPropertyPrior || ''}</td>
                <td>${templateData.personalPropertyChange || ''}</td>
                <td>${templateData.personalPropertyRemaining || ''}</td>
            </tr>
            <tr>
                <td style="font-weight:bold">Total</td>
                <td style="font-weight:bold">${templateData.totalLimit || ''}</td>
                <td style="font-weight:bold">${templateData.totalPrior || ''}</td>
                <td style="font-weight:bold">${templateData.totalChange || ''}</td>
                <td style="font-weight:bold">${templateData.totalRemaining || ''}</td>
            </tr>
        </tbody>
    </table>

    <div class="section-header">REMARKS</div>
    <div class="narrative">${templateData.remarks || ''}</div>

    <div class="section-header">RISK</div>
    <div class="narrative">${templateData.risk || ''}</div>

    <div class="section-header">ITV (Insurance to Value)</div>
    <div class="narrative">${templateData.itv || 'The limit of insurance appears adequate based on the size, construction quality, and occupancy type.'}</div>

    <div class="section-header">OCCURRENCE</div>
    <div class="narrative">${templateData.occurrence || ''}</div>

    <div class="section-header">COVERAGE</div>
    <div class="narrative">${templateData.coverage || 'The risk is insured with the above stated limits, policy forms, and deductible. All aspects pertaining to coverage are submitted for the carrier\'s review and final disposition.'}</div>

    <div class="section-header">LOSS AND ORIGIN</div>
    <div class="narrative">${templateData.lossOriginDetails || ''}</div>

    <div class="section-header">DAMAGES</div>
    <div class="narrative">${templateData.dwellingDamage || ''}</div>

    ${templateData.hasOtherStructures ? `
    <div class="section-header">OTHER STRUCTURES</div>
    <div class="narrative">${templateData.otherStructuresDetails || ''}</div>
    ` : ''}

    ${templateData.hasRoofDamage ? `
    <div class="section-header">ROOF DAMAGE</div>
    <div class="narrative">${templateData.roofDamages || ''}</div>
    ` : ''}

    <div class="section-header">SUBROGATION / SALVAGE</div>
    <div class="narrative">${templateData.subrogation || 'Our investigation did not reveal any third-party liability or product defects; therefore, subrogation potential is not present at this time.'}</div>

    <div class="section-header">WORK TO BE COMPLETED / RECOMMENDATION</div>
    <div class="narrative">${templateData.recommendation || ''}</div>

    <div class="signature-block">
        Respectfully submitted,<br><br><br>
        <b>FlacronAI</b><br>
        www.flacronai.com
    </div>

    <div class="footer">
        Generated by FlacronAI - Insurance Inspection Solutions
    </div>
</body>
</html>
    `;

        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({
            format: 'Letter',
            printBackground: true,
            displayHeaderFooter: false,
            margin: {
                top: '0.75in',
                right: '0.75in',
                bottom: '0.75in',
                left: '0.75in'
            }
        });

        await browser.close();
        return pdfBuffer;
    } catch (error) {
        if (browser) await browser.close();
        console.error('Puppeteer PDF error:', error);
        throw error;
    }
}

module.exports = { generateProperPDF };
