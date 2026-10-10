import React, { useState, useEffect } from 'react';
import {
  Bot,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Shield,
  Key,
  UserCheck,
  UserX,
  Send,
  ExternalLink,
  Lock,
  FileCode,
  Terminal,
  Activity,
  Copy,
  Check,
  Plus,
  Trash2,
  Info,
} from 'lucide-react';

export interface TelegramState {
  token: string;
  running: boolean;
  botInfo: {
    id: number;
    username: string;
    firstName: string;
  } | null;
  publicMode: boolean;
  allowedIds: number[];
  maxProjectsPerUser: number;
  lastError: string | null;
  lastPollTime: number | null;
  totalMessagesProcessed: number;
  recentActivity: Array<{
    id: string;
    timestamp: number;
    userId: number;
    username?: string;
    type: 'message' | 'command' | 'document' | 'unauthorized';
    text?: string;
    details: string;
    status: 'ok' | 'rejected' | 'error';
  }>;
  unauthorizedAttempts: Array<{
    userId: number;
    username?: string;
    firstName?: string;
    timestamp: number;
  }>;
}

export function TelegramBotPanel() {
  const [state, setState] = useState<TelegramState | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [tokenInput, setTokenInput] = useState<string>('');
  const [newUserIdInput, setNewUserIdInput] = useState<string>('');
  const [isRestarting, setIsRestarting] = useState<boolean>(false);
  const [simText, setSimText] = useState<string>('/start');
  const [simUserId, setSimUserId] = useState<string>('987654321');
  const [simMode, setSimMode] = useState<'text' | 'file'>('text');
  const [simFileName, setSimFileName] = useState<string>('my_algorithm.py');
  const [simFileCode, setSimFileCode] = useState<string>(`def compute_bonus(salary, rate=0.15):
    """Protected algorithm calculation."""
    bonus = salary * rate
    return {"salary": salary, "rate": rate, "bonus": bonus, "total": salary + bonus}
`);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [publicApiUrl, setPublicApiUrl] = useState<string>('');
  const [isUpdatingUrl, setIsUpdatingUrl] = useState<boolean>(false);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/telegram/status');
      if (res.ok) {
        const data = await res.json();
        setState(data);
        if (!tokenInput && data.token) {
          setTokenInput(data.token);
        }
      }
      const urlRes = await fetch('/api/public-url');
      if (urlRes.ok) {
        const urlData = await urlRes.json();
        if (urlData.url && !publicApiUrl) {
          setPublicApiUrl(urlData.url);
        }
      }
    } catch (e) {
      console.error('Failed to load telegram status:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleUpdatePublicUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicApiUrl.trim()) return;
    setIsUpdatingUrl(true);
    try {
      const res = await fetch('/api/public-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: publicApiUrl.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setPublicApiUrl(data.url);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsUpdatingUrl(false);
    }
  };

  const handleUpdateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    setIsRestarting(true);
    try {
      const res = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setState(data.state);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRestarting(false);
    }
  };

  const handleTogglePublicMode = async () => {
    if (!state) return;
    try {
      const res = await fetch('/api/telegram/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicMode: !state.publicMode }),
      });
      if (res.ok) {
        const data = await res.json();
        setState(data.state);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddAllowedId = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseInt(newUserIdInput.trim(), 10);
    if (isNaN(id) || id <= 0) return;
    try {
      const res = await fetch('/api/telegram/authorize-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id }),
      });
      if (res.ok) {
        const data = await res.json();
        setState(data.state);
        setNewUserIdInput('');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAuthorizeUser = async (userId: number) => {
    try {
      const res = await fetch('/api/telegram/authorize-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        const data = await res.json();
        setState(data.state);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveAllowedId = async (userId: number) => {
    try {
      const res = await fetch('/api/telegram/remove-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        const data = await res.json();
        setState(data.state);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRestartBot = async () => {
    setIsRestarting(true);
    try {
      const res = await fetch('/api/telegram/restart', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setState(data.state);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRestarting(false);
    }
  };

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simText.trim()) return;
    setIsSimulating(true);
    try {
      const uid = parseInt(simUserId.trim(), 10) || 987654321;
      const res = await fetch('/api/telegram/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: uid,
          username: 'developer_sim',
          text: simText.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setState(data.state);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleSimulateFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simFileCode.trim()) return;
    setIsSimulating(true);
    try {
      const uid = parseInt(simUserId.trim(), 10) || 987654321;
      const res = await fetch('/api/telegram/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: uid,
          username: 'developer_sim',
          document: {
            fileName: simFileName.endsWith('.py') ? simFileName : `${simFileName}.py`,
            code: simFileCode,
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setState(data.state);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSimulating(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Bot Connection Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div className="flex items-start sm:items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg ${
              state?.running && state.botInfo
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-emerald-500/10'
                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-rose-500/10'
            }`}>
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base font-bold text-white">
                  {state?.botInfo ? state.botInfo.firstName : 'Telegram Bot Service'}
                </h2>
                {state?.running && state.botInfo ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Online & Polling
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950 text-rose-400 border border-rose-800 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {state?.lastError ? 'Offline / Error' : 'Connecting...'}
                  </span>
                )}
              </div>
              {state?.botInfo ? (
                <div className="flex items-center gap-2 mt-1">
                  <a
                    href={`https://t.me/${state.botInfo.username}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1 hover:underline"
                  >
                    @{state.botInfo.username}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <span className="text-xs text-slate-500">• ID: {state.botInfo.id}</span>
                </div>
              ) : (
                <p className="text-xs text-slate-400 mt-1">
                  Bot polling is not connected. Check token below.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRestartBot}
              disabled={isRestarting}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-2 border border-slate-700 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRestarting ? 'animate-spin' : ''}`} />
              Restart Polling Loop
            </button>
            {state?.botInfo && (
              <a
                href={`https://t.me/${state.botInfo.username}`}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors"
              >
                <Bot className="w-4 h-4" />
                Open Bot in Telegram
              </a>
            )}
          </div>
        </div>

        {/* Error notification if any */}
        {state?.lastError && (
          <div className="mt-4 p-3 rounded-lg bg-rose-950/40 border border-rose-900/60 flex items-start gap-3 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-200">Telegram Bot API Notice:</p>
              <p className="font-mono mt-0.5">{state.lastError}</p>
            </div>
          </div>
        )}

        {/* Instructions in Arabic */}
        <div className="mt-5 p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-xs space-y-2">
          <div className="font-semibold text-slate-200 flex items-center gap-2">
            <Info className="w-4 h-4 text-cyan-400" />
            <span>كيفية استخدام البوت عبر تيليجرام (How to Use):</span>
          </div>
          <ol className="text-slate-300 space-y-1.5 list-decimal list-inside pr-1">
            <li>
              افتح المحادثة مع البوت في تطبيق تيليجرام:{' '}
              {state?.botInfo ? (
                <a
                  href={`https://t.me/${state.botInfo.username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 font-bold hover:underline"
                >
                  @{state.botInfo.username}
                </a>
              ) : (
                <span className="text-cyan-400">@بوتك</span>
              )}
            </li>
            <li>أرسل الأمر <code>/start</code> لاستعراض التعليمات والأوامر.</li>
            <li>
              أرسل أي ملف كود بايثون ينتهي بـ <code>.py</code> (مثلاً <code>my_code.py</code>).
            </li>
            <li>
              سيقوم البوت فوراً بتشفير الكود وحفظه على السيرفر، وسيرسل لك <b>مفتاح API</b> و<b>ملف عميل جاهز (client.py)</b>.
            </li>
          </ol>
        </div>
      </div>

      {/* Grid: Access Control & Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Security & Access Control */}
        <div className="lg:col-span-6 space-y-6">
          {/* Access Mode Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">إعدادات الصلاحيات (Access Control)</h3>
              </div>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                state?.publicMode
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                  : 'bg-amber-950 text-amber-400 border-amber-800'
              }`}>
                {state?.publicMode ? 'Public Mode (الوضع العام مفعّل)' : 'Restricted (مقيّد بالمعرّفات)'}
              </span>
            </div>

            <div className="flex items-start justify-between gap-4 p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div>
                <p className="text-xs font-semibold text-slate-200">الوضع العام (TELEGRAM_PUBLIC_MODE)</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  عند تفعيل الوضع العام، يمكن لأي مستخدم تيليجرام إرسال أكواد واستلام مفاتيح. عند إيقافه، يُسمح فقط للمعرّفات الموجودة في القائمة أدناه.
                </p>
              </div>
              <button
                onClick={handleTogglePublicMode}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
                  state?.publicMode
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {state?.publicMode ? 'مفعّل (ON)' : 'معطّل (OFF)'}
              </button>
            </div>

            {/* Unauthorized Attempts with 1-Click Authorize */}
            {state?.unauthorizedAttempts && state.unauthorizedAttempts.length > 0 && (
              <div className="p-3.5 rounded-lg bg-amber-950/30 border border-amber-900/60 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                  <UserX className="w-4 h-4" />
                  <span>محاولات وصول غير مصرح بها (Unauthorized Access Attempts):</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  هؤلاء المستخدمون تواصلوا مع البوت وتم حجبهم. يمكنك إعطاؤهم صلاحية بضغطة واحدة:
                </p>
                <div className="divide-y divide-amber-950/80">
                  {state.unauthorizedAttempts.map((u) => (
                    <div key={u.userId} className="py-2 flex items-center justify-between gap-2">
                      <div className="text-xs">
                        <span className="font-mono text-cyan-300">ID: {u.userId}</span>
                        {u.username && <span className="text-slate-400 ml-2">(@{u.username})</span>}
                        {u.firstName && <span className="text-slate-500 ml-1">[{u.firstName}]</span>}
                      </div>
                      <button
                        onClick={() => handleAuthorizeUser(u.userId)}
                        className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium flex items-center gap-1"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        Authorize (سماح)
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Allowed User IDs Management */}
            <div>
              <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                المعرّفات المصرّح لها (Allowed Telegram User IDs):
              </label>

              <form onSubmit={handleAddAllowedId} className="flex gap-2 mb-3">
                <input
                  type="number"
                  value={newUserIdInput}
                  onChange={(e) => setNewUserIdInput(e.target.value)}
                  placeholder="e.g. 123456789"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  إضافة معرّف
                </button>
              </form>

              {state?.allowedIds && state.allowedIds.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {state.allowedIds.map((id) => (
                    <div
                      key={id}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-cyan-300"
                    >
                      <span>{id}</span>
                      <button
                        onClick={() => handleRemoveAllowedId(id)}
                        className="text-slate-500 hover:text-rose-400"
                        title="Remove ID"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">
                  لا توجد معرّفات مقيدة حالياً (إذا كان الوضع العام مفعلاً، يستطيع الجميع الاستخدام).
                </p>
              )}
            </div>
          </div>

          {/* Public API URL Configuration */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-cyan-400" />
                رابط السيرفر العام (Public API URL)
              </h3>
              <button
                type="button"
                onClick={() => copyToClipboard(publicApiUrl, 'botapiurl')}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                {copied === 'botapiurl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                نسخ الرابط
              </button>
            </div>
            <form onSubmit={handleUpdatePublicUrl} className="space-y-3">
              <div>
                <input
                  type="text"
                  value={publicApiUrl}
                  onChange={(e) => setPublicApiUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500">
                  هذا الرابط يُحقن تلقائياً في جميع ملفات بايثون المشفرة للاتصال بالسيرفر من الهواتف (Pydroid 3).
                </span>
                <button
                  type="submit"
                  disabled={isUpdatingUrl}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 disabled:opacity-50 shrink-0"
                >
                  حفظ الرابط
                </button>
              </div>
            </form>
          </div>

          {/* Token Configuration */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2 pb-3 border-b border-slate-800">
              <Key className="w-4 h-4 text-cyan-400" />
              مفتاح بوت تيليجرام (TELEGRAM_BOT_TOKEN)
            </h3>
            <form onSubmit={handleUpdateToken} className="space-y-3">
              <div>
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  يمكنك الحصول على المفتاح من <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">@BotFather</a>
                </span>
                <button
                  type="submit"
                  disabled={isRestarting}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 disabled:opacity-50"
                >
                  حفظ وتحديث الاتصال
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Simulator & Live Activity */}
        <div className="lg:col-span-6 space-y-6">
          {/* Simulator Box */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">محاكي البوت السريع (Bot Simulator)</h3>
              </div>
              <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setSimMode('text')}
                  className={`px-2.5 py-1 text-[11px] rounded font-medium transition-colors ${
                    simMode === 'text'
                      ? 'bg-cyan-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  أوامر نصية
                </button>
                <button
                  type="button"
                  onClick={() => setSimMode('file')}
                  className={`px-2.5 py-1 text-[11px] rounded font-medium transition-colors ${
                    simMode === 'file'
                      ? 'bg-cyan-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  رفع ملف .py
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="text-[11px] text-slate-400 block mb-1">User ID</label>
                <input
                  type="text"
                  value={simUserId}
                  onChange={(e) => setSimUserId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="col-span-2 flex items-end">
                <span className="text-[11px] text-slate-500 pb-1.5">
                  {simMode === 'text' ? 'إرسال أوامر نصية مباشرة للبوت' : 'محاكاة رفع ملف بايثون وتشفيره بالكامل'}
                </span>
              </div>
            </div>

            {simMode === 'text' ? (
              <form onSubmit={handleSimulate} className="space-y-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">الأمر أو النص (Command / Text)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={simText}
                      onChange={(e) => setSimText(e.target.value)}
                      placeholder="/start أو /projects"
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      type="submit"
                      disabled={isSimulating}
                      className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium flex items-center gap-1 disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      إرسال
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {['/start', '/projects', '/keys', '/newkey demo_project 24'].map((cmd) => (
                    <button
                      key={cmd}
                      type="button"
                      onClick={() => setSimText(cmd)}
                      className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                    >
                      {cmd}
                    </button>
                  ))}
                </div>
              </form>
            ) : (
              <form onSubmit={handleSimulateFileUpload} className="space-y-3">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">اسم الملف (File Name)</label>
                  <input
                    type="text"
                    value={simFileName}
                    onChange={(e) => setSimFileName(e.target.value)}
                    placeholder="algorithm.py"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">كود بايثون الأصلي للتشفير</label>
                  <textarea
                    rows={4}
                    value={simFileCode}
                    onChange={(e) => setSimFileCode(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSimulating}
                  className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <FileCode className="w-4 h-4" />
                  {isSimulating ? 'جارٍ التشفير والمعالجة...' : 'محاكاة رفع الملف وتشفيره (Test Upload .py)'}
                </button>
              </form>
            )}
          </div>

          {/* Activity Log */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">سجل نشاط البوت المباشر (Bot Activity)</h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {state?.totalMessagesProcessed ?? 0} رسائل
              </span>
            </div>

            <div className="divide-y divide-slate-800 max-h-[380px] overflow-y-auto">
              {!state?.recentActivity || state.recentActivity.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  لا توجد رسائل مسجلة بعد. أرسل رسالة للبوت في تيليجرام أو استخدم المحاكي أعلاه!
                </div>
              ) : (
                state.recentActivity.map((act) => (
                  <div key={act.id} className="p-3.5 hover:bg-slate-800/20 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                          act.status === 'ok'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : act.status === 'rejected'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}>
                          {act.type}
                        </span>
                        <span className="font-mono text-cyan-300">{act.username || `User ${act.userId}`}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {new Date(act.timestamp * 1000).toLocaleTimeString()}
                      </span>
                    </div>

                    {act.text && (
                      <p className="text-slate-300 font-mono text-[11px] bg-slate-950/60 p-1.5 rounded border border-slate-800">
                        {act.text}
                      </p>
                    )}
                    <p className="text-slate-400 text-[11px]">{act.details}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
