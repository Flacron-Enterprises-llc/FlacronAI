// Export report utilities for FlacronAI

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

/**
 * Helper function to trigger file download
 */
const triggerFileDownload = (url, fileName) => {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Helper function to construct full URL from relative path
 */
const constructFullUrl = (url) => {
  if (!url) return null;
  return url.startsWith('http') ? url : `${API_BASE_URL.replace('/api', '')}${url}`;
};

export const exportReport = async (reportId, format, authToken, triggerDownload = true) => {
  try {
    const exportUrl = `${API_BASE_URL}/reports/${reportId}/export`;
    console.log('📤 Exporting report:', { reportId, format, exportUrl, hasToken: !!authToken });

    const response = await fetch(exportUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ format })
    });

    console.log('Export response status:', response.status);
    const result = await response.json();
    console.log('Export result:', result);

    if (!result.success) {
      throw new Error(result.error || 'Failed to export report');
    }

    if (format === 'html') {
      if (triggerDownload) {
        // Open HTML in new window
        const newWindow = window.open();
        if (newWindow) {
          newWindow.document.write(result.html);
          newWindow.document.close();
        }
      }
    } else {
      // Download file (DOCX or PDF)
      if (result.url) {
        const fullUrl = constructFullUrl(result.url);
        result.fullUrl = fullUrl;

        if (triggerDownload) {
          triggerFileDownload(fullUrl, result.fileName || `report.${format}`);
        }
      }
    }

    return result;
  } catch (error) {
    console.error('Export error:', error);
    throw error;
  }
};

/**
 * Export report as DOCX and automatically download the converted PDF as well
 * The PDF is an exact conversion of the DOCX (same content, layout, styling)
 */
export const exportAsDocx = async (reportId, authToken, triggerDownload = true) => {
  try {
    const result = await exportReport(reportId, 'docx', authToken, false);

    if (triggerDownload && result.success) {
      // Download DOCX
      if (result.url) {
        const docxUrl = constructFullUrl(result.url);
        triggerFileDownload(docxUrl, result.fileName || 'report.docx');
      }

      // Also download the PDF conversion (identical to DOCX, just converted)
      if (result.hasPdfConversion && result.pdfUrl) {
        const pdfUrl = constructFullUrl(result.pdfUrl);
        // Small delay to ensure both downloads trigger properly
        setTimeout(() => {
          triggerFileDownload(pdfUrl, result.pdfFileName || 'report.pdf');
        }, 500);
      }
    }

    return result;
  } catch (error) {
    console.error('Export DOCX error:', error);
    throw error;
  }
};

export const exportAsPdf = (reportId, authToken, triggerDownload = true) => exportReport(reportId, 'pdf', authToken, triggerDownload);
export const exportAsHtml = (reportId, authToken, triggerDownload = true) => exportReport(reportId, 'html', authToken, triggerDownload);

export default {
  exportReport,
  exportAsDocx,
  exportAsPdf,
  exportAsHtml
};
