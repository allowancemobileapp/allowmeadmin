import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Ticket } from '../types';

export default function Tickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const { get, put } = useApi();

  const fetchTickets = async () => {
    try {
      const data = await get<Ticket[]>('/api/tickets');
      setTickets(data);
    } catch (e: any) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleStatusChange = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === 'draft' ? 'active' : 'draft';
    try {
      await put(`/api/tickets/${id}/status`, { status: newStatus });
      fetchTickets();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Ticket Management</h1>
        <p className="text-sm text-slate-500 mt-1">Manage active tickets and drafts.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Title</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Price</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Status</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Date</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tickets.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50/50">
                <td className="px-6 py-4 text-slate-800 font-medium">{t.title}</td>
                <td className="px-6 py-4 text-slate-600 font-mono">₦{parseFloat(t.price as any).toFixed(2)}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-[10px] font-bold ${t.status === 'active' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-300'}`}>
                    {t.status.toUpperCase()}
                  </span>
                </td>
                <td className="px-6 py-4 text-slate-500 text-xs font-mono">{new Date(t.created_at).toLocaleDateString()}</td>
                <td className="px-6 py-4">
                  <button 
                    onClick={() => handleStatusChange(t.id, t.status)}
                    className="text-xs font-bold bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    Set to {t.status === 'draft' ? 'Active' : 'Draft'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tickets.length === 0 && <div className="p-6 text-center text-slate-400 font-medium text-sm">No tickets found.</div>}
      </div>
    </div>
  );
}
