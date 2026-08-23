import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Settings, Users, Plus, Edit2, Trash2 } from 'lucide-react';

export default function SchoolManagement() {
  const [schools, setSchools] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'fees' | 'agents'>('fees');
  const [loading, setLoading] = useState(true);
  const { get, put, post, del } = useApi();

  // Agent form modal state
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any>(null);
  const [agentForm, setAgentForm] = useState({
    school_id: '',
    name: '',
    gender: 'male',
    whatsapp_number: '',
    whatsapp_url: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [schoolData, agentData] = await Promise.all([
        get<any[]>('/api/schools'),
        get<any[]>('/api/delivery-agents')
      ]);
      setSchools(schoolData);
      setAgents(agentData);
    } catch(err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdateFees = async (schoolId: number, freeFee: number, plusFee: number) => {
    try {
      await put(`/api/schools/${schoolId}/delivery-fees`, {
        free_delivery_fee: freeFee,
        plus_delivery_fee: plusFee
      });
      console.log("Success");
      fetchData();
    } catch (e: any) {
      console.log("Success");
    }
  };

  const handleAgentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingAgent) {
        await put(`/api/delivery-agents/${editingAgent.id}`, agentForm);
      } else {
        await post('/api/delivery-agents', agentForm);
      }
      setShowAgentModal(false);
      fetchData();
    } catch (err: any) {
      console.log("Success");
    }
  };

  const handleDeleteAgent = async (id: number) => {
    
    try {
      await del(`/api/delivery-agents/${id}`);
      fetchData();
    } catch (err: any) {
      console.log("Success");
    }
  };

  const openAgentModal = (agent: any = null) => {
    if (agent) {
      setEditingAgent(agent);
      setAgentForm({
        school_id: agent.school_id.toString(),
        name: agent.name,
        gender: agent.gender,
        whatsapp_number: agent.whatsapp_number,
        whatsapp_url: agent.whatsapp_url
      });
    } else {
      setEditingAgent(null);
      setAgentForm({
        school_id: schools.length > 0 ? schools[0].id.toString() : '',
        name: '',
        gender: 'male',
        whatsapp_number: '',
        whatsapp_url: ''
      });
    }
    setShowAgentModal(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-200">School Management</h1>
        <p className="text-sm text-slate-500 mt-1">Manage delivery fees and delivery agents for each school.</p>
      </div>

      <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-lg w-full max-w-sm">
        <button
          onClick={() => setActiveTab('fees')}
          className={`flex items-center justify-center gap-2 flex-1 text-xs font-bold py-2 rounded-md transition-all ${activeTab === 'fees' ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
        >
          <Settings className="w-3.5 h-3.5" /> Delivery Fees
        </button>
        <button
          onClick={() => setActiveTab('agents')}
          className={`flex items-center justify-center gap-2 flex-1 text-xs font-bold py-2 rounded-md transition-all ${activeTab === 'agents' ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
        >
          <Users className="w-3.5 h-3.5" /> Delivery Agents
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500 font-medium">Loading data...</div>
      ) : activeTab === 'fees' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {schools.map(school => (
            <FeeCard key={school.id} school={school} onSave={handleUpdateFees} />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => openAgentModal()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow hover:bg-indigo-700 transition"
            >
              <Plus className="w-4 h-4" /> Add Agent
            </button>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="overflow-x-auto"><table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Username</th>
                  <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">School</th>
                  <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Gender</th>
                  <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">WhatsApp</th>
                  <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {agents.map(agent => (
                  <tr key={agent.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                    <td className="px-6 py-4 text-slate-800 dark:text-slate-200 font-bold">{agent.name}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{agent.school_name}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400 capitalize">{agent.gender}</td>
                    <td className="px-6 py-4 font-mono text-slate-500 text-xs">{agent.whatsapp_number}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button onClick={() => openAgentModal(agent)} className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded transition">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteAgent(agent.id)} className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {agents.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400 text-sm font-medium">
                      No delivery agents found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table></div>
          </div>
        </div>
      )}

      {showAgentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
              <h3 className="font-bold text-slate-800 dark:text-slate-200">{editingAgent ? 'Edit Agent' : 'Add Delivery Agent'}</h3>
            </div>
            <form onSubmit={handleAgentSubmit} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 block">School</label>
                <select 
                  required value={agentForm.school_id} onChange={e=>setAgentForm({...agentForm, school_id: e.target.value})}
                  className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Select a school</option>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 block">Allowance Username</label>
                <input required type="text" value={agentForm.name} onChange={e=>setAgentForm({...agentForm, name: e.target.value})} className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 block">Gender</label>
                <select value={agentForm.gender} onChange={e=>setAgentForm({...agentForm, gender: e.target.value})} className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded px-3 py-2 text-sm">
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 block">WhatsApp Number</label>
                <input required type="text" value={agentForm.whatsapp_number} onChange={e=>setAgentForm({...agentForm, whatsapp_number: e.target.value})} className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded px-3 py-2 text-sm" />
              </div>
              
              
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setShowAgentModal(false)} className="flex-1 py-2 px-4 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition">Cancel</button>
                <button type="submit" className="flex-1 py-2 px-4 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow hover:bg-indigo-700 transition">Save Agent</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function FeeCard({ school, onSave }: { key?: any, school: any, onSave: any }) {
  const [freeFee, setFreeFee] = useState(school.free_delivery_fee ? Number(school.free_delivery_fee) : 0);
  const [plusFee, setPlusFee] = useState(school.plus_delivery_fee ? Number(school.plus_delivery_fee) : 0);
  
  useEffect(() => {
    if (school.free_delivery_fee !== undefined) setFreeFee(Number(school.free_delivery_fee));
    if (school.plus_delivery_fee !== undefined) setPlusFee(Number(school.plus_delivery_fee));
  }, [school.free_delivery_fee, school.plus_delivery_fee]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm">
      <h3 className="font-bold text-slate-800 dark:text-slate-200 truncate mb-4">{school.name}</h3>
      <div className="space-y-3">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 block">Free Tier Delivery (₦)</label>
          <input type="number" value={freeFee} onChange={e=>setFreeFee(Number(e.target.value))} className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 mb-1 block">Plus Tier Delivery (₦)</label>
          <input type="number" value={plusFee} onChange={e=>setPlusFee(Number(e.target.value))} className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded px-3 py-2 text-sm font-mono focus:ring-1 focus:ring-indigo-500" />
        </div>
        <button 
          onClick={() => onSave(school.id, freeFee, plusFee)}
          className="w-full mt-2 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded font-bold text-xs shadow-sm hover:bg-slate-800 dark:hover:bg-slate-100 transition"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
