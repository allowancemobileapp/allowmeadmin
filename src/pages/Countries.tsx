import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';

export default function Countries() {
  const { get, post, put, del } = useApi();
  const [countries, setCountries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [continent, setContinent] = useState('');

  const fetchCountries = async () => {
    try {
      const data = await get<any[]>('/api/countries');
      setCountries(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCountries();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await post('/api/countries', { name, continent });
      setName('');
      setContinent('');
      fetchCountries();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this country?')) return;
    try {
      await del(`/api/countries/${id}`);
      fetchCountries();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Countries</h1>
        <p className="text-sm text-slate-500 mt-1">Manage countries.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-2xl">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Add Country</h2>
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-slate-600 text-sm">Name</label>
            <input 
              type="text" required value={name} onChange={e=>setName(e.target.value)}
              className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500" 
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-slate-600 text-sm">Continent</label>
            <input 
              type="text" value={continent} onChange={e=>setContinent(e.target.value)}
              className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500" 
            />
          </div>
          <button type="submit" className="py-2 px-4 bg-slate-900 text-white rounded-lg font-bold text-xs hover:bg-slate-800 transition-colors">
            ADD COUNTRY
          </button>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto overflow-hidden">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Name</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Continent</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {countries.map(c => (
              <tr key={c.id} className="hover:bg-slate-50/50">
                <td className="px-6 py-4 text-slate-800 font-medium">{c.name}</td>
                <td className="px-6 py-4 text-slate-500">{c.continent || '-'}</td>
                <td className="px-6 py-4">
                  <button onClick={() => handleDelete(c.id)} className="text-xs font-bold text-red-600 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
            {!loading && countries.length === 0 && (
              <tr><td colSpan={3} className="px-6 py-4 text-center text-slate-400">No countries found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
