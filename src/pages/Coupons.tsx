import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import { Coupon } from '../types';

export default function Coupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState('10%');
  const [expiryDate, setExpiryDate] = useState('');
  const [maxSupply, setMaxSupply] = useState<string>('500');
  const [unlimited, setUnlimited] = useState(false);
  const [error, setError] = useState('');
  const { get, post } = useApi();

  const fetchCoupons = async () => {
    try {
      const data = await get<Coupon[]>('/api/coupons');
      setCoupons(data);
    } catch (e: any) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (code.length !== 6) throw new Error("Coupon code must be exactly 6 characters.");
      
      const payload = {
        code,
        discount_type: discountType,
        expiry_date: new Date(expiryDate).toISOString(),
        max_supply: unlimited ? null : Number(maxSupply)
      };
      await post('/api/coupons', payload);
      setCode('');
      setDiscountType('10%');
      setExpiryDate('');
      setMaxSupply('500');
      setUnlimited(false);
      fetchCoupons();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Coupon Generator</h1>
        <p className="text-sm text-slate-500 mt-1">Manage discount codes and supply limits.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col max-w-2xl">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Coupon Engine</h3>
        {error && <div className="p-3 mb-4 text-sm bg-red-50 border border-red-200 text-red-600 rounded-md">{error}</div>}
        <form onSubmit={handleCreate} className="space-y-4 flex flex-col">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-600 text-sm">Coupon Name (6 chars)</label>
              <input 
                type="text" 
                maxLength={6}
                minLength={6}
                required 
                placeholder="GIST50"
                value={code} 
                onChange={e=>setCode(e.target.value.toUpperCase())}
                className="border border-slate-200 rounded px-3 py-2 w-full uppercase focus:outline-none focus:ring-1 focus:ring-indigo-500" 
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-semibold text-slate-600 text-sm">Discount Type</label>
              <select 
                value={discountType} 
                onChange={e=>setDiscountType(e.target.value)}
                className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="100%">100% Discount</option>
                <option value="75%">75% Discount</option>
                <option value="50%">50% Discount</option>
                <option value="25%">25% Discount</option>
                <option value="10%">10% Discount</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-semibold text-slate-600 text-sm">Expiry Date</label>
            <input 
              type="datetime-local" 
              required 
              value={expiryDate} 
              onChange={e=>setExpiryDate(e.target.value)}
              className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500" 
            />
            {discountType === '100%' && <p className="text-[10px] text-amber-600 italic leading-tight bg-amber-50 p-2 border border-amber-100 rounded mt-1">Note: 100% discount codes cannot exceed 1 month expiry.</p>}
          </div>
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 mt-1">
            <label className="flex items-center gap-2 text-sm text-slate-700 font-medium">
              <input type="checkbox" checked={unlimited} onChange={e=>setUnlimited(e.target.checked)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              Unlimited Supply
            </label>
            {!unlimited && (
              <div className="flex flex-col gap-1 mt-1">
                <label className="font-semibold text-slate-600 text-sm">Max Supply</label>
                <input 
                  type="number" 
                  max={500}
                  required
                  value={maxSupply} 
                  onChange={e=>setMaxSupply(e.target.value)}
                  placeholder="Max 500"
                  className="border border-slate-200 rounded px-3 py-2 w-full focus:outline-none focus:ring-1 focus:ring-indigo-500" 
                />
              </div>
            )}
          </div>
          <button type="submit" className="w-full py-3 mt-4 bg-slate-900 text-white rounded-lg font-bold text-xs hover:bg-slate-800 transition-colors">
            AUTHORIZE & PUBLISH COUPON
          </button>
        </form>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Code</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Discount</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Supply</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Used</th>
              <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Expires</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {coupons.map((coupon) => {
              const isExpired = new Date(coupon.expiry_date) < new Date();
              return (
                <tr key={coupon.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 text-slate-800 font-mono font-bold tracking-wider">{coupon.code}</td>
                  <td className="px-6 py-4 text-slate-800 font-medium">{coupon.discount_type}</td>
                  <td className="px-6 py-4 text-slate-500">{coupon.max_supply === null ? 'Unlimited' : coupon.max_supply}</td>
                  <td className="px-6 py-4 text-indigo-600 font-medium">{coupon.used_count}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold ${isExpired ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                       {isExpired ? 'Expired' : new Date(coupon.expiry_date).toLocaleString()}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {coupons.length === 0 && <div className="p-6 text-center text-slate-400 font-medium text-sm">No coupons active.</div>}
      </div>
    </div>
  );
}
