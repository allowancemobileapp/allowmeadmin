import React from 'react';
import { useApi } from '../hooks/useApi';

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Workspace Overview</h1>
        <p className="text-sm text-slate-500 mt-1">Snapshot of Allowance backend activity.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Active Admins</p>
          <p className="text-3xl font-mono text-slate-800 font-bold">4</p>
        </div>
        <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Total Referrals (This Month)</p>
          <p className="text-3xl font-mono text-emerald-600 font-bold">128</p>
        </div>
        <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Transactions (Today)</p>
          <p className="text-3xl font-mono text-indigo-600 font-bold">₦24,500</p>
        </div>
      </div>
    </div>
  );
}
