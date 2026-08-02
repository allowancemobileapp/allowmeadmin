import fs from 'fs';

const code = `
import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Check, X, Briefcase, ExternalLink, ShieldCheck, AlertTriangle } from 'lucide-react';

export default function Services() {
  const { get, post } = useApi();
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const data = await get<any[]>('/api/services');
      setServices(data);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAction = async (id: string, action: 'approve' | 'reject' | 'suspend') => {
    try {
      await post(\`/api/approvals/services/\${id}/\${action}\`, {});
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
            <Briefcase className="w-6 h-6 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Services</h2>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400">Loading...</div>
      ) : (
        <div className="space-y-4">
          {services.length === 0 && <p className="py-10 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200 border-dashed">No services found.</p>}
          {services.map(service => {
            const isExpanded = expandedId === service.id;
            
            return (
              <div key={service.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                {/* Header (Clickable) */}
                <div 
                  className="p-5 border-b border-slate-100 flex gap-4 cursor-pointer hover:bg-slate-50 transition"
                  onClick={() => setExpandedId(isExpanded ? null : service.id)}
                >
                  {service.avatar_url ? (
                    <img src={service.avatar_url} className="w-16 h-16 rounded-xl object-cover bg-slate-100 shrink-0 border border-slate-200" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200 text-slate-400">
                      <Briefcase className="w-6 h-6" />
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-bold text-slate-800 text-xl">{service.title || service.category_tag || "Unnamed Service"}</h3>
                        {service.subscription_tier === 'Membership' && <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Plus User</span>}
                        <span className={\`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider \${service.status === 'active' ? 'bg-emerald-100 text-emerald-700' : service.status === 'rejected' || service.status === 'suspended' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}\`}>
                          {service.status}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 line-clamp-1">{service.description || "No description provided."}</p>
                    <div className="text-xs text-slate-400 mt-1">
                      Owner: @{service.owner_username || service.username || 'Unknown'} • Region: {service.primary_region || 'N/A'}
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
                            <div className="flex justify-between"><span className="text-slate-500">Owner:</span> <span className="font-medium">@{service.owner_username || service.username || 'Unknown'}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Status:</span> <span className="font-medium capitalize">{service.status}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Category:</span> <span className="font-medium">{service.category || service.category_tag || 'N/A'}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Occupation:</span> <span className="font-medium">{service.linked_occupation || 'N/A'}</span></div>
                            <div className="flex justify-between"><span className="text-slate-500">Region:</span> <span className="font-medium">{service.primary_region || 'N/A'}</span></div>
                          </div>
                        </div>

                        <div>
                          <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-2">Certification</h4>
                          <div className="bg-white rounded-lg border border-slate-200 p-3">
                            {service.registration_document_url ? (
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-700 font-medium">Document</span>
                                <a href={service.registration_document_url} target="_blank" rel="noreferrer" className="text-indigo-600 font-medium hover:underline inline-flex items-center gap-1 text-xs">
                                  View File <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            ) : (
                              <div className="text-sm text-slate-400 italic">No document uploaded.</div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500 mb-2">Service Offerings ({service.offerings?.length || 0})</h4>
                        <div className="bg-white rounded-lg border border-slate-200 p-1 h-64 overflow-y-auto">
                          {!service.offerings || service.offerings.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-sm text-slate-400 italic">No offerings added yet.</div>
                          ) : (
                            <div className="divide-y divide-slate-100">
                              {service.offerings.map((offering: any) => (
                                <div key={offering.id} className="p-3 hover:bg-slate-50 transition">
                                  <div className="flex justify-between items-start mb-1">
                                    <span className="font-bold text-slate-800 text-sm">{offering.title || offering.name}</span>
                                    <span className="font-bold text-emerald-600 text-sm">₦{offering.price || offering.standard_cost}</span>
                                  </div>
                                  {offering.description && <p className="text-xs text-slate-500 line-clamp-2 mb-2">{offering.description}</p>}
                                  <div className="flex gap-2 text-[10px] font-bold text-slate-500">
                                    <span className="bg-slate-100 px-1.5 py-0.5 rounded">Duration: {offering.duration || 'N/A'}</span>
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
                      {service.status === 'active' ? (
                        <button 
                          onClick={() => handleAction(service.id, 'suspend')}
                          className="flex-1 bg-red-50 text-red-600 font-bold py-2.5 px-4 rounded-lg hover:bg-red-100 transition flex items-center justify-center gap-2 text-sm min-w-[120px]"
                        >
                          <AlertTriangle className="w-4 h-4" /> Suspend Service
                        </button>
                      ) : (
                        <>
                          <button 
                            onClick={() => handleAction(service.id, 'approve')}
                            className="flex-1 bg-slate-900 text-white font-bold py-2.5 px-4 rounded-lg hover:bg-slate-800 transition flex items-center justify-center gap-2 text-sm min-w-[120px]"
                          >
                            <Check className="w-4 h-4" /> Approve (Active)
                          </button>
                          {service.status !== 'rejected' && (
                            <button 
                              onClick={() => handleAction(service.id, 'reject')}
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

fs.writeFileSync('src/pages/Services.tsx', code);
