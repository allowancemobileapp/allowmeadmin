import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Gist } from '../types';

export default function Gists() {
  const [gists, setGists] = useState<Gist[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<number | null>(null);
  const [editingGist, setEditingGist] = useState<Gist | null>(null);
  const { get, post, put } = useApi();

  const fetchGists = async () => {
    try {
      const data = await get<Gist[]>('/api/gists');
      if (Array.isArray(data)) {
        setGists(data);
      } else {
        setGists([]);
      }
    } catch (e: any) {
      console.error(e);
      setGists([]);
    }
  };

  useEffect(() => {
    fetchGists();
  }, []);

  const handleNotify = async (id: number) => {
    if (!window.confirm("Send a push notification to users for this gist?")) return;
    try {
      await post(`/api/gists/${id}/notify`, {});
      alert("Push notification sent!");
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDeleteGist = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this gist?")) return;
    try {
      await del(`/api/gists/${id}`);
      alert("Gist successfully deleted");
      if (editingGist && editingGist.id === id) setEditingGist(null);
      fetchGists();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGist) return;
    try {
      await put(`/api/gists/${editingGist.id}`, editingGist);
      alert('Gist details updated');
      setEditingGist(null);
      fetchGists();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Group by school safely
  const gistsBySchool = (gists || []).reduce((acc, gist) => {
    if (!gist) return acc;
    const sid = gist.school_id || 0; // 0 for global
    if (!acc[sid]) acc[sid] = { name: (gist as any).school_name || 'Global', gists: [] };
    acc[sid].gists.push(gist);
    return acc;
  }, {} as Record<number, { name: string, gists: Gist[] }>);

  const schoolIds = Array.from(new Set([0, ...Object.keys(gistsBySchool).map(Number)])).sort((a,b) => a-b);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Gist Moderation</h1>
        <p className="text-sm text-slate-500 mt-1">Manage active gists, drafts, and push notifications.</p>
      </div>

      {selectedSchool === null ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto overflow-hidden">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">School Name</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Total Active Gists</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Total Drafts</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schoolIds.map((sid) => {
                const schoolData = gistsBySchool[sid] || { name: sid === 0 ? 'Global' : `School #${sid}`, gists: [] };
                const schoolGists = schoolData.gists;
                const active = schoolGists.filter(g => g.status === 'active').length;
                const draft = schoolGists.filter(g => g.status === 'draft').length;
                return (
                  <tr key={sid} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 text-slate-800 font-bold uppercase tracking-wider text-xs">
                      {schoolData.name}
                    </td>
                    <td className="px-6 py-4 text-emerald-600 font-bold">{active}</td>
                    <td className="px-6 py-4 text-amber-500 font-bold">{draft}</td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => setSelectedSchool(sid)}
                        className="text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        View & Manage
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {schoolIds.length === 0 && <div className="p-6 text-center text-slate-400 font-medium text-sm">No gists found.</div>}
        </div>
      ) : (
        <div className="space-y-6">
          <button 
            onClick={() => setSelectedSchool(null)}
            className="text-sm font-bold text-slate-500 hover:text-slate-800 flex items-center gap-2 transition-colors uppercase tracking-wider text-xs"
          >
            ← Back to Schools
          </button>
          
          <h2 className="text-xl text-slate-800 font-bold">
             {(gistsBySchool[selectedSchool]?.name || (selectedSchool === 0 ? 'Global' : `School #${selectedSchool}`))} Gists
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Active Gists
              </h3>
              <div className="space-y-4">
                {(gistsBySchool[selectedSchool]?.gists || []).filter((g: any) => g.status === 'active').map((g: any) => (
                   <div key={g.id} className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row gap-4">
                      {g.image_url && (
                        <div className="w-full sm:w-24 h-24 shrink-0 bg-white border border-slate-200 rounded-lg flex items-center justify-center overflow-hidden">
                          <img src={g.image_url} alt="Gist" className="max-w-full max-h-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1">
                        <h4 className="font-bold text-slate-800 text-sm">{g.title}</h4>
                        <p className="text-sm text-slate-600 mt-1 mb-4">{g.content}</p>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => handleNotify(g.id)}
                            className="text-xs font-bold bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 shadow-sm transition-colors"
                          >
                            Send Push
                          </button>
                          <button 
                            onClick={() => setEditingGist(g)}
                            className="text-xs font-bold bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                          >
                            See Details
                          </button>
                        </div>
                      </div>
                   </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span> Drafts
              </h3>
              <div className="space-y-4">
                {(gistsBySchool[selectedSchool]?.gists || []).filter((g: any) => g.status === 'draft').map((g: any) => (
                   <div key={g.id} className="p-4 bg-slate-50 border border-slate-200 rounded-lg opacity-75 flex flex-col sm:flex-row gap-4">
                      {g.image_url && (
                        <div className="w-full sm:w-24 h-24 shrink-0 bg-white border border-slate-200 rounded-lg flex items-center justify-center overflow-hidden">
                          <img src={g.image_url} alt="Gist" className="max-w-full max-h-full object-cover grayscale" />
                        </div>
                      )}
                      <div className="flex-1">
                        <h4 className="font-bold text-slate-800 text-sm">{g.title}</h4>
                        <p className="text-sm text-slate-600 mt-1 mb-4">{g.content}</p>
                        <button 
                          onClick={() => setEditingGist(g)}
                          className="text-xs font-bold bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                        >
                          See Details
                        </button>
                      </div>
                   </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {editingGist && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 my-8">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Gist Details</h2>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              {((editingGist as any).image_url || (editingGist as any).media_url) && (
                <div className="mb-4">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Attached Media</label>
                  <div className="bg-slate-50 border border-slate-200 p-2 rounded-lg max-h-48 overflow-hidden flex justify-center items-center">
                     <img src={(editingGist as any).image_url || (editingGist as any).media_url} alt="Gist Media" className="max-w-full max-h-44 object-contain rounded" onError={(e) => e.currentTarget.style.display = 'none'} />
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Title / Message</label>
                <textarea 
                  className="w-full border border-slate-200 rounded px-3 py-2 bg-white text-slate-900 focus:outline-none focus:border-indigo-500" 
                  value={editingGist.title} 
                  onChange={e => setEditingGist({...editingGist, title: e.target.value})}
                  rows={4}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Context (Local / Global)</label>
                <select 
                  value={editingGist.content}
                  onChange={e => setEditingGist({...editingGist, content: e.target.value})}
                  className="w-full border border-slate-200 rounded px-3 py-2 bg-white text-slate-900 focus:outline-none focus:border-indigo-500"
                >
                  <option value="local">Local</option>
                   <option value="global">Global</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Status</label>
                  <select 
                    value={editingGist.status}
                    onChange={e => setEditingGist({...editingGist, status: e.target.value})}
                    className="w-full border border-slate-200 rounded px-3 py-2 bg-white text-slate-900 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Expiry Date</label>
                  <input type="text" readOnly className="w-full border border-slate-200 rounded px-3 py-2 bg-slate-50 text-slate-900" value={(editingGist as any).end_date ? new Date((editingGist as any).end_date).toLocaleString() : 'No expiry'} />
                </div>
              </div>
              <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => handleDeleteGist(editingGist.id)} className="px-3 py-2 font-bold text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors">Delete Gist</button>
                <div className="flex gap-3">
                    <button type="button" onClick={() => setEditingGist(null)} className="px-4 py-2 font-bold text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg">Cancel</button>
                    <button type="submit" className="px-4 py-2 font-bold text-sm text-white bg-slate-900 hover:bg-slate-800 rounded-lg">Save Changes</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
