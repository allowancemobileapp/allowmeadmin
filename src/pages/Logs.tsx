import React, { useState, useEffect, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { AppLog, AdminLog } from '../types';

export default function Logs() {
  const [appLogs, setAppLogs] = useState<AppLog[]>([]);
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
  const [tab, setTab] = useState<'app' | 'admin'>('app');
  const [expandedDetails, setExpandedDetails] = useState<Record<number, boolean>>({});
  const { get } = useApi();

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fetchLogs = async () => {
    try {
      const appData = await get<AppLog[]>('/api/logs/app');
      const adminData = await get<AdminLog[]>('/api/logs/admin');
      setAppLogs(appData);
      setAdminLogs(adminData);
    } catch (e) {
      console.error(e);
      alert('Failed to load logs');
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const clearFilters = () => {
    setActionFilter('');
    setFromDate('');
    setToDate('');
    fetchLogs();
  };

  const toggleDetails = (id: number) => {
    setExpandedDetails(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // The active dataset based on tab
  const baseLogs = tab === 'app' ? appLogs : adminLogs;

  // Derive available action types for the dropdown based on current tab's logs
  const availableActions = useMemo(() => {
    const actions = new Set<string>();
    baseLogs.forEach(log => {
      const type = (log as any).action_summary || (log as any).action;
      if (type) actions.add(type);
    });
    return Array.from(actions).sort();
  }, [baseLogs]);

  const filteredLogs = useMemo(() => {
    return baseLogs.filter(log => {
      let match = true;
      const logDate = new Date(log.created_at);
      const actionType = (log as any).action_summary || (log as any).action;

      if (actionFilter && actionType !== actionFilter) {
        match = false;
      }
      if (fromDate) {
        const from = new Date(fromDate);
        from.setHours(0, 0, 0, 0);
        if (logDate < from) match = false;
      }
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        if (logDate > to) match = false;
      }
      return match;
    });
  }, [baseLogs, actionFilter, fromDate, toDate]);

  const downloadFile = (format: 'csv' | 'json' | 'txt') => {
    if (!filteredLogs.length) return alert('No logs to download');

    let content = '';
    let filename = '';
    let mime = '';

    if (format === 'csv') {
      content = 'Time,User,Action,Details\n' +
        filteredLogs.map(l => {
          const user = (l as any).user_email || (l as any).admin_email || 'anonymous';
          const action = (l as any).action_summary || (l as any).action || 'Unknown Action';
          const detailsString = JSON.stringify(l.details).replace(/"/g, '""');
          return `"${new Date(l.created_at).toLocaleString()}","${user}","${action}","${detailsString}"`;
        }).join('\n');
      mime = 'text/csv';
      filename = `activity_logs.${format}`;
    } else if (format === 'json') {
      content = JSON.stringify(filteredLogs, null, 2);
      mime = 'application/json';
      filename = `activity_logs.${format}`;
    } else {
      content = filteredLogs.map(l => {
        const user = (l as any).user_email || (l as any).admin_email || 'anonymous';
        const action = (l as any).action_summary || (l as any).action || 'Unknown Action';
        return `${new Date(l.created_at).toLocaleString()} | ${user} | ${action} | ${JSON.stringify(l.details)}`;
      }).join('\n');
      mime = 'text/plain';
      filename = `activity_logs.${format}`;
    }

    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6 h-full flex flex-col pt-2">
      <div className="flex justify-between items-center px-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">📋 Activity Logs</h1>
          <p className="text-slate-500 mt-1">Review system activity, actions, and user events.</p>
        </div>
      </div>

      <div className="flex gap-4 px-2">
        <button
          onClick={() => { setTab('app'); clearFilters(); }}
          className={`pb-2 px-1 text-sm font-bold transition-colors ${tab === 'app' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}
        >
          App Logs (Users)
        </button>
        <button
          onClick={() => { setTab('admin'); clearFilters(); }}
          className={`pb-2 px-1 text-sm font-bold transition-colors ${tab === 'admin' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Admin Logs
        </button>
      </div>

      <div className="bg-[#141414] text-[#f1f1f1] border border-slate-700/50 rounded-xl shadow-lg p-6 flex flex-col flex-1 overflow-hidden" style={{ minHeight: '600px' }}>
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6 items-center">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="border-none rounded-lg px-4 py-3 text-sm bg-[#333] text-white focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="">All Actions</option>
            {availableActions.map(action => (
              <option key={action} value={action}>{action}</option>
            ))}
          </select>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="border-none rounded-lg px-4 py-3 text-sm bg-[#333] text-white focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="From Date"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="border-none rounded-lg px-4 py-3 text-sm bg-[#333] text-white focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="To Date"
          />
          <button
            onClick={fetchLogs}
            className="bg-[#007bff] text-white font-bold px-5 py-3 rounded-lg hover:bg-[#0056b3] transition-colors text-sm ml-2"
          >
            🔄 Refresh Logs
          </button>
          <button
            onClick={clearFilters}
            className="bg-[#555] text-white font-bold px-5 py-3 rounded-lg hover:bg-[#444] transition-colors text-sm"
          >
            Clear Filters
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto rounded-lg" style={{ backgroundColor: '#222' }}>
          <table className="w-full text-left border-collapse text-sm">
            <thead className="sticky top-0 z-10" style={{ backgroundColor: '#2a2a2a' }}>
              <tr>
                <th className="font-semibold p-4 border-b border-[#444] text-[#ccc]">Time</th>
                <th className="font-semibold p-4 border-b border-[#444] text-[#ccc]">User ID</th>
                <th className="font-semibold p-4 border-b border-[#444] text-[#ccc]">Action</th>
                <th className="font-semibold p-4 border-b border-[#444] text-[#ccc]">Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length > 0 ? (
                filteredLogs.map(log => (
                  <tr key={log.id} className="border-b border-[#444] hover:bg-[#333] transition-colors">
                    <td className="p-4 whitespace-nowrap text-[#bbb]">
                      {new Date(log.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                    </td>
                    <td className="p-4 font-bold text-white">
                      {(log as any).user_email || (log as any).admin_email || 'anonymous'}
                    </td>
                    <td className="p-4">
                      <span className="text-[#0dcaf0] font-medium block mb-1">
                        {(() => {
                           const isAppLog = 'action_summary' in log;
                           if (!isAppLog) return log.action || 'Unknown Action';
                           
                           const rawAction = log.action_summary || log.action || 'Unknown Action';
                           
                           // Extract the row data from the details payload depending on how it's structured
                           const extra = log.details?.log_details?.extra || log.details?.extra || log.details;
                           if (!extra || Object.keys(extra).length === 0) return rawAction;

                           switch(rawAction) {
                            case 'profiles_UPDATE': {
                              const old = log.details?.log_details?.old || log.details?.old;
                              if (old && typeof old === 'object' && extra && typeof extra === 'object') {
                                const changes: string[] = [];
                                if (old.username !== extra.username) changes.push(`Username (${old.username || 'none'} -> ${extra.username || 'none'})`);
                                if (old.avatar_url !== extra.avatar_url) changes.push(extra.avatar_url ? 'Added Photo' : 'Removed Photo');
                                if (old.bio !== extra.bio) changes.push('Updated Bio');
                                if (old.school_name !== extra.school_name) changes.push(`School (${old.school_name || 'none'} -> ${extra.school_name || 'none'})`);
                                if (old.full_name !== extra.full_name) changes.push(`Name (${old.full_name || 'none'} -> ${extra.full_name || 'none'})`);
                                if (old.phone_number !== extra.phone_number) changes.push('Updated Phone');
                                
                                if (changes.length > 0) {
                                  return `Updated Profile: Changed ${changes.join(', ')}`;
                                }
                                return `Updated Profile (No visible changes)`;
                              }
                              return `Updated Profile (Username: ${extra.username || 'None'}, Bio: ${extra.bio ? 'Set' : 'Empty'}, Photo: ${extra.avatar_url ? 'Yes' : 'No'}, School: ${extra.school_name || 'N/A'})`;
                            }
                            case 'gists_INSERT':
                              return `Created Gist/Post ("${extra.title ? extra.title.substring(0, 30) : '?'}${extra.title && extra.title.length > 30 ? '...' : ''}")`;
                            case 'gists_UPDATE': {
                              const old = log.details?.log_details?.old || log.details?.old;
                              if (old && typeof old === 'object' && extra && typeof extra === 'object') {
                                const changes: string[] = [];
                                if (old.title !== extra.title) changes.push('Title');
                                if (old.status !== extra.status) changes.push(`Status (${old.status} -> ${extra.status})`);
                                if (old.price_per_day !== extra.price_per_day) changes.push(`Price`);
                                if (old.image_url !== extra.image_url) changes.push(`Image`);
                                if (changes.length > 0) return `Updated Gist/Post ("${extra.title?.substring(0, 20)}"): Changed ${changes.join(', ')}`;
                              }
                              return `Updated Gist/Post ("${extra.title ? extra.title.substring(0, 30) : '?'}${extra.title && extra.title.length > 30 ? '...' : ''}")`;
                            }
                            case 'tickets_INSERT':
                              return `Created Ticket Event ("${extra.name ? extra.name.substring(0, 30) : '?'}") - Price: ₦${extra.price || 0}`;
                            case 'tickets_UPDATE': {
                              const old = log.details?.log_details?.old || log.details?.old;
                              if (old && typeof old === 'object' && extra && typeof extra === 'object') {
                                const changes: string[] = [];
                                if (old.name !== extra.name) changes.push('Name');
                                if (old.price !== extra.price) changes.push(`Price (₦${old.price} -> ₦${extra.price})`);
                                if (old.status !== extra.status) changes.push(`Status (${old.status} -> ${extra.status})`);
                                if (old.tickets_remaining !== extra.tickets_remaining) changes.push(`Capacity (${old.tickets_remaining} -> ${extra.tickets_remaining})`);
                                if (changes.length > 0) return `Updated Ticket Event ("${extra.name?.substring(0, 20)}"): Changed ${changes.join(', ')}`;
                              }
                              return `Updated Ticket Event ("${extra.name ? extra.name.substring(0, 30) : '?'}")`;
                            }
                            case 'ticket_purchases_INSERT':
                              return `Purchased Ticket (Event ID: ${extra.ticket_id || '?'})`;
                            case 'story_likes_INSERT':
                              return `Liked Story (Story ID: ${extra.story_id || '?'})`;
                            case 'gist_likes_INSERT':
                              return `Liked Gist (Gist ID: ${extra.gist_id || '?'})`;
                            case 'gist_comments_INSERT':
                              return `Commented on Gist: "${typeof extra.text === 'string' ? extra.text.substring(0, 30) + (extra.text.length > 30 ? '...' : '') : '?'}"`;
                            case 'messages_INSERT':
                              return `Sent Message in Chat (Chat ID: ${extra.chat_id || '?'})`;
                           }
                           
                           if (rawAction.endsWith('_INSERT')) return `Added to ${rawAction.replace('_INSERT', '')} (ID: ${extra.id || '?'})`;
                           if (rawAction.endsWith('_UPDATE')) return `Updated ${rawAction.replace('_UPDATE', '')} (ID: ${extra.id || '?'})`;
                           if (rawAction.endsWith('_DELETE')) return `Deleted from ${rawAction.replace('_DELETE', '')} (ID: ${extra.id || '?'})`;

                           return rawAction;
                        })()}
                      </span>
                      {('action_summary' in log) && (
                        <div className="text-[10px] text-slate-500 font-mono mt-1">Raw: {(log as any).action_summary}</div>
                      )}
                    </td>
                    <td className="p-4 text-[#bbb] font-mono text-xs max-w-md">
                      <div className="flex flex-col items-start gap-2">
                        <button 
                          onClick={() => toggleDetails(log.id)}
                          className="bg-[#333] hover:bg-[#444] text-[#ddd] px-3 py-1.5 rounded transition-colors"
                        >
                          {expandedDetails[log.id] ? 'Hide Details' : 'See Details'}
                        </button>
                        {expandedDetails[log.id] && (
                          <div className="mt-2 w-full max-h-40 overflow-y-auto break-all whitespace-pre-wrap bg-[#1a1a1a] p-3 rounded text-[#0dcaf0] border border-[#333]">
                            {JSON.stringify(log.details, null, 2)}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-[#bbb] italic">
                    No logs found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Exports */}
        <div className="flex gap-3 mt-6 flex-wrap">
          <button onClick={() => downloadFile('csv')} className="bg-[#28a745] hover:bg-[#218838] text-white font-bold px-5 py-3 rounded-lg transition-transform hover:-translate-y-0.5 text-sm">
            📥 Download CSV
          </button>
          <button onClick={() => downloadFile('json')} className="bg-[#17a2b8] hover:bg-[#138496] text-white font-bold px-5 py-3 rounded-lg transition-transform hover:-translate-y-0.5 text-sm">
            📥 Download JSON
          </button>
          <button onClick={() => downloadFile('txt')} className="bg-[#6c757d] hover:bg-[#5a6268] text-white font-bold px-5 py-3 rounded-lg transition-transform hover:-translate-y-0.5 text-sm">
            📥 Download TXT
          </button>
        </div>
      </div>
    </div>
  );
}

