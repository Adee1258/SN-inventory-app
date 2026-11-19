import React from 'react';
import { Server, Wifi, WifiOff, LogOut } from 'lucide-react';

interface HeaderProps {
  title: string;
  isDbConnected: boolean;
  cloudSyncEnabled: boolean;
  username?: string;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  isDbConnected,
  cloudSyncEnabled,
  username = 'Admin',
  onLogout,
}) => {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 select-none flex-shrink-0 shadow-sm">
      {/* ── Left: Page Title ── */}
      <div className="flex items-center gap-3">
        <div className="h-5 w-0.5 bg-brand-500 rounded-full" />
        <div>
          <h2 className="text-sm font-bold text-gray-900 leading-tight">{title}</h2>
          <span className="text-[10px] text-gray-400 leading-none">
            SN Inventory &amp; ERP &nbsp;•&nbsp; v1.1.0
          </span>
        </div>
      </div>

      {/* ── Right: Status & Actions ── */}
      <div className="flex items-center gap-3">

        {/* DB Status */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-colors ${isDbConnected
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-600'
            }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isDbConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <Server className="w-3 h-3" />
          <span>{isDbConnected ? 'DB Online' : 'DB Offline'}</span>
        </div>

        {/* Cloud / LAN Status */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border bg-gray-50 border-gray-200 text-gray-500">
          {cloudSyncEnabled
            ? <Wifi className="w-3 h-3 text-sky-500" />
            : <WifiOff className="w-3 h-3 text-gray-400" />}
          <span>{cloudSyncEnabled ? 'Cloud Sync' : 'Local Mode'}</span>
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-200" />

        {/* Owner Badge */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow">
              <span className="text-[10px] font-bold text-white">
                {username.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-xs font-semibold text-gray-800">{username}</span>
              <span className="text-[9px] text-brand-600 font-bold uppercase tracking-wide mt-0.5">Owner</span>
            </div>
          </div>

          <button
            onClick={onLogout}
            title="Lock / Logout"
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
