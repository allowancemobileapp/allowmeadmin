import React, { useState, useEffect, useRef } from 'react';
import { useApi } from '../hooks/useApi';
import { AppLog, AdminLog } from '../types';

export default function Logs() {
  const [appLogs, setAppLogs] = useState<AppLog[]>([]);
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
  const [tab, setTab] = useState<'app'|'admin'>('app');
  const [expandedLogId, setExpandedLogId] = useState<number|null>(null);
  const [isLive, setIsLive] = useState(true);
  const { get } = useApi();
  const listRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    try {
      const appData = await get<AppLog[]>('/api/logs/app');
      const adminData = await get<AdminLog[]>('/api/logs/admin');
      
      setAppLogs(prev => {
        // Only update if there's new data to prevent UI jumps if polling
        if (JSON.stringify(prev) !== JSON.stringify(appData)) return appData;
        return prev;
      });
      setAdminLogs(prev => {
        if (JSON.stringify(prev) !== JSON.stringify(adminData)) return adminData;
        return prev;
      });
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchLogs();
    
    let interval: any;
    if (isLive) {
      interval = setInterval(() => {
        fetchLogs();
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isLive]);

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex justify-between items-center bg-white p-6 border border-slate-200 rounded-xl shadow-sm">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Unified Logs</h1>
          <p className="text-sm text-slate-500 mt-1">Real-time system telemetry and activity trails.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-xs font-bold text-slate-700">
            <span className="relative flex h-2.5 w-2.5">
               {isLive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
               <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isLive ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
            </span>
            Live Polling
            <input type="checkbox" className="hidden" checked={isLive} onChange={e => setIsLive(e.target.checked)} />
          </label>
          <button onClick={fetchLogs} className="px-4 py-2 bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 hover:bg-indigo-100 rounded-lg text-xs transition-colors">
            Force Refresh
          </button>
        </div>
      </div>

      <div className="flex gap-4 px-2">
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

      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-sm overflow-hidden flex flex-col flex-1 min-h-[500px]">
        <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex justify-between items-center text-[10px] uppercase font-bold tracking-wider text-slate-500">
          <span>{tab === 'app' ? 'Live Application Telemetry' : 'System Audit Trail'}</span>
          <span>{tab === 'app' ? appLogs.length : adminLogs.length} events logged</span>
        </div>
        
        <div className="p-4 overflow-y-auto font-mono text-xs flex-1 space-y-1" ref={listRef}>
        {tab === 'app' ? (
          <>
            {appLogs.map(log => (
              <div key={log.id} className="text-slate-400 border-b border-slate-800/50 pb-2 mb-2 group">
                <div className="flex items-start gap-4 hover:bg-slate-800/30 p-1 rounded transition-colors w-full cursor-pointer" onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}>
                   <span className="text-emerald-500/80 shrink-0 select-none">[{new Date(log.created_at).toISOString().split('T')[1].slice(0,8)}]</span>
                   <span className="text-indigo-300 font-bold max-w-[150px] truncate shrink-0">{log.user_email || 'anonymous'}</span>
                   <span className="text-slate-300 flex-1 truncate">{log.action_summary}</span>
                   <span className="text-slate-600 text-[10px] shrink-0 opacity-0 group-hover:opacity-100">{expandedLogId === log.id ? '[-]' : '[+]'}</span>
                </div>
                {expandedLogId === log.id && (
                  <div className="mt-2 ml-[195px] p-3 mx-2 bg-slate-950 border border-slate-800 rounded text-amber-500/90 whitespace-pre-wrap break-all shadow-inner">
                    {JSON.stringify(log.details, null, 2)}
                  </div>
                )}
              </div>
            ))}
            {appLogs.length === 0 && <div className="text-slate-600 italic">No application events recorded.</div>}
          </>
        ) : (
          <>
            {adminLogs.map(log => (
              <div key={log.id} className="text-slate-400 border-b border-slate-800/50 pb-2 mb-2 group">
                <div className="flex items-start gap-4 hover:bg-slate-800/30 p-1 rounded transition-colors w-full cursor-pointer" onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}>
                   <span className="text-rose-500/80 shrink-0 select-none">[{new Date(log.created_at).toISOString().split('T')[1].slice(0,8)}]</span>
                   <span className="text-rose-300 font-bold max-w-[150px] truncate shrink-0">{log.admin_email}</span>
                   <span className="text-slate-300 flex-1 font-bold tracking-tight">EXEC: {log.action}</span>
                   <span className="text-slate-600 text-[10px] shrink-0 opacity-0 group-hover:opacity-100">{expandedLogId === log.id ? '[-]' : '[+]'}</span>
                </div>
                {expandedLogId === log.id && (
                  <div className="mt-2 ml-[195px] p-3 mx-2 bg-slate-950 border border-slate-800 rounded text-amber-500/90 whitespace-pre-wrap break-all shadow-inner">
                    {JSON.stringify(log.details, null, 2)}
                  </div>
                )}
              </div>
            ))}
            {adminLogs.length === 0 && <div className="text-slate-600 italic">No admin events recorded.</div>}
          </>
        )}
        </div>
      </div>
    </div>
  );
}
