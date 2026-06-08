import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Ticket } from '../types';

export default function Tickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const { get, put, del } = useApi();

  const fetchTickets = async () => {
    try {
      const data = await get<Ticket[]>('/api/tickets');
      setTickets(data || []);
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

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTicket) return;
    try {
      await put(`/api/tickets/${editingTicket.id}`, editingTicket);
      alert('Ticket details updated');
      setEditingTicket(null);
      fetchTickets();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Ticket Management</h1>
        <p className="text-sm text-slate-500 mt-1">Manage active tickets and drafts.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto overflow-hidden">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Title</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Price</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Status</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Created At</th>
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
                <td className="px-6 py-4 flex gap-2">
                  <button 
                    onClick={() => handleStatusChange(t.id, t.status)}
                    className="text-xs font-bold bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                  >
                    Set {t.status === 'draft' ? 'Active' : 'Draft'}
                  </button>
                  <button 
                    onClick={() => setEditingTicket(t)}
                    className="text-xs font-bold bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    See Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tickets.length === 0 && <div className="p-6 text-center text-slate-400 font-medium text-sm">No tickets found.</div>}
      </div>

      {editingTicket && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Ticket Details</h2>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Title</label>
                <input 
                  type="text" 
                  className="w-full border border-slate-200 rounded px-3 py-2 bg-white text-slate-900 focus:outline-none focus:border-indigo-500" 
                  value={editingTicket.title} 
                  onChange={e => setEditingTicket({...editingTicket, title: e.target.value})} 
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Description</label>
                <textarea 
                  className="w-full border border-slate-200 rounded px-3 py-2 bg-white text-slate-900 focus:outline-none focus:border-indigo-500" 
                  value={editingTicket.description} 
                  onChange={e => setEditingTicket({...editingTicket, description: e.target.value})} 
                  rows={3} 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Price</label>
                  <input 
                    type="number" 
                    className="w-full border border-slate-200 rounded px-3 py-2 bg-white text-slate-900 focus:outline-none focus:border-indigo-500" 
                    value={editingTicket.price} 
                    onChange={e => setEditingTicket({...editingTicket, price: parseInt(e.target.value) || 0})} 
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Status</label>
                  <select 
                    className="w-full border border-slate-200 rounded px-3 py-2 bg-white text-slate-900 focus:outline-none focus:border-indigo-500" 
                    value={editingTicket.status} 
                    onChange={e => setEditingTicket({...editingTicket, status: e.target.value})}
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Created At</label>
                  <input type="text" readOnly className="w-full border border-slate-200 rounded px-3 py-2 bg-slate-50 text-slate-900" value={new Date(editingTicket.created_at).toLocaleString()} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Expiry Date</label>
                  <input type="text" readOnly className="w-full border border-slate-200 rounded px-3 py-2 bg-slate-50 text-slate-900" value={(editingTicket as any).end_date ? new Date((editingTicket as any).end_date).toLocaleString() : 'No expiry'} />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setEditingTicket(null)} className="px-4 py-2 font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 font-bold text-sm text-white bg-slate-900 hover:bg-slate-800 rounded-lg">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
