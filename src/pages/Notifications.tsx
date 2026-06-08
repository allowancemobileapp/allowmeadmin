import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';

export default function Notifications() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [notifications, setNotifications] = useState<any[]>([]);
  const { get, post } = useApi();

  const fetchNotifications = async () => {
    try {
      const data = await get<any[]>('/api/notifications');
      setNotifications(data || []);
    } catch (e: any) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.confirm("Broadcast this notification to ALL users?")) return;
    setSending(true);
    setSuccess('');
    setError('');
    
    try {
      await post('/api/notifications', { title, message });
      setSuccess('General push notification broadcasted successfully.');
      setTitle('');
      setMessage('');
      fetchNotifications();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Broadcast Notifications</h1>
        <p className="text-sm text-slate-500 mt-1">Send official announcements to all registered users.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl shadow-sm">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Compose Message</h2>
        
        {success && <div className="p-4 mb-6 text-sm bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg font-medium">{success}</div>}
        {error && <div className="p-4 mb-6 text-sm bg-red-50 border border-red-200 text-red-600 rounded-lg font-medium">{error}</div>}
        
        <form onSubmit={handleSend} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-slate-600 text-sm">Notification Title</label>
            <input 
              type="text" 
              required 
              value={title} 
              onChange={e=>setTitle(e.target.value)}
              placeholder="e.g., Allowance App Update v2.0"
              className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500" 
            />
          </div>
          
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-slate-600 text-sm">Message Body</label>
            <textarea 
              required 
              rows={5}
              value={message} 
              onChange={e=>setMessage(e.target.value)}
              placeholder="Type your official announcement here..."
              className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y" 
            />
          </div>
          
          <button 
            type="submit" 
            disabled={sending}
            className="w-full py-3 mt-4 bg-slate-900 text-white rounded-lg font-bold text-xs hover:bg-slate-800 transition-colors disabled:opacity-50 tracking-wider"
          >
            {sending ? 'BROADCASTING...' : 'BROADCAST TO ALL USERS'}
          </button>
          <p className="text-xs text-slate-500 mt-2 text-center">
            Note: This broadcasts to the database and logs locally. To reach mobile devices with a notification balloon, you must configure Firebase Cloud Messaging (FCM) credentials in the backend.
          </p>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Past Broadcasts</h2>
        <div className="space-y-4">
          {notifications.map(n => (
            <div key={n.id} className="p-4 border border-slate-100 bg-slate-50 rounded-lg">
              <div className="flex justify-between items-start">
                <h3 className="font-bold text-slate-800 text-sm">{n.title}</h3>
                <span className="text-[10px] text-slate-400 font-mono">{new Date(n.created_at).toLocaleString()}</span>
              </div>
              <p className="text-sm text-slate-600 mt-2">{n.message}</p>
              <div className="text-[10px] text-slate-400 mt-2">Sent by: {n.sent_by}</div>
            </div>
          ))}
          {notifications.length === 0 && (
            <div className="text-sm text-slate-400 font-medium">No past broadcasts found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
