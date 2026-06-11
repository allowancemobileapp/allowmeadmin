import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';

export default function Transactions() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [expenseReasons, setExpenseReasons] = useState<string[]>([]);
  
  const [generating, setGenerating] = useState<string | null>(null);
  const [generateMsg, setGenerateMsg] = useState('');
  const [activeTab, setActiveTab] = useState<string>('expenses');
  const { get, post } = useApi();

  // Expense form state
  const [expTitle, setExpTitle] = useState('');
  const [expReason, setExpReason] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState('');

  const fetchData = async () => {
    try {
      const [txData, expData, reasonData] = await Promise.all([
        get<any[]>('/api/transactions'),
        get<any[]>('/api/expenses'),
        get<string[]>('/api/expenses/reasons')
      ]);
      setTransactions(txData);
      setExpenses(expData);
      setExpenseReasons(reasonData);
    } catch(e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleGenerate = async (segment: string) => {
    if (!window.confirm(`Are you sure you want to generate the ${segment === 'general' ? 'general financial' : segment} accounting sheet?`)) return;
    setGenerating(segment);
    setGenerateMsg('');
    try {
      const res = await post<{message: string}>('/api/accounting/generate', { segment });
      setGenerateMsg(res.message);
    } catch (e: any) {
      setGenerateMsg(e.message || "Failed to generate accounts.");
    } finally {
      setGenerating(null);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expTitle || !expReason || !expAmount) return alert('Please fill in title, reason, and amount');
    try {
      await post('/api/expenses', {
        title: expTitle,
        reason: expReason,
        amount: parseFloat(expAmount),
        expense_date: expDate ? new Date(expDate).toISOString() : new Date().toISOString()
      });
      setExpTitle('');
      setExpReason('');
      setExpAmount('');
      setExpDate('');
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Group transactions by simple normalized types for the tabs
  const getNormalizedType = (type: string) => {
    if (!type) return 'membership';
    const lowerType = type.toLowerCase();
    if (lowerType.includes('ticket')) return 'ticket';
    if (lowerType.includes('gist')) return 'gist';
    return 'membership';
  };

  const filteredTransactions = transactions.filter(tx => getNormalizedType(tx.type) === activeTab);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Financial Manager</h1>
          <p className="text-sm text-slate-500 mt-1">Review revenue flow, input daily expenses, and export accounts.</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <button 
            onClick={() => handleGenerate(activeTab)}
            disabled={!!generating}
            className="px-4 py-2 bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-lg shadow-sm hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            {generating === activeTab ? 'Exporting...' : `Export ${activeTab.toUpperCase()} Sheet`}
          </button>
          <button 
            onClick={() => handleGenerate('general')}
            disabled={!!generating}
            className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {generating === 'general' ? 'Generating...' : 'General Export (P&L, Balance)'}
          </button>
        </div>
      </div>

      {generateMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800 font-medium tracking-tight">
          {generateMsg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex bg-slate-200 p-1 rounded-lg w-full max-w-md">
        {['expenses', 'ticket', 'gist', 'membership'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 text-xs font-bold py-2 rounded-md transition-all ${activeTab === tab ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'expenses' ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* New Expense Form */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 xl:col-span-1 h-fit">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Log Daily Expense</h2>
            <form onSubmit={handleAddExpense} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">Title / Name</label>
                <input 
                  type="text" required placeholder="e.g. Server Hosting" value={expTitle} onChange={e=>setExpTitle(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">Reason / Category</label>
                <div className="relative">
                  <input 
                    type="text" required placeholder="Type or select reason..." 
                    value={expReason} onChange={e=>setExpReason(e.target.value)}
                    list="expense-reasons"
                    className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                  />
                  <datalist id="expense-reasons">
                    {expenseReasons.map(r => <option key={r} value={r} />)}
                  </datalist>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">Amount (₦)</label>
                <input 
                  type="number" required placeholder="0.00" value={expAmount} onChange={e=>setExpAmount(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 mb-1 block">Date</label>
                <input 
                  type="datetime-local" value={expDate} onChange={e=>setExpDate(e.target.value)}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-600" 
                />
              </div>
              <button type="submit" className="w-full py-2 bg-slate-900 text-white rounded font-bold text-sm tracking-wide mt-2 hover:bg-slate-800 transition-colors">
                SAVE EXPENSE
              </button>
            </form>
          </div>
          
          {/* Expenses List */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto overflow-hidden xl:col-span-2">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Title</th>
                  <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Reason</th>
                  <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Amount</th>
                  <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((exp: any) => (
                  <tr key={exp.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4 text-slate-800 font-bold text-xs">{exp.title}</td>
                    <td className="px-6 py-4 text-slate-600">
                      <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider">{exp.reason}</span>
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-base text-rose-600">-₦{parseFloat(exp.amount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs font-mono">{new Date(exp.expense_date).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {expenses.length === 0 && <div className="p-6 text-center text-slate-400 font-medium text-sm">No expenses logged yet.</div>}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto overflow-hidden">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Type</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">User</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Amount</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Status</th>
                <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransactions.map((tx: any) => (
                <tr key={tx.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 text-slate-800 font-bold uppercase tracking-wider text-xs">{tx.type}</td>
                  <td className="px-6 py-4 text-slate-600">{tx.user_email || '-'}</td>
                  <td className="px-6 py-4 text-emerald-600 font-mono font-bold text-base">+₦{parseFloat(tx.amount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${tx.status === 'successful' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-600 border border-slate-300'}`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-xs font-mono">{new Date(tx.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredTransactions.length === 0 && <div className="p-6 text-center text-slate-400 font-medium text-sm">No transactions found for this type.</div>}
        </div>
      )}
    </div>
  );
}
