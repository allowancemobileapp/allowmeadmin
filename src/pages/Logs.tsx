import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { AppLog, AdminLog } from '../types';

export default function Logs() {
  const [appLogs, setAppLogs] = useState<AppLog[]>([]);
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
  const [tab, setTab] = useState<'app'|'admin'>('app');
  const [expandedLogId, setExpandedLogId] = useState<number|null>(null);
  const { get } = useApi();

  useEffect(() => {
    get<AppLog[]>('/api/logs/app').then(setAppLogs).catch(console.error);
    get<AdminLog[]>('/api/logs/admin').then(setAdminLogs).catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Unified Logs</h1>
        <p className="text-sm text-slate-500 mt-1">Review activity trails and system-level events.</p>
      </div>

      <div className="flex gap-4 border-b border-slate-200">
        <button 
          onClick={()=>setTab('app')}
          className={`pb-2 px-1 text-sm font-bold transition-colors ${tab === 'app' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}
        >
          User Events (App Logs)
        </button>
        <button 
          onClick={()=>setTab('admin')}
          className={`pb-2 px-1 text-sm font-bold transition-colors ${tab === 'admin' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Administrator Activity
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden p-4">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">
          {tab === 'app' ? 'App Logs' : 'Admin Logs'} 
          <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${tab === 'app' ? 'bg-indigo-100 text-indigo-600' : 'bg-red-50 text-red-600'}`}>
            {tab === 'app' ? 'LIVE' : 'AUDIT'}
          </span>
        </h3>
        
        {tab === 'app' ? (
          <div className="space-y-2">
            {appLogs.map(log => (
              <div key={log.id} className="p-3 border-l-2 border-slate-300 bg-slate-50/50 rounded-r border-t border-b border-r">
                <p className="text-[12px] text-slate-800 leading-tight">
                  <span className="font-semibold">{log.user_email}</span> {log.action_summary}
                </p>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-[10px] text-slate-500 font-mono">{new Date(log.created_at).toLocaleString()}</span>
                  <button onClick={()=>setExpandedLogId(expandedLogId === log.id ? null : log.id)} className="text-[10px] font-bold text-indigo-600 hover:underline">
                    {expandedLogId === log.id ? 'Hide Details' : 'See Details'}
                  </button>
                </div>
                {expandedLogId === log.id && (
                  <div className="mt-3 bg-white border border-slate-200 rounded p-3 overflow-x-auto">
                    <pre className="text-[11px] text-slate-600 font-mono">{JSON.stringify(log.details, null, 2)}</pre>
                  </div>
                )}
              </div>
            ))}
            {appLogs.length === 0 && <div className="p-4 text-center text-slate-400 text-sm font-medium">No application logs.</div>}
          </div>
        ) : (
          <div className="space-y-2">
            {adminLogs.map(log => (
              <div key={log.id} className="p-3 border-l-2 border-red-500 bg-red-50/30 rounded-r border-t border-b border-r">
                <p className="text-[12px] text-slate-800 leading-tight">
                  <span className="font-semibold">{log.admin_email}</span> executed <span className="font-medium text-slate-600">{log.action}</span>
                </p>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-[10px] text-slate-500 font-mono">{new Date(log.created_at).toLocaleString()}</span>
                  <button onClick={()=>setExpandedLogId(expandedLogId === log.id ? null : log.id)} className="text-[10px] font-bold text-red-600 hover:underline">
                    {expandedLogId === log.id ? 'Hide Details' : 'See Details'}
                  </button>
                </div>
                {expandedLogId === log.id && (
                  <div className="mt-3 bg-white border border-red-100 rounded p-3 overflow-x-auto">
                    <pre className="text-[11px] text-slate-600 font-mono">{JSON.stringify(log.details, null, 2)}</pre>
                  </div>
                )}
              </div>
            ))}
            {adminLogs.length === 0 && <div className="p-4 text-center text-slate-400 text-sm font-medium">No admin logs.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
