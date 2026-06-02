import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';

export default function Schools() {
  const { get, post, del } = useApi();
  const [schools, setSchools] = useState<any[]>([]);
  const [countries, setCountries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [location, setLocation] = useState('');
  const [countryId, setCountryId] = useState('');
  const [filterCountryId, setFilterCountryId] = useState('');

  const fetchData = async () => {
    try {
      const cData = await get<any[]>('/api/countries');
      setCountries(cData);
      const url = filterCountryId ? `/api/schools?country_id=${filterCountryId}` : '/api/schools';
      const sData = await get<any[]>(url);
      setSchools(sData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filterCountryId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!countryId) return alert('Select a country');
    try {
      await post('/api/schools', { name, address, location, country_id: parseInt(countryId) });
      setName('');
      setAddress('');
      setLocation('');
      fetchData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this school?')) return;
    try {
      await del(`/api/schools/${id}`);
      fetchData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Schools</h1>
          <p className="text-sm text-slate-500 mt-1">Manage schools.</p>
        </div>
        <div>
          <select 
            value={filterCountryId} 
            onChange={e=>setFilterCountryId(e.target.value)}
            className="border border-slate-200 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">All Countries</option>
            {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-2xl">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Add School</h2>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-slate-600 text-sm">Country</label>
            <select value={countryId} onChange={e=>setCountryId(e.target.value)} className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500">
                <option value="">Select a country</option>
                {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-slate-600 text-sm">Name</label>
            <input 
              type="text" required value={name} onChange={e=>setName(e.target.value)}
              className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500" 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-600 text-sm">Address</label>
                <input 
                  type="text" value={address} onChange={e=>setAddress(e.target.value)}
                  className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="font-semibold text-slate-600 text-sm">Location</label>
                <input 
                  type="text" value={location} onChange={e=>setLocation(e.target.value)}
                  className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                />
              </div>
          </div>
          <button type="submit" className="py-2 px-4 bg-slate-900 text-white rounded-lg font-bold text-xs hover:bg-slate-800 transition-colors">
            ADD SCHOOL
          </button>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Name</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Address</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Location</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Vendors</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {schools.map(s => (
              <tr key={s.id} className="hover:bg-slate-50/50">
                <td className="px-6 py-4 text-slate-800 font-medium">{s.name}</td>
                <td className="px-6 py-4 text-slate-500">{s.address || '-'}</td>
                <td className="px-6 py-4 text-slate-500">{s.location || '-'}</td>
                <td className="px-6 py-4 text-slate-500">{s.vendor_count}</td>
                <td className="px-6 py-4">
                  <button onClick={() => handleDelete(s.id)} className="text-xs font-bold text-red-600 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
            {!loading && schools.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-4 text-center text-slate-400">No schools found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
