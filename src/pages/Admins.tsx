import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Admin } from '../types';

const PAGE_MODULES = [
  { id: 'dashboard', label: 'System Overview' },
  { id: 'countries', label: 'Countries' },
  { id: 'schools', label: 'Schools' },
  { id: 'meals', label: 'Master Meals' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'vendor_menu', label: 'Vendor Menus' },
  { id: 'combos', label: 'Vendor Combos' },
  { id: 'gists', label: 'Gist Moderation' },
  { id: 'tickets', label: 'Tickets' },
  { id: 'coupons', label: 'Coupons' },
  { id: 'notifications', label: 'Broadcasts' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'library', label: 'E-Library' },
  { id: 'users', label: 'User Management' },
  { id: 'logs', label: 'App Logs' },
  { id: 'admins', label: 'Account Permissions' },
  { id: 'metadata', label: 'System Metadata' },
  { id: 'stores', label: 'Stores' },
  { id: 'services', label: 'Services' },
    { id: 'approvals', label: 'Pending Approvals' },
  { id: 'feed_approvals', label: 'Feed Approvals' },
  { id: 'schools_mgmt', label: 'School Mgmt' },
  { id: 'analytics', label: 'Analytics & Growth' },
  // Company Finance was reachable in the sidebar but missing from this list,
  // so it could never actually be granted -- only the super-admin ever saw
  // it. Its individual screens are below, because granting the whole thing in
  // one tick hands over every salary and the cap table along with it.
  { id: 'finance', label: 'Company Finance' },
];

/**
 * The screens inside Company Finance.
 *
 * SEPARATE FROM THE LIST ABOVE ON PURPOSE. "Company Finance" as a single
 * permission is all-or-nothing, and the things behind it are not equivalent:
 * campus income is something a student partner should see, and what every
 * officer is paid is not. `sensitive` marks the ones that expose an
 * individual's pay or somebody's ownership, so it is obvious at the moment of
 * granting rather than afterwards.
 *
 * Ticking a screen here is only half of it. Writing -- certifying a month,
 * recording a payment, moving shares -- is gated separately by the finance
 * role on the Access tab, and a screen granted here still opens read-only for
 * anyone who is not the founder.
 */
const FINANCE_SCREENS = [
  { id: 'overview',    label: 'Money in & out',
    hint: 'Income, expenses and the running total.' },
  { id: 'live',        label: 'Live split',
    hint: 'What each stakeholder has earned in real time.' },
  { id: 'grossprofit', label: 'Gross profit',
    hint: 'The monthly certification and expense tagging.' },
  { id: 'payroll',     label: 'Payroll', sensitive: true,
    hint: 'Every salary, what was paid, and the receipts.' },
  { id: 'captable',    label: 'Ownership & share price', sensitive: true,
    hint: 'Who owns what, and what a share is worth.' },
  { id: 'milestones',  label: 'Milestones',
    hint: 'Award schemes, challenges and vesting.' },
  { id: 'round',       label: 'Round modelling', sensitive: true,
    hint: 'Dilution modelling. Reads the full cap table.' },
  { id: 'mystake',     label: 'My stake',
    hint: "Only ever the signed-in person's own holding." },
  { id: 'schools',     label: 'Campuses',
    hint: 'Campus income and revenue-share agreements.' },
  { id: 'people',      label: 'People', sensitive: true,
    hint: 'Staff records, contracts and salaries.' },
  { id: 'record',      label: 'Record',
    hint: 'Log income, expenses, valuations and share moves.' },
  { id: 'reports',     label: 'Reports',
    hint: 'Exports and statements.' },
];

