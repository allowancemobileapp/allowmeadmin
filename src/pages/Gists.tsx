import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Gist } from '../types';

export default function Gists() {
  const [gists, setGists] = useState<Gist[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<number | null>(null);
  const { get, post } = useApi();

  const fetchGists = async () => {
    try {
      const data = await get<Gist[]>('/api/gists');
      // For demo, if no gists, generate some mocks
      if(data.length === 0) {
        setGists([
           { id: 1, title: 'Sample Active Gist A', content: 'Lorem', school_id: 1, status: 'active', created_at: new Date().toISOString() },
           { id: 2, title: 'Draft Gist B', content: 'Ipsum', school_id: 1, status: 'draft', created_at: new Date().toISOString() },
           { id: 3, title: 'Sample Active Gist C', content: 'School 2', school_id: 2, status: 'active', created_at: new Date().toISOString() }
        ]);
      } else {
        setGists(data);
      }
    } catch (e: any) {
      console.error(e);
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

  // Group by school
  const gistsBySchool = gists.reduce((acc, gist) => {
    if (!acc[gist.school_id]) acc[gist.school_id] = [];
    acc[gist.school_id].push(gist);
    return acc;
  }, {} as Record<number, Gist[]>);

  const schoolIds = Object.keys(gistsBySchool).map(Number);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Gist Moderation</h1>
        <p className="text-sm text-slate-500 mt-1">Manage active gists, drafts, and push notifications.</p>
      </div>

      {!selectedSchool ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">School ID</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Total Active Gists</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Total Drafts</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schoolIds.map((sid) => {
                const schoolGists = gistsBySchool[sid];
                const active = schoolGists.filter(g => g.status === 'active').length;
                const draft = schoolGists.filter(g => g.status === 'draft').length;
                return (
                  <tr key={sid} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 text-slate-800 font-bold uppercase tracking-wider text-xs">School #{sid}</td>
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
          
          <h2 className="text-xl text-slate-800 font-bold">School #{selectedSchool} Gists</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Active Gists
              </h3>
              <div className="space-y-4">
                {gistsBySchool[selectedSchool].filter(g => g.status === 'active').map(g => (
                   <div key={g.id} className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                      <h4 className="font-bold text-slate-800 text-sm">{g.title}</h4>
                      <p className="text-sm text-slate-600 mt-1 mb-4">{g.content}</p>
                      <button 
                        onClick={() => handleNotify(g.id)}
                        className="text-xs font-bold bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 shadow-sm transition-colors"
                      >
                        Send Push Notification
                      </button>
                   </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span> Drafts
              </h3>
              <div className="space-y-4">
                {gistsBySchool[selectedSchool].filter(g => g.status === 'draft').map(g => (
                   <div key={g.id} className="p-4 bg-slate-50 border border-slate-200 rounded-lg opacity-75">
                      <h4 className="font-bold text-slate-800 text-sm">{g.title}</h4>
                      <p className="text-sm text-slate-600 mt-1">{g.content}</p>
                   </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
