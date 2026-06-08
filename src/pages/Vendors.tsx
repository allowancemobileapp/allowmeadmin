import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Store } from 'lucide-react';
import { useApi } from '../hooks/useApi';

export default function Vendors() {
  const { get, post, del } = useApi();
  const [vendors, setVendors] = useState<any[]>([]);
  const [schools, setSchools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [filterSchoolId, setFilterSchoolId] = useState('');

  const fetchData = async () => {
    try {
      const sData = await get<any[]>('/api/schools');
      setSchools(sData);
      const url = filterSchoolId ? `/api/vendors?school_id=${filterSchoolId}` : '/api/vendors';
      const vData = await get<any[]>(url);
      setVendors(vData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filterSchoolId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!filterSchoolId) return alert('Select a school first from the top right');
    try {
      await post('/api/vendors', { name, phone_number: phone, school_id: parseInt(filterSchoolId) });
      setName('');
      setPhone('');
      fetchData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this vendor?')) return;
    try {
      await del(`/api/vendors/${id}`);
      fetchData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Vendors</h1>
          <p className="text-sm text-slate-500 mt-1">Manage vendors and their specific menus.</p>
        </div>
        <div>
          <select 
            value={filterSchoolId} 
            onChange={e=>setFilterSchoolId(e.target.value)}
            className="border border-slate-200 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500 font-medium bg-white"
          >
            <option value="">-- Choose a School First --</option>
            {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {!filterSchoolId ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-12 text-center">
             <Store className="w-12 h-12 text-slate-300 mx-auto mb-4" />
             <h3 className="text-lg font-bold text-slate-700">No School Selected</h3>
             <p className="text-slate-500 mt-2">Please select a school from the top right dropdown to view and manage its vendors.</p>
        </div>
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-2xl">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Add Vendor</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="font-semibold text-slate-600 text-sm">Name</label>
                    <input 
                      type="text" required value={name} onChange={e=>setName(e.target.value)}
                      className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-semibold text-slate-600 text-sm">Phone Number</label>
                    <input 
                      type="text" value={phone} onChange={e=>setPhone(e.target.value)}
                      className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                    />
                  </div>
              </div>
              <button type="submit" className="py-2 px-4 bg-slate-900 text-white rounded-lg font-bold text-xs hover:bg-slate-800 transition-colors">
                ADD VENDOR
              </button>
            </form>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto overflow-hidden">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Name</th>
                  <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Phone</th>
                  <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">School ID</th>
                  <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendors.map(v => (
                  <tr key={v.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 text-slate-800 font-medium">{v.name}</td>
                    <td className="px-6 py-4 text-slate-500">{v.phone_number || '-'}</td>
                    <td className="px-6 py-4 text-slate-500">{v.school_id}</td>
                    <td className="px-6 py-4 flex items-center gap-4">
                      <Link to={`/vendors/${v.id}/menu`} className="text-xs font-bold text-indigo-600 hover:underline">View Menu</Link>
                      <button onClick={() => handleDelete(v.id)} className="text-xs font-bold text-red-600 hover:underline">Delete</button>
                    </td>
                  </tr>
                ))}
                {!loading && vendors.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-4 text-center text-slate-400">No vendors found for this school</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
