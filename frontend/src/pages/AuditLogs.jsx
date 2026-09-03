import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Navbar from '../components/Navbar';
import AuditLogViewer from '../components/AuditLogViewer';

// Phase 17. A direct, standalone entry point to the same AuditLogViewer
// embedded in OrganizationAdmin.jsx's "Audit Logs" tab -- not a second
// implementation, just a second door into one real component.
export default function AuditLogs() {
  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 pt-24 pb-6">
        <div className="flex items-center gap-3 mb-5">
          <Link to="/organization" aria-label="Back to Organization" className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900">Audit Logs</h1>
            <p className="text-xs text-gray-500 mt-0.5">Filterable record of activity across your organization.</p>
          </div>
        </div>
        <div className="card p-5">
          <AuditLogViewer />
        </div>
      </div>
    </div>
  );
}