export default function Admins() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [canCreateUnlimited, setCanCreateUnlimited] = useState(false);
  const [maxSupply, setMaxSupply] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const [allowedPages, setAllowedPages] = useState<Record<string, boolean>>(() => {
    return PAGE_MODULES.reduce((acc, p) => ({...acc, [p.id]: true}), {});
  });
  // Finance screens start OFF even though pages start on. The rest of the
  // admin app is operational; this is payroll and ownership, and the safe
  // default for those is nothing.
  const [financeTabs, setFinanceTabs] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const { get, post, put, del } = useApi();

  const fetchAdmins = async () => {
    try {
      const data = await get<Admin[]>('/api/admins');
      setAdmins(data);
    } catch (e: any) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const resetForm = () => {
    setEmail('');
    setTitle('');
    setCanCreateUnlimited(false);
    setMaxSupply(1);
    setAllowedPages(PAGE_MODULES.reduce((acc, p) => ({...acc, [p.id]: true}), {}));
    setFinanceTabs({});
    setEditingId(null);
    setError('');
  };

  const handleEditInit = (admin: Admin) => {
    setEditingId(admin.id);
    setEmail(admin.email);
    setTitle(admin.title);
    
    const perms = (admin.permissions as any) || {};
    setCanCreateUnlimited(!!perms.canCreateUnlimited);
    setMaxSupply(perms.maxSupply || 1);
    
    const newAllowedPages: Record<string, boolean> = {};
    if (perms.all) {
      PAGE_MODULES.forEach(p => newAllowedPages[p.id] = true);
    } else if (perms.pages) {
      PAGE_MODULES.forEach(p => newAllowedPages[p.id] = perms.pages.includes(p.id));
    } else {
      PAGE_MODULES.forEach(p => newAllowedPages[p.id] = false);
    }
    setAllowedPages(newAllowedPages);

    // An admin saved before finance screens existed has no finance_tabs key.
    // That reads as "nothing granted" rather than "everything granted": the
    // absence of a decision is not consent to see everybody's salary.
    const granted: string[] = perms.finance_tabs || [];
    const newFinance: Record<string, boolean> = {};
    FINANCE_SCREENS.forEach(t => newFinance[t.id] = granted.includes(t.id));
    setFinanceTabs(newFinance);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const selectedPages = Object.keys(allowedPages).filter(key => allowedPages[key]);
    if (selectedPages.length === 0) {
      return setError('Please select at least one page module to grant access to.');
    }

    const selectedFinanceCount =
      Object.keys(financeTabs).filter(k => financeTabs[k]).length;
    if (allowedPages.finance && selectedFinanceCount === 0) {
      return setError(
        'Company Finance is ticked but none of its screens are. Pick at least '
        + 'one screen, or untick Company Finance -- as it stands this account '
        + 'would see the page and nothing on it.');
    }

    try {
      const selectedFinance = Object.keys(financeTabs).filter(k => financeTabs[k]);

      const permissions = {
        pages: selectedPages,
        // Only meaningful alongside the 'finance' page. Stored regardless so
        // a revoked-then-restored account keeps the screens it had.
        finance_tabs: selectedFinance,
        canCreateUnlimited,
        maxSupply
      };
      
      if (editingId) {
        await put(`/api/admins/${editingId}`, { title, permissions });
      } else {
        await post('/api/admins', { email, title, permissions });
      }
      
      resetForm();
      fetchAdmins();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const confirmDelete = async () => {
    if (!revokingId) return;
    try {
      await del(`/api/admins/${revokingId}`);
      setRevokingId(null);
      fetchAdmins();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const togglePage = (id: string) => {
    setAllowedPages(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleFinance = (id: string) => {
    setFinanceTabs(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const setAllFinance = (on: boolean) => {
    setFinanceTabs(FINANCE_SCREENS.reduce(
      (acc, t) => ({ ...acc, [t.id]: on }), {}));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-200">Account Permissions</h1>
        <p className="text-sm text-slate-500 mt-1">Authorize new team members to access the workspace.</p>
      </div>

      <div className={`bg-white dark:bg-slate-900 border rounded-xl shadow-sm p-6 ${editingId ? 'border-2 border-indigo-500 ring-4 ring-indigo-50' : 'border-slate-200 dark:border-slate-800'}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">{editingId ? 'Edit Access' : 'Grant Access'}</h2>
          {editingId && <button onClick={resetForm} className="text-xs font-bold text-slate-500 hover:text-slate-800">CANCEL</button>}
        </div>
        {error && <div className="p-3 mb-4 text-sm bg-red-50 border border-red-200 text-red-600 rounded-md">{error}</div>}
        <form onSubmit={handleSave} className="space-y-6 max-w-3xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-600 dark:text-slate-400 text-sm">Email Address</label>
              <input 
                type="email" 
                required 
                value={email} 
                onChange={e=>setEmail(e.target.value)}
                disabled={!!editingId}
                className="border border-slate-200 dark:border-slate-800 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-slate-50" 
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-600 dark:text-slate-400 text-sm">Role Title</label>
              <input 
                type="text" 
                required 
                placeholder="e.g. CTO, Ranger"
                value={title}
                onChange={e=>setTitle(e.target.value)}
                className="border border-slate-200 dark:border-slate-800 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500" 
              />
            </div>
          </div>
          
          <div className="border-t border-slate-100 pt-4">
            <label className="font-semibold text-slate-600 dark:text-slate-400 text-sm block mb-3">Coupon Constraints</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={canCreateUnlimited}
                  onChange={(e) => setCanCreateUnlimited(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500" 
                />
                Can generate unlimited coupons
              </label>
              {!canCreateUnlimited && (
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Max Uses/Supply limit:</label>
                  <input
                    type="number"
                    min="1"
                    value={maxSupply}
                    onChange={e => setMaxSupply(parseInt(e.target.value) || 1)}
                    className="border border-slate-200 dark:border-slate-800 rounded px-2 py-1 w-24 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              )}
            </div>
          </div>
          
          <div className="border-t border-slate-100 pt-4">
            <label className="font-semibold text-slate-600 dark:text-slate-400 text-sm block mb-3">Page Access Permissions</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {PAGE_MODULES.map(page => (
                <label key={page.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={!!allowedPages[page.id]} 
                    onChange={() => togglePage(page.id)} 
                    className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500" 
                  />
                  {page.label}
                </label>
              ))}
            </div>
          </div>

          {/* Only once Company Finance is actually granted. A list of screens
              for a page somebody cannot open is noise. */}
          {allowedPages.finance && (
            <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-slate-600 dark:text-slate-400 text-sm">
                  Company Finance Screens
                </label>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => setAllFinance(true)}
                          className="text-xs font-bold text-indigo-600 hover:text-indigo-500">
                    ALL
                  </button>
                  <button type="button" onClick={() => setAllFinance(false)}
                          className="text-xs font-bold text-slate-500 hover:text-slate-700">
                    NONE
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Which screens this account sees inside Company Finance. Screens
                marked <span className="text-amber-600 font-bold">sensitive</span>{' '}
                show an individual&rsquo;s pay or somebody&rsquo;s ownership.
                Being able to <em>change</em> anything is separate again, and is
                set by the finance role on the Access tab.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {FINANCE_SCREENS.map(screen => (
                  <label key={screen.id}
                         className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!financeTabs[screen.id]}
                      onChange={() => toggleFinance(screen.id)}
                      className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 mt-0.5 shrink-0"
                    />
                    <span>
                      {screen.label}
                      {screen.sensitive && (
                        <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 align-middle">
                          sensitive
                        </span>
                      )}
                      <span className="block text-xs text-slate-500 font-normal">
                        {screen.hint}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <button type="submit" className="py-2 px-6 bg-slate-900 text-white rounded-lg font-bold text-xs hover:bg-slate-800 transition-colors">
            {editingId ? 'UPDATE ACCOUNT ACCESS' : 'AUTHORIZE ACCOUNT'}
          </button>
        </form>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-x-auto overflow-hidden">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
            <tr>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Email</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Title</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Coupon Supply</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Permissions (Pages)</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {admins.map((admin) => {
              const perms = (admin.permissions as any) || {};
              const pages = perms?.pages ? perms.pages.join(', ') : (perms?.all ? 'All Access' : 'Custom');
              // Spelled out rather than counted. "3 finance screens" does not
              // tell you whether payroll is one of them.
              const financeGranted: string[] = perms?.finance_tabs || [];
              const financeLabels = FINANCE_SCREENS
                .filter(t => financeGranted.includes(t.id))
                .map(t => t.label);
              const sensitiveGranted = FINANCE_SCREENS
                .filter(t => t.sensitive && financeGranted.includes(t.id));
              const couponStatus = admin.email === 'allowancemobileapp@gmail.com' ? 'Unlimited' : (perms.canCreateUnlimited ? 'Unlimited' : `Max ${perms.maxSupply || 1}`);
              
              return (
                <tr key={admin.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 text-slate-800 dark:text-slate-200 font-medium">{admin.email}</td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{admin.title || 'Admin'}</td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-medium text-xs">{couponStatus}</td>
                  <td className="px-6 py-4 text-slate-500 max-w-xs">
                    <p className="truncate" title={pages}>{pages}</p>
                    {financeLabels.length > 0 && (
                      <p className="text-xs mt-1 whitespace-normal">
                        <span className="font-bold text-slate-400">Finance:</span>{' '}
                        <span className="text-slate-500">
                          {financeLabels.join(', ')}
                        </span>
                        {sensitiveGranted.length > 0 && (
                          <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400">
                            {sensitiveGranted.length} sensitive
                          </span>
                        )}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-3">
                      <button 
                        onClick={() => handleEditInit(admin)}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                        disabled={admin.email === 'allowancemobileapp@gmail.com'}
                      >
                        {admin.email === 'allowancemobileapp@gmail.com' ? 'Superadmin' : 'Edit'}
                      </button>
                      {admin.email !== 'allowancemobileapp@gmail.com' && (
                        <button 
                          onClick={() => setRevokingId(admin.id)}
                          className="text-xs font-bold text-red-600 hover:text-red-800 transition-colors"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {admins.length === 0 && <div className="p-6 text-center text-slate-400 font-medium">No admins found.</div>}
      </div>

      {revokingId && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200 mb-2">Confirm Revocation</h3>
            <p className="text-slate-600 dark:text-slate-400 mb-6">Are you sure you want to completely remove this user's access? This action is permanent and immediate.</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setRevokingId(null)} 
                className="px-4 py-2 text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors shadow-sm"
              >
                Yes, Revoke Access
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
