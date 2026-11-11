import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Scale,
  Boxes,
  Wine,
  PackagePlus,
  Truck,
  Receipt,
  BarChart3,
  Settings,
  LogOut,
  X,
  Wifi,
  CloudOff,
  Download,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useOffline } from '../../context/OfflineContext';

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/pos', label: 'Point of Sale', icon: ShoppingCart },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/debt', label: 'Debt Management', icon: Scale },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/products', label: 'Products', icon: Wine },
  { to: '/stock-purchases', label: 'Stock Purchases', icon: PackagePlus },
  { to: '/suppliers', label: 'Suppliers', icon: Truck },
  { to: '/expenses', label: 'Expenses', icon: Receipt },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar({
  mobileOpen,
  onCloseMobile,
}: {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const { user, logout } = useAuth();
  const { isOnline, pendingCount, canInstallPwa, promptInstallPwa } = useOffline();

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`no-print fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-200 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 font-bold">
              Z
            </div>
            <div>
              <span className="font-bold text-white tracking-tight block leading-tight">
                Zamora Liquor
              </span>
              <span className="text-[11px] text-slate-400">POS & Debt Ledger</span>
            </div>
          </div>
          <button
            onClick={onCloseMobile}
            className="lg:hidden rounded-lg p-1 text-slate-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={onCloseMobile}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 p-4 space-y-2.5">
          <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-slate-800/70 text-[11px]">
            <span className="inline-flex items-center gap-1.5 text-slate-200 font-medium">
              {isOnline ? (
                <Wifi className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <CloudOff className="h-3.5 w-3.5 text-amber-400" />
              )}
              {isOnline ? 'Online Ready' : 'Offline Mode'}
            </span>
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                {pendingCount} queued
              </span>
            )}
          </div>
          {canInstallPwa && (
            <button
              type="button"
              onClick={() => void promptInstallPwa()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-600/30 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Install App
            </button>
          )}
          <div className="px-1">
            <p className="text-xs font-semibold text-white truncate">{user?.name || 'Owner'}</p>
            <p className="text-[11px] text-slate-400 truncate">{user?.email}</p>
          </div>
          <button
            onClick={() => logout()}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-rose-400 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}

