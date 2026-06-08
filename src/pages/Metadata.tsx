import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';

export default function Metadata() {
  const { get } = useApi();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const fetchStats = async () => {
    try {
      const data = await get<any>('/api/metadata/stats');
      setStats(data);
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) return <div className="p-8 text-slate-500">Loading system metadata...</div>;

  if (!stats) return <div className="p-8 text-red-500">Failed to load metadata stats.</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">System Metadata</h1>
        <p className="text-sm text-slate-500 mt-1">Real-time application analytics and statistics.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Total Users</h3>
          <div className="text-3xl font-bold text-slate-800">{stats.total_users || 0}</div>
        </div>

        {/* New Users Today */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">New Users (Today)</h3>
          <div className="text-3xl font-bold text-emerald-600">+{stats.new_users_today || 0}</div>
        </div>

        {/* Total Subscribers */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Total Subscribers</h3>
          <div className="text-3xl font-bold text-indigo-600">{stats.total_subscribers || 0}</div>
        </div>

        {/* New Subscribers Today */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">New Subscribers (Today)</h3>
          <div className="text-3xl font-bold text-emerald-600">+{stats.new_subscribers_today || 0}</div>
        </div>
        
        {/* Active Tickets */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Active Tickets</h3>
          <div className="text-3xl font-bold text-slate-800">{stats.active_tickets || 0}</div>
        </div>

        {/* Total Schools */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Total Schools</h3>
          <div className="text-3xl font-bold text-slate-800">{stats.total_schools || 0}</div>
        </div>

        {/* Active Gists */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Active Gists</h3>
          <div className="text-3xl font-bold text-emerald-600">{stats.active_gists || 0}</div>
        </div>

        {/* Total Revenue */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Total Money Made</h3>
          <div className="text-2xl font-bold text-amber-600 truncate" title={`₦${stats.total_revenue || 0}`}>
            ₦{Number(stats.total_revenue || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
          </div>
        </div>

        {/* Revenue Today */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col justify-between border-l-4 border-l-emerald-500">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Money Made Today</h3>
          <div className="text-2xl font-bold text-emerald-600 truncate" title={`₦${stats.revenue_today || 0}`}>
            ₦{Number(stats.revenue_today || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
          </div>
        </div>
      </div>
    </div>
  );
}
