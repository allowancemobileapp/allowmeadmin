import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { get } = useApi();
  const [stats, setStats] = useState({
    activeAdmins: 0,
    monthlyReferrals: 0,
    todayTransactions: 0,
    storesTotal: 0,
    storesActive: 0,
    servicesTotal: 0,
    servicesActive: 0,
    pendingStores: 0,
    pendingServices: 0
  });

  useEffect(() => {
    get<any>('/api/dashboard/stats')
      .then(data => setStats(data))
      .catch(err => console.error("Error loading stats:", err));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-200">Workspace Overview</h1>
        <p className="text-sm text-slate-500 mt-1">Snapshot of Allowance backend activity.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Transactions (Today)</p>
          <p className="text-3xl font-mono text-indigo-600 font-bold">₦{stats.todayTransactions.toLocaleString()}</p>
        </div>
        
        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Active Admins</p>
          <p className="text-3xl font-mono text-slate-800 dark:text-slate-200 font-bold">{stats.activeAdmins}</p>
        </div>

        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Referrals (This Month)</p>
          <p className="text-3xl font-mono text-emerald-600 font-bold">{stats.monthlyReferrals}</p>
        </div>

        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm relative overflow-hidden group">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Registered Stores</p>
          <div className="flex items-end gap-3">
            <p className="text-3xl font-mono text-slate-800 dark:text-slate-200 font-bold">{stats.storesActive} <span className="text-lg text-slate-400 font-medium">/ {stats.storesTotal}</span></p>
          </div>
          {stats.pendingStores > 0 && (
            <Link to="/approvals" className="absolute top-4 right-4 bg-orange-100 text-orange-700 text-xs font-bold px-2 py-1 rounded-md animate-pulse">
              {stats.pendingStores} Pending
            </Link>
          )}
        </div>

        <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm relative overflow-hidden group">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Registered Services</p>
          <div className="flex items-end gap-3">
            <p className="text-3xl font-mono text-slate-800 dark:text-slate-200 font-bold">{stats.servicesActive} <span className="text-lg text-slate-400 font-medium">/ {stats.servicesTotal}</span></p>
          </div>
          {stats.pendingServices > 0 && (
            <Link to="/approvals" className="absolute top-4 right-4 bg-orange-100 text-orange-700 text-xs font-bold px-2 py-1 rounded-md animate-pulse">
              {stats.pendingServices} Pending
            </Link>
          )}
        </div>
        
      </div>
    </div>
  );
}
