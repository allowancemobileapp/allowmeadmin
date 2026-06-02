import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';

export default function Combos() {
  const { get, del } = useApi();
  const [vendors, setVendors] = useState<any[]>([]);
  const [vendorId, setVendorId] = useState('');
  const [options, setOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVendors = async () => {
    try {
      const data = await get<any[]>('/api/vendors');
      setVendors(data);
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchOptions = async () => {
    if (!vendorId) return setOptions([]);
    try {
      const data = await get<any[]>(`/api/options?vendor_id=${vendorId}`);
      setOptions(data);
    } catch(e) {
       console.error(e);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  useEffect(() => {
    fetchOptions();
  }, [vendorId]);

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this combo?')) return;
    try {
      await del(`/api/options/${id}`);
      fetchOptions();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Vendor Combos</h1>
          <p className="text-sm text-slate-500 mt-1">Manage vendor meal combinations.</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <div className="max-w-md">
            <label className="font-semibold text-slate-600 text-sm mb-2 block">Select Vendor</label>
            <select 
              value={vendorId} 
              onChange={e=>setVendorId(e.target.value)}
              className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">-- Choose Vendor --</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
        </div>
      </div>

      {vendorId && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Description</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Price</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Calories</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {options.map(opt => (
                <tr key={opt.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 text-slate-800 font-medium whitespace-normal">{opt.combo_description}</td>
                  <td className="px-6 py-4 text-indigo-600 font-bold font-mono">₦{parseFloat(opt.total_price).toFixed(2)}</td>
                  <td className="px-6 py-4 text-slate-500">{opt.total_calories}</td>
                  <td className="px-6 py-4">
                    <button onClick={() => handleDelete(opt.id)} className="text-xs font-bold text-red-600 hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
              {options.length === 0 && (
                <tr><td colSpan={4} className="px-6 py-4 text-center text-slate-400">No combos generated for this vendor</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
