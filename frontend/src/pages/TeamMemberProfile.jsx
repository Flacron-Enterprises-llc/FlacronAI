import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, RefreshCw, AlertCircle, FileText, Image as ImageIcon,
  Clock, Ban, UserCheck, UserX, Edit2, X,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import ConfirmDialog from '../components/ConfirmDialog';
import { teamsAPI } from '../services/api';
import { formatStatus } from '../utils/formatStatus';

// Phase 14 (Team Roles Expansion & Member Profiles). Standalone route ahead
// of the Phase 30 routing migration -- same precedent as ReportPreviewPage
// (Phase 11) and Templates/TemplateBuilder (Phase 13): this one page didn't
// need the whole EnterpriseDashboard activeView architecture migrated first.
// `:memberId` may be the literal "me" -- the backend resolves that to the
// caller's own membership (or a synthesized owner record), so any team
// member can view their own profile even if they can't see the full roster.
const ROLE_COLORS = {
  owner: 'bg-brand-100 text-brand-700 border border-brand-200',
  admin: 'bg-blue-100 text-blue-700 border border-blue-200',
  manager: 'bg-teal-100 text-teal-700 border border-teal-200',
  adjuster: 'bg-violet-100 text-violet-700 border border-violet-200',
  inspector: 'bg-amber-100 text-amber-700 border border-amber-200',
  reviewer: 'bg-indigo-100 text-indigo-700 border border-indigo-200',
  viewer: 'bg-gray-100 text-gray-600 border border-gray-200',
  editor: 'bg-violet-100 text-violet-700 border border-violet-200',
};

