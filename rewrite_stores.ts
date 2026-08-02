import fs from 'fs';

const code = `
import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Check, X, Building, ShieldCheck, ExternalLink, BadgeCheck, Store, ShieldAlert, AlertTriangle } from 'lucide-react';

export default function Stores() {
  const { get, post } = useApi();
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const data = await get<any[]>('/api/stores');
      setStores(data);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAction = async (id: string, action: 'approve' | 'reject' | 'verify' | 'revoke' | 'suspend') => {
    try {
      await post(\`/api/approvals/stores/\${id}/\${action}\`, {});
      fetchData();
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-100 p-2 rounded-lg">
            <Store className="w-6 h-6 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Stores</h2>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400">Loading...</div>
      ) : (
        <div className="space-y-4">
          {stores.length === 0 && <p className="py-10 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200 border-dashed">No stores found.</p>}
          {stores.map(store => {
            const isExpanded = expandedId === store.id;
            
            return (
              <div key={store.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                {/* Header (Clickable) */}
                <div 
                  className="p-5 border-b border-slate-100 flex gap-4 cursor-pointer hover:bg-slate-50 transition"
                  onClick={() => setExpandedId(isExpanded ? null : store.id)}
                >
                  {store.avatar_url ? (
                    <img src={store.avatar_url} className="w-16 h-16 rounded-xl object-cover bg-slate-100 shrink-0 border border-slate-200" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200 text-slate-400">
                      <Building className="w-6 h-6" />
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-bold text-slate-800 text-xl">{store.name}</h3>
                        {store.is_plus_verified && <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"><ShieldCheck className="w-3 h-3"/> Plus Verified</span>}
                        {store.subscription_tier === 'Membership' && <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Plus User</span>}
                        <span className={\`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider \${store.status === 'active' ? 'bg-emerald-100 text-emerald-700' : store.status === 'rejected' || store.status === 'suspended' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}\`}>
                          {store.status}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 line-clamp-1">{store.description || "No description provided."}</p>
                    <div className="text-xs text-slate-400 mt-1">
                      Owner: @{store.owner_username || store.username || 'Unknown'} • Region: {store.primary_region || 'N/A'}
                    </div>
                  </div>
                </div>

                {/* Expanded Body */}
                {isExpanded && (
                  <>
                    <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50 border-b border-slate-100">
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-2">General Info</h4>
                          <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-slate-500">Owner:</span> <span className="font-medium">@{store.owner_username || store.username || 'Unknown'}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Status:</span> <span className="font-medium capitalize">{store.status}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Region:</span> <span className="font-medium">{store.primary_region || 'N/A'}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Categories:</span> <span className="font-medium text-right max-w-[200px] truncate">{(store.categories || []).join(', ') || 'N/A'}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Hours:</span> <span className="font-medium">{store.open_time || '??'} - {store.close_time || '??'}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Transport:</span> <span className="font-medium">{store.use_allowance_transport ? 'Yes' : 'No'}</span></div>
                          </div>
                        </div>

                        <div>
                          <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-2">Credentials & Documents</h4>
                          <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-3">
                            {store.registration_document_url && (
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-700 font-medium">Primary CAC / Doc</span>
                                <a href={store.registration_document_url} target="_blank" rel="noreferrer" className="text-indigo-600 font-medium hover:underline inline-flex items-center gap-1 text-xs">
                                  View File <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            )}
                            
                            {(!store.credentials || store.credentials.length === 0) && !store.registration_document_url && (
                              <div className="text-sm text-slate-400 italic">No additional credentials uploaded.</div>
                            )}
                            
                            {(store.credentials || []).map((cred: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between text-sm pt-2 border-t border-slate-100 first:border-0 first:pt-0">
                                <div className="flex flex-col">
                                  <span className="text-slate-700 font-medium">{cred.title}</span>
                                  <span className="text-[10px] uppercase text-slate-400 font-bold">{cred.kind}</span>
                                </div>
                                <a href={cred.file_url} target="_blank" rel="noreferrer" className="text-indigo-600 font-medium hover:underline inline-flex items-center gap-1 text-xs">
                                  View <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-2">Products / Catalog ({store.products?.length || 0})</h4>
                        <div className="bg-white rounded-lg border border-slate-200 p-1 h-64 overflow-y-auto">
                          {!store.products || store.products.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-sm text-slate-400 italic">No products added yet.</div>
                          ) : (
                            <div className="divide-y divide-slate-100">
                              {store.products.map((prod: any) => (
                                <div key={prod.id} className="p-3 hover:bg-slate-50 transition">
                                  <div className="flex justify-between items-start mb-1">
                                    <span className="font-bold text-slate-800 text-sm">{prod.name}</span>
                                    <span className="font-bold text-emerald-600 text-sm">₦{prod.standard_price}</span>
                                  </div>
                                  {prod.description && <p className="text-xs text-slate-500 line-clamp-2 mb-2">{prod.description}</p>}
                                  <div className="flex gap-2 text-[10px] font-bold text-slate-500">
                                    <span className="bg-slate-100 px-1.5 py-0.5 rounded">Supply: {prod.total_supply}</span>
                                    <span className="bg-slate-100 px-1.5 py-0.5 rounded">MOQ: {prod.moq}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="p-4 bg-white flex flex-wrap gap-3">
                      {store.status === 'active' ? (
                        <>
                          <button 
                            onClick={() => handleAction(store.id, 'suspend')}
                            className="flex-1 bg-red-50 text-red-600 font-bold py-2.5 px-4 rounded-lg hover:bg-red-100 transition flex items-center justify-center gap-2 text-sm min-w-[120px]"
                          >
                            <AlertTriangle className="w-4 h-4" /> Suspend Store
                          </button>
                          
                          {store.is_plus_verified ? (
                            <button 
                              onClick={() => handleAction(store.id, 'revoke')}
                              className="flex-1 bg-amber-50 text-amber-600 font-bold py-2.5 px-4 rounded-lg hover:bg-amber-100 transition flex items-center justify-center gap-2 text-sm min-w-[120px]"
                            >
                              <ShieldAlert className="w-4 h-4" /> Revoke Verification
                            </button>
                          ) : (
                            <button 
                              onClick={() => handleAction(store.id, 'verify')}
                              className="flex-1 bg-emerald-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-emerald-700 transition flex items-center justify-center gap-2 text-sm min-w-[120px]"
                            >
                              <BadgeCheck className="w-4 h-4" /> Verify Store
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <button 
                            onClick={() => handleAction(store.id, 'approve')}
                            className="flex-1 bg-slate-900 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-slate-800 transition flex items-center justify-center gap-2 text-sm min-w-[120px]"
                          >
                            <Check className="w-4 h-4" /> Approve (Active)
                          </button>
                          <button 
                            onClick={() => handleAction(store.id, 'verify')}
                            className="flex-1 bg-emerald-600 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-emerald-700 transition flex items-center justify-center gap-2 text-sm min-w-[120px]"
                          >
                            <BadgeCheck className="w-4 h-4" /> Verify & Approve
                          </button>
                          {store.status !== 'rejected' && (
                            <button 
                              onClick={() => handleAction(store.id, 'reject')}
                              className="flex-1 bg-red-50 text-red-600 font-bold py-2.5 px-4 rounded-lg hover:bg-red-100 transition flex items-center justify-center gap-2 text-sm min-w-[120px]"
                            >
                              <X className="w-4 h-4" /> Reject
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
`;

fs.writeFileSync('src/pages/Stores.tsx', code);
