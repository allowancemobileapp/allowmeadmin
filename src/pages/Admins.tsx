import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Admin } from '../types';

const PAGE_MODULES = [
  { id: 'dashboard', label: 'System Overview' },
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
  { id: 'logs', label: 'App Logs' },
  { id: 'admins', label: 'Account Permissions' },
  { id: 'metadata', label: 'System Metadata' },
];

export default function Admins() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [canCreateUnlimited, setCanCreateUnlimited] = useState(false);
  const [maxSupply, setMaxSupply] = useState(1);
  const [allowedPages, setAllowedPages] = useState<Record<string, boolean>>(() => {
    return PAGE_MODULES.reduce((acc, p) => ({...acc, [p.id]: true}), {});
  });
  const [error, setError] = useState('');
  const { get, post, del } = useApi();

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Check if at least one page is selected
    const selectedPages = Object.keys(allowedPages).filter(key => allowedPages[key]);
    if (selectedPages.length === 0) {
      return setError('Please select at least one page module to grant access to.');
    }

    try {
      const permissions = {
        pages: selectedPages,
        canCreateUnlimited,
        maxSupply
      };
      await post('/api/admins', { email, title, permissions });
      setEmail('');
      setTitle('');
      setCanCreateUnlimited(false);
      setMaxSupply(1);
      setAllowedPages(PAGE_MODULES.reduce((acc, p) => ({...acc, [p.id]: true}), {}));
      fetchAdmins();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to revoke access for this admin?")) return;
    try {
      await del(`/api/admins/${id}`);
      fetchAdmins();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const togglePage = (id: string) => {
    setAllowedPages(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Account Permissions</h1>
        <p className="text-sm text-slate-500 mt-1">Authorize new team members to access the workspace.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Grant Access</h2>
        {error && <div className="p-3 mb-4 text-sm bg-red-50 border border-red-200 text-red-600 rounded-md">{error}</div>}
        <form onSubmit={handleCreate} className="space-y-6 max-w-3xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-600 text-sm">Email Address</label>
              <input 
                type="email" 
                required 
                value={email} 
                onChange={e=>setEmail(e.target.value)}
                className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500" 
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-600 text-sm">Role Title</label>
              <input 
                type="text" 
                required 
                placeholder="e.g. CTO, Ranger"
                value={title}
                onChange={e=>setTitle(e.target.value)}
                className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500" 
              />
            </div>
          </div>
          
          <div className="border-t border-slate-100 pt-4">
            <label className="font-semibold text-slate-600 text-sm block mb-3">Coupon Constraints</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700 font-medium">
                <input 
                  type="checkbox" 
                  checked={canCreateUnlimited}
                  onChange={(e) => setCanCreateUnlimited(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" 
                />
                Can generate unlimited coupons
              </label>
              {!canCreateUnlimited && (
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-slate-700">Max Uses/Supply limit:</label>
                  <input
                    type="number"
                    min="1"
                    value={maxSupply}
                    onChange={e => setMaxSupply(parseInt(e.target.value) || 1)}
                    className="border border-slate-200 rounded px-2 py-1 w-24 text-sm"
                  />
                </div>
              )}
            </div>
          </div>
          
          <div className="border-t border-slate-100 pt-4">
            <label className="font-semibold text-slate-600 text-sm block mb-3">Page Access Permissions</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {PAGE_MODULES.map(page => (
                <label key={page.id} className="flex items-center gap-2 text-sm text-slate-700 font-medium cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={!!allowedPages[page.id]} 
                    onChange={() => togglePage(page.id)} 
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" 
                  />
                  {page.label}
                </label>
              ))}
            </div>
          </div>

          <button type="submit" className="py-2 px-6 bg-slate-900 text-white rounded-lg font-bold text-xs hover:bg-slate-800 transition-colors">
            AUTHORIZE ACCOUNT
          </button>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto overflow-hidden">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Email</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Title</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Coupon Supply</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Permissions (Pages)</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Added By</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {admins.map((admin) => {
              const perms = (admin.permissions as any) || {};
              const pages = perms?.pages ? perms.pages.join(', ') : (perms?.all ? 'All Access' : 'Custom');
              const couponStatus = admin.email === 'allowancemobileapp@gmail.com' ? 'Unlimited' : (perms.canCreateUnlimited ? 'Unlimited' : `Max ${perms.maxSupply || 1}`);
              
              return (
                <tr key={admin.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 text-slate-800 font-medium">{admin.email}</td>
                  <td className="px-6 py-4 text-slate-600">{admin.title || 'Admin'}</td>
                  <td className="px-6 py-4 text-slate-600 font-medium text-xs">{couponStatus}</td>
                  <td className="px-6 py-4 text-slate-500 truncate max-w-xs" title={pages}>
                    {pages}
                  </td>
                  <td className="px-6 py-4 text-slate-500">{admin.added_by}</td>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => handleDelete(admin.id)}
                      className="text-xs font-bold text-red-600 hover:text-red-800 transition-colors"
                      disabled={admin.email === 'allowancemobileapp@gmail.com'}
                    >
                      {admin.email === 'allowancemobileapp@gmail.com' ? 'Superadmin' : 'Revoke'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {admins.length === 0 && <div className="p-6 text-center text-slate-400 font-medium">No admins found.</div>}
      </div>
    </div>
  );
}