export default function TeamMemberProfile() {
  const { memberId } = useParams();
  const navigate = useNavigate();

  const [member, setMember] = useState(null);
  const [stats, setStats] = useState(null);
  const [canManage, setCanManage] = useState(false);
  const [rolesInfo, setRolesInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState(null);

  const [editingRole, setEditingRole] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setErrorCode(null);
    Promise.all([teamsAPI.getMember(memberId), teamsAPI.getRoles().catch(() => null)])
      .then(([memberRes, rolesRes]) => {
        setMember(memberRes.data?.member || null);
        setStats(memberRes.data?.stats || null);
        setCanManage(!!memberRes.data?.canManage);
        setRolesInfo(rolesRes?.data || null);
      })
      .catch((err) => {
        const code = err?.response?.data?.code || (err?.response?.status === 404 ? 'NOT_FOUND' : 'ERROR');
        setErrorCode(code);
      })
      .finally(() => setLoading(false));
  }, [memberId]);

  useEffect(() => { load(); }, [load]);

  const roleLabel = (role) => rolesInfo?.roles?.[role]?.label || role;
  const assignableRoles = rolesInfo?.assignableRoles || [];

  const handleRoleChange = async (role) => {
    setBusy(true);
    try {
      await teamsAPI.updateRole(member.id, role);
      toast.success('Role updated');
      setEditingRole(false);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to update role');
    } finally {
      setBusy(false);
    }
  };

  const handleSuspend = async () => {
    setBusy(true);
    try {
      await teamsAPI.suspendMember(member.id);
      toast.success('Member suspended — their access is revoked immediately');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to suspend member');
    } finally {
      setBusy(false);
    }
  };

  const handleReactivate = async () => {
    setBusy(true);
    try {
      await teamsAPI.reactivateMember(member.id);
      toast.success('Member reactivated');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to reactivate member');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    try {
      await teamsAPI.remove(member.id);
      toast.success('Member removed');
      navigate('/enterprise-dashboard?view=team');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to remove member');
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-32 gap-3">
          <RefreshCw className="w-8 h-8 text-brand-500 animate-spin" />
          <p className="text-sm text-gray-500">Loading profile…</p>
        </div>
      </div>
    );
  }

  if (errorCode || !member) {
    const messages = {
      NOT_FOUND: ['Member not found', "It may have been removed, or you don't have access to it."],
      PROFILE_ACCESS_DENIED: ['You do not have permission to view this profile', 'Only Owners, Admins, and Managers can view other members’ profiles.'],
    };
    const [title, sub] = messages[errorCode] || ["We couldn't load this profile", 'Check your connection and try again.'];
    return (
      <div className="min-h-screen bg-bg">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-32 gap-4 text-center px-4">
          <AlertCircle className="w-10 h-10 text-amber-500" />
          <div>
            <p className="text-gray-900 font-semibold">{title}</p>
            <p className="text-gray-500 text-sm mt-1">{sub}</p>
          </div>
          <div className="flex gap-2">
            {!['NOT_FOUND', 'PROFILE_ACCESS_DENIED'].includes(errorCode) && (
              <button onClick={load} className="btn-secondary text-sm py-2 px-4 flex items-center gap-2">
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
            )}
            <Link to="/enterprise-dashboard?view=team" className="btn-primary text-sm py-2 px-4 flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to Team
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const roleMeta = rolesInfo?.roles?.[member.role];
  const isSuspended = member.status === 'suspended';
  const isPending = member.status === 'pending';

  return (
    <div className="min-h-screen bg-bg">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-5">
          <Link to="/enterprise-dashboard?view=team" aria-label="Back to Team" className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-900 truncate">{member.email}</h1>
            <p className="text-xs text-gray-500">Team member profile</p>
          </div>
        </div>

        <div className="card p-5 mb-4">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center text-lg font-black text-white shrink-0">
              {member.email[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-gray-900 truncate">{member.email}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ROLE_COLORS[member.role] || 'bg-gray-100 text-gray-500'}`}>
                  {roleLabel(member.role)}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isSuspended ? 'bg-red-100 text-red-700' : isPending ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                  {formatStatus(member.status)}
                </span>
              </div>
            </div>
          </div>
          {roleMeta?.legacy && (
            <p className="text-xs text-gray-400 mt-2">This is a legacy role kept from before the current 7-role model. It can be changed but not re-assigned.</p>
          )}
          {member.invitedAt && (
            <p className="text-xs text-gray-400 mt-2">Invited {new Date(member.invitedAt).toLocaleDateString()}{member.acceptedAt ? ` · Accepted ${new Date(member.acceptedAt).toLocaleDateString()}` : ''}</p>
          )}
        </div>

        {canManage && (
          <div className="card p-5 mb-4">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Admin Actions</h2>
            <div className="flex flex-wrap items-center gap-2">
              {editingRole ? (
                <div className="flex items-center gap-2">
                  <select defaultValue={member.role} disabled={busy}
                    onChange={(e) => handleRoleChange(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-[#e5e7eb] bg-white text-sm text-gray-700 focus:outline-none">
                    {!assignableRoles.includes(member.role) && (
                      <option value={member.role} disabled>{roleLabel(member.role)} (current)</option>
                    )}
                    {assignableRoles.map((r) => (
                      <option key={r} value={r}>{roleLabel(r)}</option>
                    ))}
                  </select>
                  <button onClick={() => setEditingRole(false)} disabled={busy} aria-label="Cancel role edit"
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              ) : (
                <button onClick={() => setEditingRole(true)} disabled={busy}
                  className="btn-secondary text-sm py-2 px-4 flex items-center gap-2 disabled:opacity-50">
                  <Edit2 className="w-4 h-4" /> Change Role
                </button>
              )}

              {isSuspended ? (
                <button onClick={handleReactivate} disabled={busy}
                  className="text-sm py-2 px-4 rounded-xl border border-green-200 bg-green-50 text-green-700 font-semibold flex items-center gap-2 hover:bg-green-100 transition-colors disabled:opacity-50">
                  <UserCheck className="w-4 h-4" /> Reactivate
                </button>
              ) : (
                <button onClick={handleSuspend} disabled={busy}
                  className="text-sm py-2 px-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 font-semibold flex items-center gap-2 hover:bg-amber-100 transition-colors disabled:opacity-50">
                  <Ban className="w-4 h-4" /> Suspend
                </button>
              )}

              <button onClick={() => setConfirmRemove(true)} disabled={busy}
                className="text-sm py-2 px-4 rounded-xl border border-red-200 bg-red-50 text-red-600 font-semibold flex items-center gap-2 hover:bg-red-100 transition-colors disabled:opacity-50">
                <UserX className="w-4 h-4" /> Remove
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="card p-4">
            <div className="flex items-center gap-2 text-gray-400 mb-1"><FileText className="w-4 h-4" /><span className="text-xs">Reports Generated</span></div>
            <p className="text-2xl font-black text-gray-900">{stats?.reportsGenerated ?? 0}</p>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2 text-gray-400 mb-1"><ImageIcon className="w-4 h-4" /><span className="text-xs">Photos Analyzed</span></div>
            <p className="text-2xl font-black text-gray-900">{stats?.photosAnalyzed ?? 0}</p>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" /> Recent Activity</h2>
          {!stats?.recentActivity?.length ? (
            <p className="text-sm text-gray-400 py-4 text-center">No recorded activity yet.</p>
          ) : (
            <ul className="space-y-2">
              {stats.recentActivity.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm border-b border-gray-100 last:border-0 pb-2 last:pb-0">
                  <span className="text-gray-700">{formatStatus(a.action)}</span>
                  <span className="text-xs text-gray-400 shrink-0">{a.timestamp ? new Date(a.timestamp).toLocaleString() : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <AnimatePresence>
        {confirmRemove && (
          <ConfirmDialog
            title="Remove team member?"
            message={`${member.email} will lose access immediately and be removed from the team. This cannot be undone (they can be re-invited later).`}
            confirmLabel="Remove"
            danger
            loading={busy}
            onConfirm={handleRemove}
            onClose={() => setConfirmRemove(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
