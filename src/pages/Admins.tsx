import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Admin } from '../types';

export default function Admins() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [canCreateUnlimited, setCanCreateUnlimited] = useState(false);
  const [maxSupply, setMaxSupply] = useState(500);
  const [error, setError] = useState('');
  const { get, post } = useApi();

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
    try {
      const permissions = {
        canCreateUnlimited,
        maxSupply: canCreateUnlimited ? null : maxSupply
      };
      await post('/api/admins', { email, title, permissions });
      setEmail('');
      setTitle('');
      setCanCreateUnlimited(false);
      setMaxSupply(500);
      fetchAdmins();
    } catch (e: any) {
      setError(e.message);
    }
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
        <form onSubmit={handleCreate} className="space-y-4 max-w-lg">
          <div className="flex gap-4">
            <div className="flex flex-col gap-1 flex-1">
              <label className="font-semibold text-slate-600 text-sm">Email Address</label>
              <input 
                type="email" 
                required 
                value={email} 
                onChange={e=>setEmail(e.target.value)}
                className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500" 
              />
            </div>
            <div className="flex flex-col gap-1 w-1/3">
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
          <div>
            <label className="flex items-center gap-2 text-sm text-slate-700 font-medium">
              <input type="checkbox" checked={canCreateUnlimited} onChange={e=>setCanCreateUnlimited(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              Can create unlimited coupons
            </label>
          </div>
          {!canCreateUnlimited && (
            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-600 text-sm">Max Coupon Supply Limit</label>
              <input 
                type="number" 
                value={maxSupply} 
                onChange={e=>setMaxSupply(Number(e.target.value))}
                className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500" 
              />
            </div>
          )}
          <button type="submit" className="py-2 px-4 bg-slate-900 text-white rounded-lg font-bold text-xs hover:bg-slate-800 transition-colors">
            AUTHORIZE ACCOUNT
          </button>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Email</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Title</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Permissions</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Added By</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {admins.map((admin) => (
              <tr key={admin.id} className="hover:bg-slate-50/50">
                <td className="px-6 py-4 text-slate-800 font-medium">{admin.email}</td>
                <td className="px-6 py-4 text-slate-600">{admin.title || 'Admin'}</td>
                <td className="px-6 py-4 text-slate-500">
                  <pre className="text-xs bg-slate-100 p-1 rounded inline-block">{JSON.stringify(admin.permissions)}</pre>
                </td>
                <td className="px-6 py-4 text-slate-500">{admin.added_by}</td>
                <td className="px-6 py-4 text-slate-500">{new Date(admin.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {admins.length === 0 && <div className="p-6 text-center text-slate-400 font-medium">No admins found.</div>}
      </div>
    </div>
  );
}
