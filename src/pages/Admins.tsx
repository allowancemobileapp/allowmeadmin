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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const [allowedPages, setAllowedPages] = useState<Record<string, boolean>>(() => {
    return PAGE_MODULES.reduce((acc, p) => ({...acc, [p.id]: true}), {});
  });
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Account Permissions</h1>
        <p className="text-sm text-slate-500 mt-1">Authorize new team members to access the workspace.</p>
      </div>

      <div className={`bg-white border rounded-xl shadow-sm p-6 ${editingId ? 'border-2 border-indigo-500 ring-4 ring-indigo-50' : 'border-slate-200'}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{editingId ? 'Edit Access' : 'Grant Access'}</h2>
          {editingId && <button onClick={resetForm} className="text-xs font-bold text-slate-500 hover:text-slate-800">CANCEL</button>}
        </div>
        {error && <div className="p-3 mb-4 text-sm bg-red-50 border border-red-200 text-red-600 rounded-md">{error}</div>}
        <form onSubmit={handleSave} className="space-y-6 max-w-3xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-600 text-sm">Email Address</label>
              <input 
                type="email" 
                required 
                value={email} 
                onChange={e=>setEmail(e.target.value)}
                disabled={!!editingId}
                className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-slate-50" 
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
              <label className="flex items-center gap-2 text-sm text-slate-700 font-medium cursor-pointer">
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
                    className="border border-slate-200 rounded px-2 py-1 w-24 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
            {editingId ? 'UPDATE ACCOUNT ACCESS' : 'AUTHORIZE ACCOUNT'}
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
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-slate-800 mb-2">Confirm Revocation</h3>
            <p className="text-slate-600 mb-6">Are you sure you want to completely remove this user's access? This action is permanent and immediate.</p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setRevokingId(null)} 
                className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-lg transition-colors"
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
