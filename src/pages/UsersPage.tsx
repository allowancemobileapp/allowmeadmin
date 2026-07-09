import React, { useState, useEffect, useContext } from 'react';
import { useApi } from '../hooks/useApi';
import { AuthContext } from '../App';
import { UserSquare, Search, Star, Loader2, Calendar, FileText, Image, Crown, X, Hash, Ticket, Edit3, Trash } from 'lucide-react';

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [activeTab, setActiveTab] = useState('details');

  const { get, put } = useApi();
  const { email } = useContext(AuthContext);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await get<any[]>('/api/users');
      setUsers(data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleUserClick = async (user: any) => {
    setSelectedUser(user);
    setLoadingDetails(true);
    setActiveTab('details');
    try {
      const details = await get<any>(`/api/users/${user.id}`);
      setSelectedUser(details);
    } catch (e: any) {
      alert("Error loading details: " + e.message);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleUpgrade = async (userId: string, tier: string) => {
    try {
      const updated = await put<any>(`/api/users/${userId}/upgrade`, { tier });
      alert(`User upgraded to ${tier} successfully.`);
      setSelectedUser((prev: any) => ({ ...prev, subscription_tier: updated.subscription_tier, subscription_expires_at: updated.subscription_expires_at }));
      setUsers(users.map(u => u.id === userId ? { ...u, subscription_tier: updated.subscription_tier } : u));
    } catch (e: any) {
      alert("Error upgrading user: " + e.message);
    }
  };

  const handleEditGist = async (gistId: string) => {
    const title = prompt("Enter new title for gist:");
    if (!title) return;
    try {
      const res = await put(`/api/users/${selectedUser.id}/gists/${gistId}`, { title });
      setSelectedUser((prev: any) => ({
        ...prev,
        gists: prev.gists.map((g: any) => g.id === gistId ? { ...g, title: res.title } : g)
      }));
    } catch (e: any) { alert(e.message); }
  };

  const handleEditMoment = async (momentId: string) => {
    const caption = prompt("Enter new caption for moment:");
    if (!caption) return;
    try {
      const res = await put(`/api/users/${selectedUser.id}/moments/${momentId}`, { caption });
      setSelectedUser((prev: any) => ({
        ...prev,
        moments: prev.moments.map((m: any) => m.id === momentId ? { ...m, caption: res.caption } : m)
      }));
    } catch (e: any) { alert(e.message); }
  };

  const handleEditStory = async (storyId: string) => {
    const caption = prompt("Enter new caption for story:");
    if (!caption) return;
    try {
      const res = await put(`/api/users/${selectedUser.id}/stories/${storyId}`, { caption });
      setSelectedUser((prev: any) => ({
        ...prev,
        stories: prev.stories.map((s: any) => s.id === storyId ? { ...s, caption: res.caption } : s)
      }));
    } catch (e: any) { alert(e.message); }
  };

  const filteredUsers = users.filter(u => {
    const term = searchTerm.toLowerCase();
    return (u.username || '').toLowerCase().includes(term) || 
           (u.email || '').toLowerCase().includes(term) ||
           (u.full_name || '').toLowerCase().includes(term) ||
           (u.id || '').toLowerCase().includes(term);
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            <UserSquare className="w-8 h-8 text-indigo-500" />
            User Management
          </h1>
          <p className="text-slate-500 mt-1">View all users, inspect profiles, and manage content.</p>
        </div>
        
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text"
            placeholder="Search ID, Name, Username..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-64 pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 font-medium">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider font-bold">
                  <th className="px-6 py-4">Rank</th>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">User ID</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">School</th>
                  <th className="px-6 py-4 text-right">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((user) => (
                  <tr 
                    key={user.id} 
                    onClick={() => handleUserClick(user)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 text-slate-500 font-bold">
                      #{user.rank}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt={user.username} className="w-10 h-10 rounded-full object-cover bg-slate-100 border border-slate-200" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 font-bold flex items-center justify-center border border-indigo-200">
                            {(user.username || '?')[0].toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-slate-800">{user.username}</p>
                          <p className="text-xs text-slate-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-400">
                      {user.id}
                    </td>
                    <td className="px-6 py-4">
                      {user.subscription_tier === 'plus' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold border border-amber-200">
                          <Crown className="w-3 h-3" /> Plus
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200">
                          Free
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                        {user.school_name || 'N/A'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm text-slate-500">{new Date(user.created_at).toLocaleDateString()}</span>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* User Details Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="relative h-32 bg-gradient-to-r from-indigo-500 to-purple-600 p-6 shrink-0 flex items-start justify-between">
              <span className="bg-white/20 px-3 py-1 rounded text-white font-bold text-sm tracking-widest uppercase shadow-sm border border-white/20">
                User #{selectedUser.rank}
              </span>
              <button 
                onClick={() => setSelectedUser(null)}
                className="p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="px-6 pb-6 pt-0 relative flex-1 flex flex-col overflow-hidden">
              <div className="flex flex-col sm:flex-row gap-6 -mt-12 relative z-10 shrink-0">
                {selectedUser.avatar_url ? (
                  <img src={selectedUser.avatar_url} alt={selectedUser.username} className="w-24 h-24 rounded-2xl object-cover bg-white p-1 shadow-md" />
                ) : (
                  <div className="w-24 h-24 rounded-2xl bg-white p-1 shadow-md">
                    <div className="w-full h-full bg-indigo-100 text-indigo-600 font-bold flex items-center justify-center text-3xl rounded-xl">
                      {(selectedUser.username || '?')[0].toUpperCase()}
                    </div>
                  </div>
                )}
                
                <div className="pt-2 sm:pt-14 flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-2xl font-black text-slate-800">{selectedUser.full_name || selectedUser.username}</h2>
                      <p className="text-slate-500 flex items-center gap-2">
                        {selectedUser.username} &bull; {selectedUser.email}
                      </p>
                      <p className="text-xs font-mono text-slate-400 mt-1">ID: {selectedUser.id}</p>
                    </div>
                    {selectedUser.subscription_tier === 'plus' ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-sm font-bold border border-amber-200">
                        <Crown className="w-4 h-4" /> Plus User
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-sm font-bold border border-slate-200">
                        Free User
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {loadingDetails ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                </div>
              ) : (
                <div className="mt-8 flex-1 flex flex-col min-h-0">
                  <div className="flex border-b border-slate-200 shrink-0 overflow-x-auto">
                    {['details', 'gists', 'moments', 'stories', 'tickets'].map(tab => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-3 font-bold text-sm capitalize border-b-2 whitespace-nowrap transition-colors ${activeTab === tab ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                      >
                        {tab} {tab !== 'details' && `(${selectedUser[`${tab}_count`] || 0})`}
                      </button>
                    ))}
                  </div>

                  <div className="overflow-y-auto flex-1 pt-6">
                    {activeTab === 'details' && (
                      <div className="space-y-6">
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                          <div className="mb-4">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Bio</p>
                            <p className="text-slate-700">{selectedUser.bio || <span className="italic text-slate-400">No bio provided</span>}</p>
                          </div>
                          <div className="flex items-center gap-2 mb-2">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">School:</p>
                            <span className="text-sm font-medium text-slate-700">{selectedUser.school_name || 'N/A'}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100 flex flex-col items-center justify-center text-center">
                            <FileText className="w-6 h-6 text-indigo-600 mb-2" />
                            <p className="text-2xl font-black text-indigo-900">{selectedUser.gists_count || 0}</p>
                            <p className="text-xs font-bold text-indigo-600/70 uppercase">Gists</p>
                          </div>
                          <div className="bg-fuchsia-50 rounded-xl p-4 border border-fuchsia-100 flex flex-col items-center justify-center text-center">
                            <Image className="w-6 h-6 text-fuchsia-600 mb-2" />
                            <p className="text-2xl font-black text-fuchsia-900">{selectedUser.moments_count || 0}</p>
                            <p className="text-xs font-bold text-fuchsia-600/70 uppercase">Moments</p>
                          </div>
                          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100 flex flex-col items-center justify-center text-center">
                            <Star className="w-6 h-6 text-emerald-600 mb-2" />
                            <p className="text-2xl font-black text-emerald-900">{selectedUser.stories_count || 0}</p>
                            <p className="text-xs font-bold text-emerald-600/70 uppercase">Stories</p>
                          </div>
                          <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 flex flex-col items-center justify-center text-center">
                            <Ticket className="w-6 h-6 text-amber-600 mb-2" />
                            <p className="text-2xl font-black text-amber-900">{selectedUser.tickets_count || 0}</p>
                            <p className="text-xs font-bold text-amber-600/70 uppercase">Tickets</p>
                          </div>
                        </div>

                        {email === 'allowancemobileapp@gmail.com' && (
                          <div className="border-t border-slate-200 pt-6">
                            <h4 className="font-bold text-slate-800 mb-3">Admin Actions</h4>
                            <div className="flex gap-3">
                              {selectedUser.subscription_tier !== 'plus' ? (
                                <button
                                  onClick={() => handleUpgrade(selectedUser.id, 'plus')}
                                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg transition-colors flex items-center gap-2"
                                >
                                  <Crown className="w-4 h-4" /> Upgrade to Plus
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleUpgrade(selectedUser.id, 'free')}
                                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg transition-colors flex items-center gap-2"
                                >
                                  Downgrade to Free
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="text-xs text-center text-slate-400 pt-4">
                          Joined on {new Date(selectedUser.created_at).toLocaleString()}
                        </div>
                      </div>
                    )}

                    {activeTab === 'gists' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {selectedUser.gists?.map((gist: any) => (
                          <div key={gist.id} className="border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow bg-white flex flex-col group">
                            {gist.image_url && <img src={gist.image_url} alt="" className="w-full h-32 object-cover rounded-lg mb-3" />}
                            <h3 className="font-bold text-slate-800 line-clamp-2">{gist.title}</h3>
                            <div className="mt-auto pt-3 flex items-center justify-between">
                              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">{gist.category || 'General'}</span>
                              <button onClick={() => handleEditGist(gist.id)} className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                <Edit3 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                        {(!selectedUser.gists || selectedUser.gists.length === 0) && (
                          <p className="text-slate-500 col-span-full">No gists posted.</p>
                        )}
                      </div>
                    )}

                    {activeTab === 'moments' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {selectedUser.moments?.map((m: any) => (
                          <div key={m.id} className="border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow bg-white flex flex-col group">
                            {m.media_url && <img src={m.media_url} alt="" className="w-full h-40 object-cover rounded-lg mb-3" />}
                            <p className="text-slate-700 text-sm line-clamp-3">{m.caption}</p>
                            <div className="mt-auto pt-3 flex items-center justify-between">
                              <span className="text-xs text-slate-400">{new Date(m.created_at).toLocaleDateString()}</span>
                              <button onClick={() => handleEditMoment(m.id)} className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                <Edit3 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                        {(!selectedUser.moments || selectedUser.moments.length === 0) && (
                          <p className="text-slate-500 col-span-full">No moments posted.</p>
                        )}
                      </div>
                    )}

                    {activeTab === 'stories' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {selectedUser.stories?.map((s: any) => (
                          <div key={s.id} className="border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow bg-white flex flex-col group">
                            {s.media_url && <img src={s.media_url} alt="" className="w-full h-48 object-cover rounded-lg mb-3" />}
                            <p className="text-slate-700 text-sm">{s.caption || 'No caption'}</p>
                            <div className="mt-auto pt-3 flex items-center justify-between">
                              <span className="text-xs text-slate-400">{new Date(s.created_at).toLocaleString()}</span>
                              <button onClick={() => handleEditStory(s.id)} className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                <Edit3 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                        {(!selectedUser.stories || selectedUser.stories.length === 0) && (
                          <p className="text-slate-500 col-span-full">No stories posted.</p>
                        )}
                      </div>
                    )}

                    {activeTab === 'tickets' && (
                      <div className="grid grid-cols-1 gap-3">
                        {selectedUser.tickets?.map((t: any) => (
                          <div key={t.id} className="border border-slate-200 rounded-xl p-4 bg-white flex gap-4 items-center">
                            {t.photo_url ? (
                              <img src={t.photo_url} alt="" className="w-16 h-16 rounded-lg object-cover" />
                            ) : (
                              <div className="w-16 h-16 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center">
                                <Ticket className="w-8 h-8" />
                              </div>
                            )}
                            <div>
                              <h3 className="font-bold text-slate-800">{t.name}</h3>
                              <p className="text-xs text-slate-500">Ref: {t.payment_reference || 'N/A'}</p>
                              <p className="text-xs text-slate-500">Status: {t.status}</p>
                            </div>
                            <div className="ml-auto text-right">
                              <span className="font-bold text-slate-800">₦{t.amount_paid / 100}</span>
                              <p className="text-xs text-slate-400">{new Date(t.created_at).toLocaleDateString()}</p>
                            </div>
                          </div>
                        ))}
                        {(!selectedUser.tickets || selectedUser.tickets.length === 0) && (
                          <p className="text-slate-500 col-span-full">No tickets bought.</p>
                        )}
                      </div>
                    )}

                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
