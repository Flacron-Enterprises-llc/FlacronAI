import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { showNotification } from '../utils/notifications';
import { exportAsDocx, exportAsPdf, exportAsHtml } from '../utils/exportReports';
import { useAutoSave } from '../utils/autoSave';
import {
  showToast,
  celebrate,
  PersonalizedLoading,
  KeyboardShortcuts,
  SmartFieldFormatter
} from '../utils/uxEnhancements';
import { getReportPrompt } from '../config/aiPrompt';
import DragDropUpload from '../components/dashboard/DragDropUpload';
import ContactSalesModal from '../components/common/ContactSalesModal';
import '../styles/command-center.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const Dashboard = () => {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  // State
  const [currentPage, setCurrentPage] = useState('generate');
  const [usageStats, setUsageStats] = useState(null);
  const [currentReportId, setCurrentReportId] = useState(null);
  const [reportContent, setReportContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [myReports, setMyReports] = useState([]);
  const [filteredReports, setFilteredReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [billingHistory, setBillingHistory] = useState([]);
  const [loadingBilling, setLoadingBilling] = useState(false);
  const [reportImages, setReportImages] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [reportViewMode, setReportViewMode] = useState('preview'); // 'preview' or 'editor'
  const [showContactModal, setShowContactModal] = useState(false);

  // Fetch data when token is available
  useEffect(() => {
    if (token) {
      fetchUsageStats();
      fetchMyReports();
      if (currentPage === 'usage') {
        fetchBillingHistory();
      }
    }
  }, [token, currentPage]);

  // Command Center State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandSearch, setCommandSearch] = useState('');
  const [activityPanelOpen, setActivityPanelOpen] = useState(true);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [recentActivity, setRecentActivity] = useState([]);
  const [activeTab, setActiveTab] = useState('all');

  // Form state
  const [formData, setFormData] = useState({
    claimNumber: '',
    insuredName: '',
    lossDate: '',
    lossType: '',
    reportType: '',
    propertyAddress: '',
    propertyDetails: '',
    lossDescription: '',
    damages: '',
    recommendations: '',
    photos: null
  });

  // Auto-save hook
  useAutoSave('reportForm', formData, {
    saveInterval: 3000,
    excludeFields: ['photos'],
    onSave: () => console.log('Auto-saved')
  });

  // Set page title and initialize
  useEffect(() => {
    document.title = 'Dashboard | FlacronAI';

    // Check for saved dark mode preference
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    setDarkMode(savedDarkMode);
    if (savedDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    // Handle hash navigation
    const hash = window.location.hash.slice(1) || 'generate';
    setCurrentPage(hash);

    const handleHashChange = () => {
      const newHash = window.location.hash.slice(1) || 'generate';
      setCurrentPage(newHash);
      if (newHash === 'generate') {
        resetForm();
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Command palette: Ctrl/Cmd + K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      // Close command palette: Escape
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
        setShowShortcuts(false);
      }
      // Quick navigation shortcuts
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
        switch (e.key) {
          case '1':
            e.preventDefault();
            navigateToPage('generate');
            break;
          case '2':
            e.preventDefault();
            navigateToPage('my-reports');
            break;
          case '3':
            e.preventDefault();
            navigateToPage('usage');
            break;
          case '4':
            e.preventDefault();
            navigateToPage('upgrade');
            break;
        }
      }
      // Toggle shortcuts panel: ?
      if (e.key === '?' && !commandPaletteOpen) {
        setShowShortcuts(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen]);

  // Toggle dark mode
  const toggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    localStorage.setItem('darkMode', newDarkMode);
    document.documentElement.setAttribute('data-theme', newDarkMode ? 'dark' : '');
  };

  // Fetch functions
  const fetchUsageStats = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/users/usage`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const result = await response.json();
      if (result.success && result.usage) {
        setUsageStats({
          ...result.usage,
          features: Array.isArray(result.usage.features) ? result.usage.features : []
        });
      } else {
        setUsageStats({ features: [] });
      }
    } catch (error) {
      console.error('Failed to fetch usage stats:', error);
    }
  };

  const fetchMyReports = async () => {
    setLoadingReports(true);
    try {
      const response = await fetch(`${API_BASE_URL}/reports`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const result = await response.json();
      if (result.success) {
        setMyReports(result.reports || []);
        setFilteredReports(result.reports || []);
        // Update recent activity
        const recent = (result.reports || []).slice(0, 5).map(report => ({
          id: report.id,
          type: 'report',
          title: `${report.reportType || 'Report'} - ${report.claimNumber}`,
          time: new Date(report.createdAt).toLocaleDateString(),
          icon: 'document'
        }));
        setRecentActivity(recent);
      }
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setLoadingReports(false);
    }
  };

  const fetchBillingHistory = async () => {
    if (!token) return;
    setLoadingBilling(true);
    try {
      const response = await fetch(`${API_BASE_URL}/payment/billing-history`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const result = await response.json();
      if (result.success) {
        setBillingHistory(result.history || []);
      }
    } catch (error) {
      console.error('Failed to fetch billing history:', error);
    } finally {
      setLoadingBilling(false);
    }
  };

  const fetchPdfPreview = async (reportId) => {
    try {
      const result = await exportAsPdf(reportId, token, false);
      if (result.success && result.fullUrl) {
        setPdfPreviewUrl(result.fullUrl);
      }
    } catch (error) {
      console.error('Failed to fetch PDF preview:', error);
    }
  };

  // Report functions
  const viewReport = (report) => {
    setSelectedReport(report);
    setCurrentReportId(report.id);
    setReportContent(report.content);
    setReportImages(report.images || []);
    setCurrentPage('generate');
    setIsEditing(false);
    setReportViewMode('preview');
    setPdfPreviewUrl(null);
    fetchPdfPreview(report.id);
    window.location.hash = 'generate';
  };

  const deleteReport = async (reportId) => {
    if (!confirm('Are you sure you want to delete this report?')) return;
    try {
      const response = await fetch(`${API_BASE_URL}/reports/${reportId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const result = await response.json();
      if (result.success) {
        showNotification('Report deleted successfully', 'success');
        fetchMyReports();
      } else {
        showNotification(result.error || 'Failed to delete report', 'error');
      }
    } catch (error) {
      console.error('Delete error:', error);
      showNotification('Failed to delete report', 'error');
    }
  };

  const handleInputChange = (e) => {
    const { name, value, files } = e.target;
    if (name === 'photos') {
      setFormData(prev => ({ ...prev, photos: files }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleDragDropFiles = (files) => {
    setFormData(prev => ({ ...prev, photos: files }));
  };

  const handleGenerateReport = async (e) => {
    e.preventDefault();
    if (!formData.claimNumber || !formData.insuredName || !formData.lossType) {
      showNotification('Please fill in all required fields', 'error');
      showToast('Please fill in all required fields', 'error');
      return;
    }

    setLoading(true);
    const loader = new PersonalizedLoading(setLoadingMessage);
    loader.start();

    try {
      const aiPrompt = getReportPrompt(formData);
      const response = await fetch(`${API_BASE_URL}/reports/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          userId: user?.uid,
          customPrompt: aiPrompt,
          photos: null
        })
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to generate report');
      }

      setCurrentReportId(result.reportId);
      setReportContent(result.report.content);

      // Upload photos if any
      if (formData.photos && formData.photos.length > 0) {
        try {
          const photoFormData = new FormData();
          Array.from(formData.photos).forEach((file) => {
            photoFormData.append('images', file);
          });
          const uploadResponse = await fetch(`${API_BASE_URL}/reports/${result.reportId}/images`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: photoFormData
          });
          const uploadResult = await uploadResponse.json();
          if (uploadResult.success) {
            showToast(`${uploadResult.uploaded} photo(s) uploaded successfully`, 'success');
            const reportResponse = await fetch(`${API_BASE_URL}/reports/${result.reportId}`, {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });
            const reportData = await reportResponse.json();
            if (reportData.success && reportData.report.images) {
              setReportImages(reportData.report.images);
            }
          }
        } catch (uploadError) {
          console.error('Photo upload error:', uploadError);
          showNotification('Report generated but photos failed to upload', 'warning');
        }
      } else {
        setReportImages([]);
      }

      celebrate('Report Generated Successfully!', 'success');
      showToast('Report ready for viewing', 'success');
      showNotification('Report generated successfully!', 'success');
      fetchUsageStats();
      fetchMyReports();
      fetchPdfPreview(result.reportId);
      setReportViewMode('preview');
    } catch (error) {
      console.error('Generate report error:', error);
      showNotification(error.message, 'error');
      showToast(error.message, 'error');
    } finally {
      loader.stop();
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const handleSaveReport = async () => {
    if (!currentReportId) return;
    setLoading(true);
    setLoadingMessage('Saving report changes...');
    try {
      const response = await fetch(`${API_BASE_URL}/reports/${currentReportId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: reportContent })
      });
      const result = await response.json();
      if (result.success) {
        showNotification('Report changes saved successfully', 'success');
        showToast('Changes saved. Updating preview...', 'success');
        setIsEditing(false);
        fetchMyReports();
        fetchPdfPreview(currentReportId);
      } else {
        throw new Error(result.error || 'Failed to save changes');
      }
    } catch (error) {
      console.error('Save report error:', error);
      showNotification(error.message, 'error');
      showToast('Error saving changes', 'error');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const resetForm = () => {
    setFormData({
      claimNumber: '',
      insuredName: '',
      lossDate: '',
      lossType: '',
      reportType: '',
      propertyAddress: '',
      propertyDetails: '',
      lossDescription: '',
      damages: '',
      recommendations: '',
      photos: null
    });
    setCurrentReportId(null);
    setReportContent('');
    setReportImages([]);
    setSelectedReport(null);
    setPdfPreviewUrl(null);
    setReportViewMode('preview');
  };

  const fillDemoData = () => {
    setFormData({
      claimNumber: `CLM-${Math.floor(100000 + Math.random() * 900000)}`,
      insuredName: 'Johnathan Smith',
      lossDate: new Date().toISOString().split('T')[0],
      lossType: 'Water',
      reportType: 'First Report',
      propertyAddress: '123 Ocean View Drive, Miami, FL 33101',
      propertyDetails: '2-story residential home, concrete block construction, built in 2012, 3,200 sq ft.',
      lossDescription: 'Sudden pipe burst in the second-floor master bathroom causing water to migrate through the floor into the living area below.',
      damages: 'Direct water damage to bathroom tiling, subfloor, and living room ceiling drywall. Hardwood flooring in the hallway shows signs of warping.',
      recommendations: 'Immediate water mitigation required. Recommend professional drying services and replacement of affected drywall sections.',
      photos: null
    });
    showToast('Form filled with demo data', 'info');
  };

  const handleExport = async (format, reportId = null) => {
    // If we are currently editing the report, save it first to ensure export has latest content
    if (isEditing && !reportId) {
      await handleSaveReport();
    }

    const idToExport = reportId || currentReportId;
    if (!idToExport) {
      showNotification('No report to export', 'error');
      return;
    }
    try {
      if (format === 'docx') {
        await exportAsDocx(idToExport, token);
      } else if (format === 'pdf') {
        await exportAsPdf(idToExport, token);
      } else if (format === 'html') {
        await exportAsHtml(idToExport, token);
      }
      showNotification(`Report exported as ${format.toUpperCase()}`, 'success');
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  const handleUpgradeCheckout = async (tier) => {
    try {
      setLoading(true);
      showNotification('Creating checkout session...', 'info');
      if (!user || !user.uid) {
        showNotification('User not authenticated. Please log in again.', 'error');
        setLoading(false);
        return;
      }
      const response = await fetch(`${API_BASE_URL}/payment/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tier: tier, userId: user.uid })
      });
      const result = await response.json();
      if (result.success && result.url) {
        showNotification('Redirecting to checkout...', 'success');
        window.location.href = result.url;
      } else {
        showNotification(result.error || 'Failed to create checkout session', 'error');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      showNotification('Failed to create checkout session: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const navigateToPage = (page) => {
    setCurrentPage(page);
    window.location.hash = page;
    setMobileMenuOpen(false);
    setCommandPaletteOpen(false);
    if (page === 'my-reports') {
      fetchMyReports();
    } else if (page === 'usage') {
      fetchBillingHistory();
    } else if (page === 'settings') {
      navigate('/settings');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Format report content
  const formatReportContent = (content) => {
    if (!content) return '';
    const lines = content.split('\n');
    let formattedHTML = '';
    let inList = false;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        if (inList) { formattedHTML += '</ul>'; inList = false; }
        formattedHTML += '<br/>';
        return;
      }
      if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && trimmed.length < 100) {
        if (inList) { formattedHTML += '</ul>'; inList = false; }
        formattedHTML += `<h3 style="color: var(--cc-text-primary); font-weight: 700; margin-top: 1.5rem; margin-bottom: 0.75rem; border-bottom: 2px solid var(--cc-accent); padding-bottom: 0.5rem;">${trimmed}</h3>`;
        return;
      }
      if (trimmed.endsWith(':') && trimmed.length < 80) {
        if (inList) { formattedHTML += '</ul>'; inList = false; }
        formattedHTML += `<h4 style="color: var(--cc-text-secondary); font-weight: 600; margin-top: 1rem; margin-bottom: 0.5rem;">${trimmed}</h4>`;
        return;
      }
      if (trimmed.match(/^[-*•]\s/) || trimmed.match(/^\d+\.\s/)) {
        if (!inList) { formattedHTML += '<ul style="margin-left: 1.5rem; margin-bottom: 1rem;">'; inList = true; }
        const itemContent = trimmed.replace(/^[-*•]\s/, '').replace(/^\d+\.\s/, '');
        formattedHTML += `<li style="margin-bottom: 0.5rem; line-height: 1.6;">${itemContent}</li>`;
        return;
      }
      if (inList) { formattedHTML += '</ul>'; inList = false; }
      formattedHTML += `<p style="margin-bottom: 0.75rem; line-height: 1.7; color: var(--cc-text-secondary);">${trimmed}</p>`;
    });
    if (inList) formattedHTML += '</ul>';
    return formattedHTML;
  };

  // Command palette items
  const commandItems = [
    { id: 'new-report', title: 'New Report', desc: 'Create a new insurance report', icon: 'plus', shortcut: ['Ctrl', '1'], action: () => navigateToPage('generate') },
    { id: 'my-reports', title: 'My Reports', desc: 'View all your reports', icon: 'folder', shortcut: ['Ctrl', '2'], action: () => navigateToPage('my-reports') },
    { id: 'usage', title: 'Usage & Billing', desc: 'View your plan and billing', icon: 'chart', shortcut: ['Ctrl', '3'], action: () => navigateToPage('usage') },
    { id: 'upgrade', title: 'Upgrade Plan', desc: 'Upgrade to a higher tier', icon: 'lightning', shortcut: ['Ctrl', '4'], action: () => navigateToPage('upgrade') },
    { id: 'settings', title: 'Settings', desc: 'Manage your account', icon: 'gear', action: () => navigate('/settings') },
    { id: 'dark-mode', title: darkMode ? 'Light Mode' : 'Dark Mode', desc: 'Toggle theme', icon: darkMode ? 'sun' : 'moon', action: toggleDarkMode },
    { id: 'logout', title: 'Log Out', desc: 'Sign out of your account', icon: 'logout', action: handleLogout },
  ];

  const filteredCommands = commandItems.filter(item =>
    item.title.toLowerCase().includes(commandSearch.toLowerCase()) ||
    item.desc.toLowerCase().includes(commandSearch.toLowerCase())
  );

  // Calculate usage percentage for ring
  const usagePercentage = usageStats?.limit === -1 ? 0 : Math.min(100, ((usageStats?.periodUsage || 0) / (usageStats?.limit || 1)) * 100);
  const ringCircumference = 2 * Math.PI * 52;
  const ringOffset = ringCircumference - (usagePercentage / 100) * ringCircumference;

  return (
    <div className="cc-layout">
      {/* Mobile Overlay */}
      <div
        className={`cc-mobile-overlay ${mobileMenuOpen ? 'visible' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`cc-sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="cc-sidebar-header">
          <h1>FLACRON<span>AI</span></h1>
          <button className="cc-collapse-btn" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>

        <nav className="cc-nav">
          <div className="cc-nav-section">
            <div className="cc-nav-label">Main</div>
            <button
              className={`cc-nav-item ${currentPage === 'generate' ? 'active' : ''}`}
              onClick={() => navigateToPage('generate')}
            >
              <svg className="cc-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span className="cc-nav-text">New Report</span>
            </button>

            <button
              className={`cc-nav-item ${currentPage === 'my-reports' ? 'active' : ''}`}
              onClick={() => navigateToPage('my-reports')}
            >
              <svg className="cc-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span className="cc-nav-text">My Reports</span>
            </button>
          </div>

          <div className="cc-nav-section">
            <div className="cc-nav-label">Account</div>
            <button
              className={`cc-nav-item ${currentPage === 'usage' ? 'active' : ''}`}
              onClick={() => navigateToPage('usage')}
            >
              <svg className="cc-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 20V10M12 20V4M6 20v-6" />
              </svg>
              <span className="cc-nav-text">Usage & Billing</span>
              <span className="cc-shortcut-hint">3</span>
            </button>

            <button
              className={`cc-nav-item ${currentPage === 'upgrade' ? 'active' : ''}`}
              onClick={() => navigateToPage('upgrade')}
            >
              <svg className="cc-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="cc-nav-text">Upgrade Plan</span>
              <span className="cc-shortcut-hint">4</span>
            </button>

            <button
              className="cc-nav-item"
              onClick={() => navigate('/settings')}
            >
              <svg className="cc-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
              <span className="cc-nav-text">Settings</span>
            </button>
          </div>
        </nav>

        <div className="cc-sidebar-footer">
          <div className="cc-user-info" onClick={handleLogout}>
            <div className="cc-user-avatar">
              {user?.displayName?.charAt(0) || user?.email?.charAt(0) || 'U'}
            </div>
            <div className="cc-user-details">
              <div className="cc-user-name">{user?.displayName || 'User'}</div>
              <div className="cc-user-plan">{usageStats?.tierName || 'Starter'}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="cc-main">
        {/* Header */}
        <header className="cc-header">
          <div className="cc-header-left">
            <button className="cc-mobile-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            </button>
            <div className="cc-breadcrumb">
              <span className="cc-breadcrumb-item">Dashboard</span>
              <span className="cc-breadcrumb-separator">/</span>
              <span className="cc-breadcrumb-current">
                {currentPage === 'generate' ? 'New Report' : currentPage === 'my-reports' ? 'My Reports' : currentPage === 'usage' ? 'Usage & Billing' : 'Upgrade'}
              </span>
            </div>
          </div>

          <div className="cc-header-right">
            <button className="cc-cmd-trigger" onClick={() => setCommandPaletteOpen(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <span>Search or jump to...</span>
              <div className="cc-cmd-shortcut">
                <kbd>Ctrl</kbd>
                <kbd>K</kbd>
              </div>
            </button>

            <button className="cc-theme-toggle" onClick={toggleDarkMode} title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
              {darkMode ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="5" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                </svg>
              )}
            </button>
          </div>
        </header>

        {/* Content Wrapper */}
        <div className="cc-content-wrapper">
          <div className="cc-content">
            {/* Generate Report Page */}
            {currentPage === 'generate' && !reportContent && (
              <>
                <div className="cc-page-header">
                  <h1 className="cc-page-title">Create New Report</h1>
                  <p className="cc-page-subtitle">Generate professional insurance inspection reports in seconds</p>
                </div>

                {/* Quick Stats */}
                <div className="cc-stats-grid">
                  <div className="cc-stat-card">
                    <div className="cc-stat-header">
                      <div className="cc-stat-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                        </svg>
                      </div>
                    </div>
                    <p className="cc-stat-value">{myReports.length}</p>
                    <p className="cc-stat-label">Total Reports</p>
                  </div>

                  <div className="cc-stat-card">
                    <div className="cc-stat-header">
                      <div className="cc-stat-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <path d="M16 2v4M8 2v4M3 10h18" />
                        </svg>
                      </div>
                    </div>
                    <p className="cc-stat-value">{usageStats?.periodUsage || 0}</p>
                    <p className="cc-stat-label">This Month</p>
                  </div>

                  <div className="cc-stat-card">
                    <div className="cc-stat-header">
                      <div className="cc-stat-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                        </svg>
                      </div>
                    </div>
                    <p className="cc-stat-value">{usageStats?.remaining === -1 ? '∞' : usageStats?.remaining || 0}</p>
                    <p className="cc-stat-label">Remaining</p>
                  </div>

                  <div className="cc-stat-card">
                    <div className="cc-stat-header">
                      <div className="cc-stat-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                    </div>
                    <p className="cc-stat-value">{usageStats?.tierName || 'Starter'}</p>
                    <p className="cc-stat-label">Current Plan</p>
                  </div>
                </div>

                {/* Report Form */}
                <div className="cc-card">
                  <div className="cc-card-header">
                    <h2 className="cc-card-title">Report Details</h2>
                    <div className="cc-tabs">
                      <button className={`cc-tab ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>All Fields</button>
                      <button className={`cc-tab ${activeTab === 'required' ? 'active' : ''}`} onClick={() => setActiveTab('required')}>Required Only</button>
                    </div>
                  </div>
                  <div className="cc-card-body">
                    <form onSubmit={handleGenerateReport}>
                      <div className="cc-form-section">
                        <h3 className="cc-form-section-title">
                          Claim Information
                          <span className="cc-shortcut-hint">Tab to navigate</span>
                        </h3>
                        <div className="cc-form-grid">
                          <div className="cc-form-group">
                            <label className="cc-form-label">Claim Number *</label>
                            <input
                              type="text"
                              className="cc-form-input"
                              name="claimNumber"
                              value={formData.claimNumber}
                              onChange={handleInputChange}
                              required
                              placeholder="Enter claim number"
                            />
                          </div>
                          <div className="cc-form-group">
                            <label className="cc-form-label">Insured Name *</label>
                            <input
                              type="text"
                              className="cc-form-input"
                              name="insuredName"
                              value={formData.insuredName}
                              onChange={handleInputChange}
                              onBlur={(e) => {
                                const formatted = SmartFieldFormatter.capitalizeName(e.target.value);
                                setFormData(prev => ({ ...prev, insuredName: formatted }));
                              }}
                              required
                              placeholder="Enter insured name"
                            />
                          </div>
                          <div className="cc-form-group">
                            <label className="cc-form-label">Loss Date *</label>
                            <input
                              type="date"
                              className="cc-form-input"
                              name="lossDate"
                              value={formData.lossDate}
                              onChange={handleInputChange}
                              required
                            />
                          </div>
                          <div className="cc-form-group">
                            <label className="cc-form-label">Loss Type *</label>
                            <select
                              className="cc-form-select"
                              name="lossType"
                              value={formData.lossType}
                              onChange={handleInputChange}
                              required
                            >
                              <option value="">Select Loss Type</option>
                              <option value="Fire">Fire</option>
                              <option value="Water">Water</option>
                              <option value="Wind">Wind</option>
                              <option value="Mold">Mold</option>
                              <option value="Theft">Theft</option>
                              <option value="Vandalism">Vandalism</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                          <div className="cc-form-group">
                            <label className="cc-form-label">Report Type *</label>
                            <select
                              className="cc-form-select"
                              name="reportType"
                              value={formData.reportType}
                              onChange={handleInputChange}
                              required
                            >
                              <option value="">Select Report Type</option>
                              <option value="First Report">First Report</option>
                              <option value="Interim Report">Interim Report</option>
                              <option value="Final Report">Final Report</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {activeTab === 'all' && (
                        <>
                          <div className="cc-form-section">
                            <h3 className="cc-form-section-title">Property Details</h3>
                            <div className="cc-form-grid">
                              <div className="cc-form-group full-width">
                                <label className="cc-form-label">Property Address *</label>
                                <input
                                  type="text"
                                  className="cc-form-input"
                                  name="propertyAddress"
                                  value={formData.propertyAddress}
                                  onChange={handleInputChange}
                                  required
                                  placeholder="Enter property address"
                                />
                              </div>
                              <div className="cc-form-group full-width">
                                <label className="cc-form-label">Property Details</label>
                                <textarea
                                  className="cc-form-textarea"
                                  name="propertyDetails"
                                  value={formData.propertyDetails}
                                  onChange={handleInputChange}
                                  placeholder="e.g., 2-story single-family home, built in 1985, 2,500 sq ft..."
                                />
                              </div>
                            </div>
                          </div>

                          <div className="cc-form-section">
                            <h3 className="cc-form-section-title">Loss Description</h3>
                            <div className="cc-form-grid">
                              <div className="cc-form-group full-width">
                                <label className="cc-form-label">Description of Loss *</label>
                                <textarea
                                  className="cc-form-textarea"
                                  name="lossDescription"
                                  value={formData.lossDescription}
                                  onChange={handleInputChange}
                                  required
                                  placeholder="Describe what happened and when..."
                                />
                              </div>
                              <div className="cc-form-group full-width">
                                <label className="cc-form-label">Damages Observed *</label>
                                <textarea
                                  className="cc-form-textarea"
                                  name="damages"
                                  value={formData.damages}
                                  onChange={handleInputChange}
                                  required
                                  placeholder="List all damages observed during inspection..."
                                />
                              </div>
                              <div className="cc-form-group full-width">
                                <label className="cc-form-label">Recommendations</label>
                                <textarea
                                  className="cc-form-textarea"
                                  name="recommendations"
                                  value={formData.recommendations}
                                  onChange={handleInputChange}
                                  placeholder="Your recommendations for repairs, further inspection, etc..."
                                />
                              </div>
                            </div>
                          </div>

                          <div className="cc-form-section">
                            <h3 className="cc-form-section-title">Photos (Optional)</h3>
                            <DragDropUpload onFilesSelected={handleDragDropFiles} maxFiles={10} />
                          </div>
                        </>
                      )}

                      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                        <button type="submit" className="cc-btn cc-btn-primary cc-btn-lg" disabled={loading}>
                          {loading ? (
                            <>
                              <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 12a9 9 0 11-6.219-8.56" />
                              </svg>
                              {loadingMessage || 'Generating...'}
                            </>
                          ) : (
                            <>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              Generate Report
                            </>
                          )}
                        </button>
                        <button type="button" className="cc-btn cc-btn-ghost" onClick={fillDemoData} style={{ color: 'var(--cc-accent)' }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.4rem' }}>
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                          </svg>
                          Quick Demo
                        </button>
                        <button type="button" className="cc-btn cc-btn-secondary" onClick={resetForm}>
                          Clear Form
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </>
            )}

            {/* Report Result */}
            {currentPage === 'generate' && reportContent && (
              <>
                <div className="cc-page-header">
                  <h1 className="cc-page-title">
                    {reportViewMode === 'preview' ? 'Official Document Preview' : 'AI Content Editor'}
                  </h1>
                  <p className="cc-page-subtitle">Report ID: {currentReportId}</p>
                </div>

                <div className="cc-report-actions-bar">
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <div className="cc-tabs">
                      <button
                        className={`cc-tab ${reportViewMode === 'preview' ? 'active' : ''}`}
                        onClick={() => setReportViewMode('preview')}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.4rem' }}>
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                          <path d="M14 2v6h6" />
                        </svg>
                        Document Preview
                      </button>
                      <button
                        className={`cc-tab ${reportViewMode === 'editor' ? 'active' : ''}`}
                        onClick={() => {
                          setReportViewMode('editor');
                          setIsEditing(true);
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.4rem' }}>
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        AI Content Editor
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {reportViewMode === 'editor' && (
                      <button className="cc-btn cc-btn-primary" onClick={handleSaveReport} disabled={loading}>
                        {loading ? 'Saving...' : 'Save & Update Preview'}
                      </button>
                    )}
                    <button className="cc-btn cc-btn-secondary" onClick={() => handleExport('pdf')}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.25rem' }}>
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                      </svg>
                      Download PDF
                    </button>
                    {pdfPreviewUrl && (
                      <button className="cc-btn cc-btn-ghost" onClick={() => window.open(pdfPreviewUrl, '_blank')} title="Open in new tab">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                        </svg>
                      </button>
                    )}
                    <button className="cc-btn cc-btn-ghost" onClick={() => handleExport('docx')}>Download DOCX</button>
                  </div>
                </div>

                <div style={{ background: '#f5f5f5', padding: '1.5rem', borderRadius: '12px', display: 'flex', justifyContent: 'center', minHeight: '800px' }}>
                  {reportViewMode === 'preview' ? (
                    <div style={{
                      width: '100%',
                      maxWidth: '900px',
                      height: '85vh',
                      minHeight: '700px',
                      maxHeight: '1200px',
                      background: '#fff',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                      borderRadius: '4px',
                      overflow: 'hidden'
                    }}>
                      {pdfPreviewUrl ? (
                        <iframe
                          src={`${pdfPreviewUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
                          width="100%"
                          height="100%"
                          style={{ border: 'none', display: 'block', background: '#fff', minHeight: '100%' }}
                          title="Report Preview"
                        />
                      ) : (
                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--cc-text-muted)', gap: '1rem' }}>
                          <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--cc-accent)" strokeWidth="2">
                            <path d="M21 12a9 9 0 11-6.219-8.56" />
                          </svg>
                          <p>Preparing official document preview...</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="cc-report-paper">
                      <textarea
                        className="cc-report-editor-textarea"
                        value={reportContent}
                        onChange={(e) => setReportContent(e.target.value)}
                        placeholder="Edit your report content here..."
                      />
                    </div>
                  )}
                </div>

                {reportImages.length > 0 && (
                  <div className="cc-card" style={{ marginTop: '2rem' }}>
                    <div className="cc-card-header">
                      <h2 className="cc-card-title">Attached Photos</h2>
                    </div>
                    <div className="cc-card-body">
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
                        {reportImages.map((image, index) => (
                          <div key={index} style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--cc-border)', background: 'var(--cc-bg)' }}>
                            <img src={image.url} alt={image.fileName || `Photo ${index + 1}`} style={{ width: '100%', height: '140px', objectFit: 'cover' }} />
                            <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--cc-text-muted)', borderTop: '1px solid var(--cc-border)' }}>
                              {image.fileName || `Photo ${index + 1}`}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                  <button className="cc-btn cc-btn-secondary" onClick={resetForm}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Create New Report
                  </button>
                </div>
              </>
            )}

            {/* My Reports Page */}
            {currentPage === 'my-reports' && (
              <>
                <div className="cc-page-header">
                  <h1 className="cc-page-title">My Reports</h1>
                  <p className="cc-page-subtitle">{myReports.length} total reports</p>
                </div>

                {loadingReports ? (
                  <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--cc-accent)" strokeWidth="2" style={{ margin: '0 auto 1rem' }}>
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                    <p style={{ color: 'var(--cc-text-muted)' }}>Loading reports...</p>
                  </div>
                ) : myReports.length === 0 ? (
                  <div className="cc-card" style={{ textAlign: 'center', padding: '3rem' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--cc-text-muted)" strokeWidth="1.5" style={{ margin: '0 auto 1rem' }}>
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                    <h3 style={{ marginBottom: '0.5rem', color: 'var(--cc-text-primary)' }}>No Reports Yet</h3>
                    <p style={{ marginBottom: '1.5rem', color: 'var(--cc-text-muted)' }}>Create your first report to get started</p>
                    <button className="cc-btn cc-btn-primary" onClick={() => navigateToPage('generate')}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      Create Report
                    </button>
                  </div>
                ) : (
                  <div className="cc-reports-list">
                    {myReports.map((report) => (
                      <div key={report.id} className="cc-report-item" onClick={() => viewReport(report)}>
                        <div className="cc-report-icon">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                          </svg>
                        </div>
                        <div className="cc-report-info">
                          <h3 className="cc-report-title">{report.reportType || 'Report'} - {report.claimNumber}</h3>
                          <div className="cc-report-meta">
                            <span>{report.insuredName}</span>
                            <span>{report.lossType}</span>
                            <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="cc-report-actions">
                          <button className="cc-btn cc-btn-icon cc-btn-ghost" onClick={(e) => { e.stopPropagation(); handleExport('pdf', report.id); }} title="Export PDF">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                              <path d="M14 2v6h6M12 18v-6M9 15l3 3 3-3" />
                            </svg>
                          </button>
                          <button className="cc-btn cc-btn-icon cc-btn-ghost" onClick={(e) => { e.stopPropagation(); deleteReport(report.id); }} title="Delete" style={{ color: '#ef4444' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Usage & Billing Page */}
            {currentPage === 'usage' && (
              <>
                <div className="cc-page-header">
                  <h1 className="cc-page-title">Usage & Billing</h1>
                  <p className="cc-page-subtitle">Manage your subscription and view usage</p>
                </div>

                <div className="cc-billing-stats-grid">
                  <div className="cc-card">
                    <div className="cc-card-header">
                      <h2 className="cc-card-title">Current Plan</h2>
                      {usageStats?.tier !== 'enterprise' && (
                        <button className="cc-btn cc-btn-primary" onClick={() => navigateToPage('upgrade')}>Upgrade</button>
                      )}
                    </div>
                    <div className="cc-card-body" style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                      <div className="cc-usage-ring">
                        <svg width="120" height="120" viewBox="0 0 120 120">
                          <circle className="cc-usage-ring-bg" cx="60" cy="60" r="52" />
                          <circle
                            className="cc-usage-ring-fill"
                            cx="60"
                            cy="60"
                            r="52"
                            strokeDasharray={ringCircumference}
                            strokeDashoffset={ringOffset}
                          />
                        </svg>
                        <div className="cc-usage-ring-text">
                          <span className="cc-usage-ring-value">{usageStats?.periodUsage || 0}</span>
                          <span className="cc-usage-ring-label">of {usageStats?.limit === -1 ? '∞' : usageStats?.limit || 0}</span>
                        </div>
                      </div>
                      <div>
                        <h3 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--cc-text-primary)', marginBottom: '0.25rem' }}>{usageStats?.tierName || 'Starter'}</h3>
                        <p style={{ color: 'var(--cc-text-muted)', marginBottom: '1rem' }}>{usageStats?.price === 'Free' ? 'Free' : `$${usageStats?.price}/month`}</p>
                        <p style={{ fontSize: '0.875rem', color: 'var(--cc-text-secondary)' }}>
                          {usageStats?.remaining === -1 ? 'Unlimited' : usageStats?.remaining || 0} reports remaining this month
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="cc-card">
                    <div className="cc-card-header">
                      <h2 className="cc-card-title">Plan Features</h2>
                    </div>
                    <div className="cc-card-body">
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {(Array.isArray(usageStats?.features) ? usageStats.features : ['AI-powered reports', 'PDF & DOCX export', 'Professional templates', 'Email support']).map((feature, i) => (
                          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', color: 'var(--cc-text-secondary)' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cc-accent)" strokeWidth="2">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="cc-card">
                  <div className="cc-card-header">
                    <h2 className="cc-card-title">Billing History</h2>
                    <button className="cc-btn cc-btn-ghost" onClick={fetchBillingHistory} disabled={loadingBilling} style={{ padding: '0.25rem' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                      </svg>
                    </button>
                  </div>
                  <div className="cc-card-body">
                    {loadingBilling ? (
                      <p style={{ textAlign: 'center', color: 'var(--cc-text-muted)', padding: '2rem' }}>Loading...</p>
                    ) : billingHistory.length === 0 ? (
                      <p style={{ textAlign: 'center', color: 'var(--cc-text-muted)', padding: '2rem' }}>No billing history yet</p>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '1px solid var(--cc-border)', color: 'var(--cc-text-secondary)', fontWeight: '600', fontSize: '0.8125rem' }}>Date</th>
                            <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '1px solid var(--cc-border)', color: 'var(--cc-text-secondary)', fontWeight: '600', fontSize: '0.8125rem' }}>Description</th>
                            <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '1px solid var(--cc-border)', color: 'var(--cc-text-secondary)', fontWeight: '600', fontSize: '0.8125rem' }}>Amount</th>
                            <th style={{ textAlign: 'left', padding: '0.75rem', borderBottom: '1px solid var(--cc-border)', color: 'var(--cc-text-secondary)', fontWeight: '600', fontSize: '0.8125rem' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.isArray(billingHistory) && billingHistory.map((item) => (
                            <tr key={item.id}>
                              <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--cc-border)', color: 'var(--cc-text-primary)', fontSize: '0.875rem' }}>{item.date}</td>
                              <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--cc-border)', color: 'var(--cc-text-primary)', fontSize: '0.875rem' }}>{item.description}</td>
                              <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--cc-border)', color: 'var(--cc-text-primary)', fontSize: '0.875rem' }}>{item.amount}</td>
                              <td style={{ padding: '0.75rem', borderBottom: '1px solid var(--cc-border)' }}>
                                <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600', background: item.status === 'Paid' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: item.status === 'Paid' ? '#22c55e' : '#f59e0b' }}>{item.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Upgrade Page */}
            {currentPage === 'upgrade' && (
              <>
                <div className="cc-page-header">
                  <h1 className="cc-page-title">Upgrade Your Plan</h1>
                  <p className="cc-page-subtitle">Choose the perfect plan for your needs</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                  {/* Professional */}
                  <div className="cc-card cc-popular-card">
                    <div className="cc-popular-badge">Popular</div>
                    <div className="cc-card-body" style={{ textAlign: 'center', padding: '2rem' }}>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--cc-text-primary)', marginBottom: '0.5rem' }}>Professional</h3>
                      <div style={{ marginBottom: '1.5rem' }}>
                        <span style={{ fontSize: '2.5rem', fontWeight: '700', color: 'var(--cc-text-primary)' }}>$39.99</span>
                        <span style={{ color: 'var(--cc-text-muted)' }}>/month</span>
                      </div>
                      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem', textAlign: 'left' }}>
                        {['20 reports/month', 'AI-powered generation', 'PDF & DOCX export', 'No watermark', 'Custom logo', 'Email support'].map((f, i) => (
                          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0', color: 'var(--cc-text-secondary)', fontSize: '0.875rem' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cc-accent)" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
                            {f}
                          </li>
                        ))}
                      </ul>
                      <button className="cc-btn cc-btn-primary" style={{ width: '100%' }} onClick={() => handleUpgradeCheckout('professional')} disabled={loading || usageStats?.tier === 'professional'}>
                        {usageStats?.tier === 'professional' ? 'Current Plan' : 'Select Professional'}
                      </button>
                    </div>
                  </div>

                  {/* Agency */}
                  <div className="cc-card">
                    <div className="cc-card-body" style={{ textAlign: 'center', padding: '2rem' }}>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--cc-text-primary)', marginBottom: '0.5rem' }}>Agency</h3>
                      <div style={{ marginBottom: '1.5rem' }}>
                        <span style={{ fontSize: '2.5rem', fontWeight: '700', color: 'var(--cc-text-primary)' }}>$99.99</span>
                        <span style={{ color: 'var(--cc-text-muted)' }}>/month</span>
                      </div>
                      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem', textAlign: 'left' }}>
                        {['100 reports/month', '5 user accounts', 'All export formats', 'Agency dashboard', 'Custom branding', 'Priority support'].map((f, i) => (
                          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0', color: 'var(--cc-text-secondary)', fontSize: '0.875rem' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cc-accent)" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
                            {f}
                          </li>
                        ))}
                      </ul>
                      <button className="cc-btn cc-btn-secondary" style={{ width: '100%' }} onClick={() => handleUpgradeCheckout('agency')} disabled={loading || usageStats?.tier === 'agency'}>
                        {usageStats?.tier === 'agency' ? 'Current Plan' : 'Select Agency'}
                      </button>
                    </div>
                  </div>

                  {/* Enterprise */}
                  <div className="cc-card">
                    <div className="cc-card-body" style={{ textAlign: 'center', padding: '2rem' }}>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--cc-text-primary)', marginBottom: '0.5rem' }}>Enterprise</h3>
                      <div style={{ marginBottom: '1.5rem' }}>
                        <span style={{ fontSize: '2.5rem', fontWeight: '700', color: 'var(--cc-text-primary)' }}>$499</span>
                        <span style={{ color: 'var(--cc-text-muted)' }}>/month</span>
                      </div>
                      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem', textAlign: 'left' }}>
                        {['Unlimited reports', 'Unlimited users', 'API access', 'White-label portal', 'Custom integration', 'Dedicated support'].map((f, i) => (
                          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0', color: 'var(--cc-text-secondary)', fontSize: '0.875rem' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cc-accent)" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
                            {f}
                          </li>
                        ))}
                      </ul>
                      <button className="cc-btn cc-btn-secondary" style={{ width: '100%' }} onClick={() => usageStats?.tier !== 'enterprise' && setShowContactModal(true)} disabled={usageStats?.tier === 'enterprise'}>
                        {usageStats?.tier === 'enterprise' ? 'Current Plan' : 'Contact Sales'}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Activity Panel */}
          <aside className={`cc-activity-panel ${!activityPanelOpen ? 'hidden' : ''}`}>
            <div className="cc-activity-header">
              <h3>Recent Activity</h3>
              <button className="cc-activity-toggle" onClick={() => setActivityPanelOpen(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="cc-activity-list">
              {recentActivity.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--cc-text-muted)', padding: '2rem 1rem', fontSize: '0.875rem' }}>No recent activity</p>
              ) : (
                recentActivity.map((activity) => (
                  <div key={activity.id} className="cc-activity-item">
                    <div className="cc-activity-icon success">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <path d="M14 2v6h6" />
                      </svg>
                    </div>
                    <div className="cc-activity-content">
                      <div className="cc-activity-title">{activity.title}</div>
                      <div className="cc-activity-meta">{activity.time}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      </main>

      {/* Command Palette */}
      {commandPaletteOpen && (
        <div className="cc-cmd-palette-overlay" onClick={() => setCommandPaletteOpen(false)}>
          <div className="cc-cmd-palette" onClick={(e) => e.stopPropagation()}>
            <div className="cc-cmd-input-wrapper">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                className="cc-cmd-input"
                placeholder="Type a command or search..."
                value={commandSearch}
                onChange={(e) => setCommandSearch(e.target.value)}
                autoFocus
              />
              <kbd style={{ fontSize: '0.6875rem', padding: '0.125rem 0.375rem', background: 'var(--cc-bg)', border: '1px solid var(--cc-border)', borderRadius: '4px', color: 'var(--cc-text-muted)' }}>ESC</kbd>
            </div>
            <div className="cc-cmd-results">
              <div className="cc-cmd-group">
                <div className="cc-cmd-group-label">Commands</div>
                {filteredCommands.map((item) => (
                  <div key={item.id} className="cc-cmd-item" onClick={item.action}>
                    <div className="cc-cmd-item-icon">
                      {item.icon === 'plus' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>}
                      {item.icon === 'folder' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>}
                      {item.icon === 'chart' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 20V10M12 20V4M6 20v-6" /></svg>}
                      {item.icon === 'lightning' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                      {item.icon === 'gear' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" /></svg>}
                      {item.icon === 'sun' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>}
                      {item.icon === 'moon' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>}
                      {item.icon === 'logout' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>}
                    </div>
                    <div className="cc-cmd-item-content">
                      <div className="cc-cmd-item-title">{item.title}</div>
                      <div className="cc-cmd-item-desc">{item.desc}</div>
                    </div>
                    {item.shortcut && (
                      <div className="cc-cmd-item-shortcut">
                        {item.shortcut.map((key, i) => <kbd key={i}>{key}</kbd>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Panel */}
      <div className={`cc-shortcuts-panel ${showShortcuts ? 'visible' : ''}`}>
        <div className="cc-shortcuts-title">Keyboard Shortcuts</div>
        <div className="cc-shortcut-row">
          <span className="cc-shortcut-label">Command Palette</span>
          <div className="cc-shortcut-keys"><kbd>Ctrl</kbd><kbd>K</kbd></div>
        </div>
        <div className="cc-shortcut-row">
          <span className="cc-shortcut-label">New Report</span>
          <div className="cc-shortcut-keys"><kbd>Ctrl</kbd><kbd>1</kbd></div>
        </div>
        <div className="cc-shortcut-row">
          <span className="cc-shortcut-label">My Reports</span>
          <div className="cc-shortcut-keys"><kbd>Ctrl</kbd><kbd>2</kbd></div>
        </div>
        <div className="cc-shortcut-row">
          <span className="cc-shortcut-label">Usage</span>
          <div className="cc-shortcut-keys"><kbd>Ctrl</kbd><kbd>3</kbd></div>
        </div>
        <div className="cc-shortcut-row">
          <span className="cc-shortcut-label">Upgrade</span>
          <div className="cc-shortcut-keys"><kbd>Ctrl</kbd><kbd>4</kbd></div>
        </div>
        <div className="cc-shortcut-row">
          <span className="cc-shortcut-label">Toggle Shortcuts</span>
          <div className="cc-shortcut-keys"><kbd>?</kbd></div>
        </div>
      </div>

      {/* Shortcuts Trigger */}
      <button className="cc-shortcuts-trigger" onClick={() => setShowShortcuts(!showShortcuts)} title="Keyboard Shortcuts (?)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" />
        </svg>
      </button>

      {/* Contact Sales Modal */}
      <ContactSalesModal
        isOpen={showContactModal}
        onClose={() => setShowContactModal(false)}
      />
    </div>
  );
};

export default Dashboard;
