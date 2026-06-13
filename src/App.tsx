import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Ticket as TicketIcon,
  Tag,
  Activity,
  CreditCard,
  Bell,
  LogOut,
  Globe,
  GraduationCap,
  Store,
  UtensilsCrossed,
  Package,
  Menu,
  X
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { auth, loginWithGoogle, logoutFirebase } from './firebase';

export function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

export const AuthContext = React.createContext<{email: string | null; permissions: any; title: string; login: ()=>void; logout: ()=>void}>({
  email: null, permissions: {}, title: '', login: ()=>{}, logout: ()=>{}
});

import Admins from './pages/Admins';
import Logs from './pages/Logs';
import Coupons from './pages/Coupons';
import Gists from './pages/Gists';
import Tickets from './pages/Tickets';
import Transactions from './pages/Transactions';
import Notifications from './pages/Notifications';
import Dashboard from './pages/Dashboard';
import Countries from './pages/Countries';
import Schools from './pages/Schools';
import Vendors from './pages/Vendors';
import VendorMenu from './pages/VendorMenu';
import Meals from './pages/Meals';
import Combos from './pages/Combos';
import Metadata from './pages/Metadata';

function Sidebar({ isOpen, setIsOpen }: { isOpen: boolean, setIsOpen: (val: boolean) => void }) {
  const location = useLocation();
  const { logout, email, permissions } = React.useContext(AuthContext);
  
  const allLinks = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, id: 'dashboard' },
    { to: '/countries', label: 'Countries', icon: Globe, id: 'countries' },
    { to: '/schools', label: 'Schools', icon: GraduationCap, id: 'schools' },
    { to: '/vendors', label: 'Vendors', icon: Store, id: 'vendors' },
    { to: '/meals', label: 'Meals (Master)', icon: UtensilsCrossed, id: 'meals' },
    { to: '/combos', label: 'Vendor Combos', icon: Package, id: 'combos' },
    { to: '/admins', label: 'Account Permissions', icon: Users, id: 'admins' },
    { to: '/logs', label: 'Unified Logs', icon: Activity, id: 'logs' },
    { to: '/transactions', label: 'Transactions', icon: CreditCard, id: 'transactions' },
    { to: '/coupons', label: 'Coupon Generator', icon: Tag, id: 'coupons' },
    { to: '/gists', label: 'Gist Moderation', icon: FileText, id: 'gists' },
    { to: '/tickets', label: 'Ticket Management', icon: TicketIcon, id: 'tickets' },
    { to: '/notifications', label: 'Notifications', icon: Bell, id: 'notifications' },
    { to: '/metadata', label: 'System Metadata', icon: Package, id: 'metadata' },
  ];

  const allowedPages = permissions?.pages || [];
  const isSuperAdmin = permissions?.all || email === 'allowancemobileapp@gmail.com' || email === 'allowancemobielapp@gmail.com';
  
  const links = allLinks.filter(l => isSuperAdmin || allowedPages.includes(l.id));

  return (
    <>
      <div 
        className={cn("fixed inset-0 bg-black/50 z-20 md:hidden transition-opacity", isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")} 
        onClick={() => setIsOpen(false)} 
      />
      <aside className={cn(
        "fixed md:relative top-0 bottom-0 left-0 w-64 bg-slate-900 flex flex-col border-r border-slate-800 z-30 transition-transform duration-300 md:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold text-white">A</div>
            <span className="font-bold text-slate-100 tracking-tight text-xl">PRO</span>
          </div>
          <button className="md:hidden text-slate-400" onClick={() => setIsOpen(false)}>
             <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {links.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setIsOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md font-medium transition-colors text-sm",
                  isActive 
                    ? "bg-indigo-600/10 text-indigo-400" 
                    : "text-slate-400 hover:bg-slate-800"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 shrink-0">
          <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase font-bold text-slate-500">Authenticated Admin</p>
               <button onClick={logout} className="text-[10px] text-red-400 hover:underline">Log Out</button>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-emerald-500 border-2 border-emerald-900/50 flex items-center justify-center text-white text-xs font-bold leading-none">{email?.charAt(0).toUpperCase() || 'A'}</div>
            <p className="text-xs text-slate-300 truncate">{email}</p>
          </div>
        </div>
      </aside>
    </>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const { title } = React.useContext(AuthContext);

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden text-sm">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 px-4 md:px-8 flex items-center justify-between shadow-sm z-10 shrink-0">
          <div className="flex items-center gap-4 md:gap-8">
            <button className="md:hidden text-slate-600" onClick={() => setIsSidebarOpen(true)}>
               <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold text-slate-800 hidden md:block">{title ? `${title} Control Panel` : 'Control Panel'}</h1>
          </div>
          <div className="flex gap-4 items-center text-xs font-medium">
            <span className="bg-slate-100 px-2 py-1 rounded text-slate-600 hidden sm:block">Uptime: 99.9%</span>
            <span className="bg-emerald-100 px-2 py-1 rounded text-emerald-700">Auto-Accounting: ACTIVE</span>
          </div>
        </header>
        <div className="flex-1 p-4 md:p-6 overflow-y-auto">
          <div className="max-w-[1200px] mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

function Login() {
  const { login } = React.useContext(AuthContext);

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 font-sans text-slate-900">
      <div className="w-full max-w-sm p-8 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center">
        <div className="flex items-center gap-3 mb-6 justify-center">
            <div className="h-8 w-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold text-white">A</div>
            <span className="font-bold text-slate-900 tracking-tight text-xl">ALLOWANCE <span className="text-indigo-600">PRO</span></span>
        </div>
        <p className="text-sm text-slate-500 mb-6 text-center">Sign in to access the administrator panel. Only authorized personnel.</p>
        <button onClick={login} className="w-full py-3 bg-slate-900 text-white rounded-lg font-bold text-xs hover:bg-slate-800 transition-colors flex items-center justify-center gap-2">
            <Globe className="w-4 h-4" />
            SIGN IN WITH GOOGLE
        </button>
      </div>
    </div>
  );
}

function AppRouter() {
  const [email, setEmail] = React.useState<string | null>(null);
  const [permissions, setPermissions] = React.useState<any>({});
  const [title, setTitle] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);

  const verifyUser = async (userEmail: string) => {
    console.log("================================");
    console.log("VERIFYING USER:", userEmail);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      console.log("Calling /api/auth/verify...");

      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail }),
        signal: controller.signal,
      });

      console.log("Response Status:", res.status);

      if (!res.ok) {
        localStorage.removeItem('admin_email');
        setEmail(null);
        setPermissions({});
       await logoutFirebase();
        const errText = await res.text();
       alert(`Server Error: ${res.status} - ${errText}`);
       return;
      }

      const data = await res.json();
      if (data.verified) {
        localStorage.setItem('admin_email', userEmail);
        setEmail(userEmail);
        setPermissions(data.permissions || {});
        setTitle(data.title || '');
      } else {
       throw new Error('Cannot verify email');
      }
    } catch (e: any) {
      console.error(e);
      localStorage.removeItem('admin_email');
      setEmail(null);
      setPermissions({});
      setTitle('');
      await logoutFirebase();
      alert(`Login Error: ${e.message}`);
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      try {
        if (user?.email) {
         await verifyUser(user.email);
        } else {
         localStorage.removeItem('admin_email');
         setEmail(null);
         setPermissions({});
         setTitle('');
        }
      } finally {
        setLoading(false);
      }
    });

    return unsub;
  }, []);

  const login = async () => {
    try {
      await loginWithGoogle();
    } catch (e: any) {
      alert("Login failed: " + e.message);
    }
  };

  const logout = async () => {
    await logoutFirebase();
  };

  if (loading) {
     return <div className="h-screen w-full flex items-center justify-center bg-slate-50"><p className="text-slate-500">Authenticating...</p></div>;
  }

  if (!email) {
    return <AuthContext.Provider value={{ email, permissions, title, login, logout }}><Login /></AuthContext.Provider>;
  }

  return (
    <AuthContext.Provider value={{ email, permissions, title, login, logout }}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/countries" element={<Countries />} />
            <Route path="/schools" element={<Schools />} />
            <Route path="/vendors" element={<Vendors />} />
            <Route path="/vendors/:vendorId/menu" element={<VendorMenu />} />
            <Route path="/meals" element={<Meals />} />
            <Route path="/combos" element={<Combos />} />
            <Route path="/admins" element={<Admins />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/coupons" element={<Coupons />} />
            <Route path="/gists" element={<Gists />} />
            <Route path="/tickets" element={<Tickets />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/metadata" element={<Metadata />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}

export default AppRouter;
