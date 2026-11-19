import React, { useState, useEffect } from 'react';
import {
  Settings,
  Scale,
  Server,
  Smartphone,
  CheckCircle,
  Building2,
  Globe,
  RefreshCw,
  AlertTriangle,
  Package,
  ShieldCheck,
  KeyRound,
  Lock,
  User,
  Eye,
  EyeOff,
} from 'lucide-react';
import { api } from '../api/client.js';

export const SettingsPage: React.FC = () => {
  const [baseUnit] = useState('KG');
  const [defaultMannWeight, setDefaultMannWeight] = useState('40.000000');
  const [defaultBagWeight, setDefaultBagWeight] = useState('50.000000');
  const [defaultCommissionPct, setDefaultCommissionPct] = useState('2.000000');
  const [mandiLocation, setMandiLocation] = useState('New Grain Market Wholesale Yard');
  const [businessName, setBusinessName] = useState('SN Inventory ERP');
  const [ownerName, setOwnerName] = useState('Shop Owner');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Security & Credentials State
  const [currentUsername, setCurrentUsername] = useState<string>(localStorage.getItem('erp_user') || 'admin');
  const [newUsername, setNewUsername] = useState<string>('');
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPasswords, setShowPasswords] = useState<boolean>(false);
  const [credSaving, setCredSaving] = useState<boolean>(false);
  const [credSuccessMsg, setCredSuccessMsg] = useState<string | null>(null);
  const [credErrorMsg, setCredErrorMsg] = useState<string | null>(null);

  // Load existing settings from server on mount
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setLoading(true);
        const [settingsData, credData] = await Promise.allSettled([
          api.get<Record<string, string>>('/settings'),
          api.get<{ username: string }>('/auth/credentials'),
        ]);

        if (isMounted) {
          if (settingsData.status === 'fulfilled' && settingsData.value) {
            const data = settingsData.value;
            if (data.business_name) setBusinessName(data.business_name);
            if (data.owner_name) setOwnerName(data.owner_name);
            if (data.mandi_location) setMandiLocation(data.mandi_location);
            if (data.mann_default_kg) setDefaultMannWeight(data.mann_default_kg);
            if (data.bag_default_kg) setDefaultBagWeight(data.bag_default_kg);
            if (data.default_commission_pct) setDefaultCommissionPct(data.default_commission_pct);
          }

          if (credData.status === 'fulfilled' && credData.value?.username) {
            setCurrentUsername(credData.value.username);
            setNewUsername(credData.value.username);
          }
        }
      } catch (err: unknown) {
        console.error('Failed to load settings:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Save General & Mandi Configuration
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);
    setErrorMsg(null);

    try {
      await api.post('/settings', {
        business_name: businessName,
        owner_name: ownerName,
        mandi_location: mandiLocation,
        mann_default_kg: defaultMannWeight,
        bag_default_kg: defaultBagWeight,
        default_commission_pct: defaultCommissionPct,
      });

      setSavedMsg('Settings aur tamam items ke Mann/Bora conversion weights kamyabi se save ho gaye!');
      setTimeout(() => setSavedMsg(null), 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Settings save karne mein masla pesh aya';
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  // Update Security & Credentials
  const handleUpdateCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setCredSuccessMsg(null);
    setCredErrorMsg(null);

    if (!currentPassword) {
      setCredErrorMsg('Tasdeeq ke liye apna mojooda (current) password likhein.');
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      setCredErrorMsg('Naya password aur confirm password aapas mein match nahi kar rahe.');
      return;
    }

    if (newPassword && newPassword.length < 4) {
      setCredErrorMsg('Naya password kam az kam 4 characters ka hona chahiye.');
      return;
    }

    if (!newUsername.trim() && !newPassword) {
      setCredErrorMsg('Naya username ya naya password likhein.');
      return;
    }

    try {
      setCredSaving(true);
      const res = await api.post<{
        message: string;
        data: { username: string; token: string };
      }>('/auth/change-credentials', {
        currentPassword,
        newUsername: newUsername.trim() || undefined,
        newPassword: newPassword || undefined,
      });

      if (res.data?.token) {
        localStorage.setItem('erp_token', res.data.token);
        localStorage.setItem('erp_user', res.data.username);
        setCurrentUsername(res.data.username);
        window.dispatchEvent(new CustomEvent('erp_user_updated', { detail: res.data.username }));
      }

      setCredSuccessMsg(res.message || 'Username aur password kamyabi se tabdeel ho gaye!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setCredSuccessMsg(null), 6000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Credentials change karne mein masla pesh aya';
      setCredErrorMsg(msg);
    } finally {
      setCredSaving(false);
    }
  };

  return (
    <div className="page-wrapper">
      <div>
        <h1 className="page-title"><Settings className="w-5 h-5 text-brand-400" /> Application &amp; Mandi Configuration</h1>
        <p className="page-subtitle">Configure unit standards, commission defaults, login security, and LAN workstation pairing</p>
      </div>

      {savedMsg && (
        <div className="alert-success">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span>{savedMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="alert-error">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-12 text-gray-400 gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-brand-500" />
          <span>Settings load ho rahi hain...</span>
        </div>
      ) : (
        <div className="space-y-6 max-w-4xl">
          {/* Main App & Mandi Config Form */}
          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Business Identity */}
            <div className="card p-5 space-y-4">
              <h3 className="section-title"><Building2 className="w-4 h-4 text-brand-400" /> Business Identity</h3>
              <div>
                <label className="form-label">Business Name</label>
                <input type="text" value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="form-input" required />
              </div>
              <div>
                <label className="form-label">Owner / Administrator Name</label>
                <input type="text" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="form-input" required />
              </div>
              <div>
                <label className="form-label">Mandi Yard Location</label>
                <input type="text" value={mandiLocation} onChange={(e) => setMandiLocation(e.target.value)} className="form-input" required />
              </div>
            </div>

            {/* Unit Standards */}
            <div className="card p-5 space-y-4">
              <h3 className="section-title"><Scale className="w-4 h-4 text-amber-400" /> Unit Standards &amp; Weights</h3>
              <div>
                <label className="form-label">Internal Base Unit (Immutable)</label>
                <input type="text" disabled value={baseUnit} className="form-input opacity-50 cursor-not-allowed font-mono" />
                <p className="text-[10px] text-gray-400 mt-1">Standard base unit across the entire ERP database is Kilogram (KG).</p>
              </div>
              <div>
                <label className="form-label">Standard Mann (Maund) in KG</label>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  required
                  value={defaultMannWeight}
                  onChange={(e) => setDefaultMannWeight(e.target.value)}
                  className="form-input font-mono font-bold text-gray-900"
                />
                <p className="text-[10px] text-gray-500 mt-1">Default Maund weight (jaise 40 ya 50 KG). App mein Mann chunne par 1 Mann = itne KG hisaab hoga.</p>
              </div>
              <div>
                <label className="form-label flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-brand-500" />
                  Standard Bag / Bora in KG
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  required
                  value={defaultBagWeight}
                  onChange={(e) => setDefaultBagWeight(e.target.value)}
                  className="form-input font-mono font-bold text-gray-900"
                />
                <p className="text-[10px] text-gray-500 mt-1">Har item ke Bora/Bag ka standard weight (jaise 20 ya 50 KG). App mein Bora chunne par 1 Bora = itne KG hisaab hoga.</p>
              </div>
              <div>
                <label className="form-label">Default Commission Percentage (%)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={defaultCommissionPct}
                  onChange={(e) => setDefaultCommissionPct(e.target.value)}
                  className="form-input font-mono"
                />
              </div>
            </div>

            {/* Save Business & Units Configuration */}
            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="btn-primary px-8 py-2.5 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving Settings...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Save Mandi &amp; Unit Configuration</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Security & Credentials Card */}
          <div className="card p-5 space-y-4 border-t-2 border-t-brand-500">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="section-title flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-brand-500" />
                  Admin Credentials (Username &amp; Password)
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  App mein login karne ke liye apna username aur password yahan se tabdeel karein.
                </p>
              </div>
              <span className="badge-green flex items-center gap-1.5 text-xs">
                <User className="w-3.5 h-3.5" />
                Active User: <strong className="font-mono">{currentUsername}</strong>
              </span>
            </div>

            {credSuccessMsg && (
              <div className="alert-success">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>{credSuccessMsg}</span>
              </div>
            )}

            {credErrorMsg && (
              <div className="alert-error">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{credErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleUpdateCredentials} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Username */}
                <div>
                  <label className="form-label flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    Username
                  </label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="form-input font-medium"
                    placeholder="admin"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Kam az kam 3 characters ka username.</p>
                </div>

                {/* Current Password */}
                <div>
                  <label className="form-label flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                    Mojooda (Current) Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="form-input pr-10"
                      placeholder="Purana password likhein"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords(!showPasswords)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Tasdeeq ke liye mojooda password likhna zaroori hai.</p>
                </div>

                {/* New Password */}
                <div>
                  <label className="form-label flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-brand-500" />
                    Naya Password (Optional)
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="form-input pr-10"
                      placeholder="Naya password likhein"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords(!showPasswords)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Agar password change nahi karna to khali chhor dein.</p>
                </div>

                {/* Confirm New Password */}
                <div>
                  <label className="form-label flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-brand-500" />
                    Confirm Naya Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPasswords ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="form-input pr-10"
                      placeholder="Dobara naya password likhein"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords(!showPasswords)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Naye password ki dobara tasdeeq.</p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={credSaving}
                  className="btn-primary px-8 py-2.5 flex items-center gap-2"
                >
                  {credSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Updating Credentials...</span>
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      <span>Update Username &amp; Password</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Network Setup */}
          <div className="card p-5 space-y-4">
            <h3 className="section-title"><Server className="w-4 h-4 text-sky-400" /> LAN Workstation &amp; Network Setup</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <Smartphone className="w-4 h-4 text-brand-400" />
                  Shop LAN Workstation Pairing
                </div>
                <p className="text-[11px] text-gray-500">LAN client terminals connect to this main PC via local IP address.</p>
                <div className="text-[11px] font-mono text-brand-400 bg-gray-100 px-3 py-2 rounded-lg border border-gray-200">
                  Local API: http://localhost:4000/api/v1
                </div>
              </div>
              <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <Globe className="w-4 h-4 text-sky-400" />
                  Server Status
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
                  <span className="text-xs text-gray-500">Local server running on port 4000</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-sky-400" />
                  <span className="text-xs text-gray-500">Database connected (PostgreSQL)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
