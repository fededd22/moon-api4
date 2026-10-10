import React, { useState, useEffect } from 'react';
import {
  Moon,
  Shield,
  Key,
  Terminal,
  Code2,
  Play,
  RefreshCw,
  Plus,
  Trash2,
  Copy,
  Check,
  Download,
  Activity,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Lock,
  Server,
  Cpu,
  BookOpen,
  Bot,
} from 'lucide-react';
import { TelegramBotPanel } from './TelegramBotPanel';

interface SystemStatus {
  service: string;
  status: string;
  version: string;
  watermark: string;
  total_projects: number;
  active_keys: number;
  rate_limit_per_hour: number;
  max_execution_time_sec: number;
}

interface Project {
  id: string;
  owner_id: number;
  name: string;
  size: number;
  created_at: number;
}

interface ApiKeyItem {
  key_id: string;
  project_id: string;
  created_at: number;
  expires_at: number;
  total_requests: number;
  active: boolean;
  notes: string;
}

interface RequestLog {
  id: string;
  key_id: string;
  project_id: string;
  endpoint: string;
  ts: number;
  ip: string;
  ok: boolean;
  error: string;
  elapsed_ms?: number;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'runner' | 'projects' | 'keys' | 'client' | 'bot' | 'logs' | 'docs'>('runner');
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [adminKey, setAdminKey] = useState<string>('moon_admin_master_key_9999');
  const [copied, setCopied] = useState<string | null>(null);

  // Runner state
  const [apiKeyInput, setApiKeyInput] = useState<string>('moon_demo_secret_key_12345');
  const [runMode, setRunMode] = useState<'call' | 'script'>('call');
  const [selectedFunction, setSelectedFunction] = useState<string>('fib');
  const [functionArgs, setFunctionArgs] = useState<string>('[10]');
  const [scriptStdin, setScriptStdin] = useState<string>('Developer');
  const [availableFunctions, setAvailableFunctions] = useState<string[]>(['fib', 'secret_formula']);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [runResponse, setRunResponse] = useState<any>(null);
  const [projectInfo, setProjectInfo] = useState<any>(null);

  // Projects state
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [newProjectName, setNewProjectName] = useState<string>('my_algorithm.py');
  const [newProjectCode, setNewProjectCode] = useState<string>(`def compute_score(values, multiplier=1.5):
    """Protected proprietary calculation."""
    total = sum(values) * multiplier
    return {"total": total, "count": len(values), "verdict": "approved" if total > 50 else "pending"}
`);
  const [isCreatingProject, setIsCreatingProject] = useState<boolean>(false);

  // API Keys state
  const [keysList, setKeysList] = useState<ApiKeyItem[]>([]);
  const [newKeyProjectId, setNewKeyProjectId] = useState<string>('demo_project');
  const [newKeyDurationHours, setNewKeyDurationHours] = useState<number>(24);
  const [newKeyNotes, setNewKeyNotes] = useState<string>('Developer test token');
  const [generatedKeyResult, setGeneratedKeyResult] = useState<{ api_key: string; key_id: string } | null>(null);

  // Logs state
  const [logsList, setLogsList] = useState<RequestLog[]>([]);

  // Client Stub state
  const [stubProjectId, setStubProjectId] = useState<string>('demo_project');
  const [stubApiKey, setStubApiKey] = useState<string>('moon_demo_secret_key_12345');
  const [publicUrlInput, setPublicUrlInput] = useState<string>('https://ais-pre-rrmlgbo7vp4atnn3s7i5hj-319478204212.europe-west2.run.app');
  const [clientStubCode, setClientStubCode] = useState<string>('');

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const loadStatus = async () => {
    try {
      const res = await fetch('/api/system-status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadDevConfig = async () => {
    try {
      const res = await fetch('/api/dev-config');
      if (res.ok) {
        const cfg = await res.json();
        if (cfg.adminApiKey) setAdminKey(cfg.adminApiKey);
        if (cfg.demoApiKey && !apiKeyInput) setApiKeyInput(cfg.demoApiKey);
        if (cfg.demoProjectId && !stubProjectId) setStubProjectId(cfg.demoProjectId);
        if (cfg.publicApiUrl) setPublicUrlInput(cfg.publicApiUrl);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadProjects = async () => {
    try {
      const res = await fetch('/admin/projects', {
        headers: { 'X-Admin-Key': adminKey },
      });
      if (res.ok) {
        const data = await res.json();
        setProjectsList(data.projects || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadKeys = async () => {
    try {
      const res = await fetch('/admin/keys', {
        headers: { 'X-Admin-Key': adminKey },
      });
      if (res.ok) {
        const data = await res.json();
        setKeysList(data.keys || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadLogs = async () => {
    try {
      const res = await fetch('/admin/logs', {
        headers: { 'X-Admin-Key': adminKey },
      });
      if (res.ok) {
        const data = await res.json();
        setLogsList(data.logs || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchFunctions = async () => {
    if (!apiKeyInput.trim()) return;
    try {
      const res = await fetch('/api/functions', {
        headers: { 'X-API-Key': apiKeyInput.trim() },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.functions)) {
          setAvailableFunctions(data.functions);
          if (data.functions.length > 0 && !data.functions.includes(selectedFunction)) {
            setSelectedFunction(data.functions[0]);
          }
        }
      }
      const infoRes = await fetch('/api/info', {
        headers: { 'X-API-Key': apiKeyInput.trim() },
      });
      if (infoRes.ok) {
        const infoData = await infoRes.json();
        setProjectInfo(infoData);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleExecute = async () => {
    if (!apiKeyInput.trim()) return;
    setIsRunning(true);
    setRunResponse(null);
    try {
      let argsPayload: any[] = [];
      try {
        if (functionArgs.trim()) {
          argsPayload = JSON.parse(functionArgs);
          if (!Array.isArray(argsPayload)) argsPayload = [argsPayload];
        }
      } catch {
        argsPayload = [functionArgs];
      }

      const bodyPayload = runMode === 'call'
        ? { function: selectedFunction, args: argsPayload, kwargs: {} }
        : { stdin: scriptStdin };

      const res = await fetch('/api/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKeyInput.trim(),
        },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();
      setRunResponse(data);
      loadStatus();
      loadLogs();
    } catch (err: any) {
      setRunResponse({
        success: false,
        error: err.message || 'Execution request failed',
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName || !newProjectCode) return;
    setIsCreatingProject(true);
    try {
      const res = await fetch('/admin/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': adminKey,
        },
        body: JSON.stringify({
          name: newProjectName,
          code: newProjectCode,
          owner_id: 1,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        await loadProjects();
        await loadStatus();
        setNewKeyProjectId(data.project_id);
        setStubProjectId(data.project_id);
        setNewProjectName('new_module_' + Math.floor(Math.random() * 1000) + '.py');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm(`Delete project ${id}? Associated keys will also be deactivated.`)) return;
    try {
      const res = await fetch(`/admin/projects/${id}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Key': adminKey },
      });
      if (res.ok) {
        loadProjects();
        loadKeys();
        loadStatus();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/admin/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': adminKey,
        },
        body: JSON.stringify({
          project_id: newKeyProjectId,
          duration: newKeyDurationHours * 3600,
          notes: newKeyNotes,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedKeyResult(data);
        setApiKeyInput(data.api_key);
        setStubApiKey(data.api_key);
        loadKeys();
        loadStatus();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    try {
      const res = await fetch(`/admin/keys/${keyId}`, {
        method: 'DELETE',
        headers: { 'X-Admin-Key': adminKey },
      });
      if (res.ok) {
        loadKeys();
        loadStatus();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchClientStub = async () => {
    if (!stubProjectId) return;
    try {
      const urlQuery = publicUrlInput ? `&public_url=${encodeURIComponent(publicUrlInput)}` : '';
      const res = await fetch(`/api/client-stub?project_id=${encodeURIComponent(stubProjectId)}&api_key=${encodeURIComponent(stubApiKey)}${urlQuery}`);
      if (res.ok) {
        const data = await res.json();
        setClientStubCode(data.client_code);
        if (data.public_url && !publicUrlInput) {
          setPublicUrlInput(data.public_url);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadStatus();
    loadDevConfig();
    loadProjects();
    loadKeys();
    loadLogs();
  }, []);

  useEffect(() => {
    if (activeTab === 'client') {
      fetchClientStub();
    }
  }, [activeTab, stubProjectId, stubApiKey, publicUrlInput]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-30 px-4 lg:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-bold">
            <Moon className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Moon API
                <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
                  v2.0.0
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-400">
              Server-Side Protected Code Execution & Sandbox Engine
            </p>
          </div>
        </div>

        {/* Global Stats */}
        <div className="hidden md:flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">Security:</span>
            <span className="text-emerald-300 font-medium">Fernet / AES-256</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400">Projects:</span>
            <span className="text-white font-semibold">{status?.total_projects ?? projectsList.length}</span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400">Keys:</span>
            <span className="text-white font-semibold">{status?.active_keys ?? keysList.filter(k => k.active).length}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="text-emerald-400 font-medium">Online</span>
          </div>
        </div>
      </header>

      {/* Navigation Bar */}
      <nav className="border-b border-slate-800 bg-slate-900/40 px-4 lg:px-8 flex items-center justify-between overflow-x-auto">
        <div className="flex items-center gap-1 py-1.5">
          <button
            onClick={() => { setActiveTab('runner'); fetchFunctions(); }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'runner'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Terminal className="w-4 h-4" />
            Interactive Sandbox
          </button>
          <button
            onClick={() => { setActiveTab('projects'); loadProjects(); }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'projects'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Code2 className="w-4 h-4" />
            Projects ({projectsList.length})
          </button>
          <button
            onClick={() => { setActiveTab('keys'); loadKeys(); }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'keys'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Key className="w-4 h-4" />
            API Keys ({keysList.length})
          </button>
          <button
            onClick={() => { setActiveTab('client'); fetchClientStub(); }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'client'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Download className="w-4 h-4" />
            Client Stub Generator
          </button>
          <button
            onClick={() => setActiveTab('bot')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'bot'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Bot className="w-4 h-4 text-cyan-400" />
            Telegram Bot
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
          </button>
          <button
            onClick={() => { setActiveTab('logs'); loadLogs(); }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'logs'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Activity className="w-4 h-4" />
            Audit Logs
          </button>
          <button
            onClick={() => setActiveTab('docs')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'docs'
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            API Docs
          </button>
        </div>

        <div className="flex items-center gap-2 py-1.5 pl-4">
          <span className="text-xs text-slate-500 font-mono hidden sm:inline">Admin Key:</span>
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            className="text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-300 w-28 sm:w-36 focus:outline-none focus:border-cyan-500 font-mono"
            placeholder="Admin Key"
          />
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 px-4 lg:px-8 py-6 max-w-7xl w-full mx-auto">
        {/* TAB 1: RUNNER / SANDBOX */}
        {activeTab === 'runner' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Request Builder */}
            <div className="lg:col-span-5 space-y-5">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    Execute Remote Protected Code
                  </h2>
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-emerald-400" />
                    Zero Code Leaves Server
                  </span>
                </div>

                {/* API Key */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-cyan-400" />
                      Client API Key (<code className="text-cyan-400 font-mono">X-API-Key</code>)
                    </label>
                    <button
                      onClick={fetchFunctions}
                      className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Inspect Functions
                    </button>
                  </div>
                  <input
                    type="text"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="moon_xxxxxxxxxxxx"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-cyan-300 font-mono focus:outline-none focus:border-cyan-500"
                  />
                  {projectInfo && (
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Authenticated for: <strong>{projectInfo.project}</strong></span>
                    </div>
                  )}
                </div>

                {/* Mode Selector */}
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                    Execution Mode
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setRunMode('call')}
                      className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 border transition-all ${
                        runMode === 'call'
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      Call Named Function
                    </button>
                    <button
                      onClick={() => setRunMode('script')}
                      className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 border transition-all ${
                        runMode === 'script'
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      Run As Script (__main__)
                    </button>
                  </div>
                </div>

                {/* Mode specific fields */}
                {runMode === 'call' ? (
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-slate-300">
                          Target Function
                        </label>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {availableFunctions.length} detected
                        </span>
                      </div>
                      {availableFunctions.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {availableFunctions.map((fn) => (
                            <button
                              key={fn}
                              onClick={() => {
                                setSelectedFunction(fn);
                                if (fn === 'fib') setFunctionArgs('[10]');
                                if (fn === 'secret_formula') setFunctionArgs('[5, 3]');
                              }}
                              className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                                selectedFunction === fn
                                  ? 'bg-cyan-500 text-slate-950 font-bold'
                                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                              }`}
                            >
                              {fn}()
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <input
                        type="text"
                        value={selectedFunction}
                        onChange={(e) => setSelectedFunction(e.target.value)}
                        placeholder="e.g. fib"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-slate-300">
                          Positional Arguments (<code className="text-cyan-400 font-mono">args</code> as JSON array)
                        </label>
                        <span className="text-[10px] text-slate-500">e.g. [8] or [5, 3]</span>
                      </div>
                      <input
                        type="text"
                        value={functionArgs}
                        onChange={(e) => setFunctionArgs(e.target.value)}
                        placeholder="[5, 3]"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1.5 block">
                      Script Standard Input (<code className="text-cyan-400 font-mono">stdin</code>)
                    </label>
                    <textarea
                      rows={4}
                      value={scriptStdin}
                      onChange={(e) => setScriptStdin(e.target.value)}
                      placeholder="Input passed to sys.stdin..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                )}

                {/* Execute Button */}
                <button
                  onClick={handleExecute}
                  disabled={isRunning || !apiKeyInput}
                  className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 disabled:opacity-50 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
                >
                  {isRunning ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Executing inside Sandbox...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-white" />
                      Run On Server ({runMode === 'call' ? `${selectedFunction}()` : 'script'})
                    </>
                  )}
                </button>
              </div>

              {/* Security Details Card */}
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 text-xs space-y-2">
                <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  What happens behind the scenes:
                </div>
                <ul className="text-slate-400 space-y-1 list-disc list-inside">
                  <li>Original code is decrypted in-memory only for this isolated request.</li>
                  <li>Network access is blocked inside the execution context.</li>
                  <li>No stack traces or source leak back to the caller.</li>
                  <li>Execution time limit enforced ({status?.max_execution_time_sec || 20}s timeout).</li>
                </ul>
              </div>
            </div>

            {/* Right Column: Execution Output */}
            <div className="lg:col-span-7 flex flex-col space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex-1 flex flex-col shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-sm font-semibold text-white">Execution Console</h3>
                  </div>
                  {runResponse && (
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1 text-slate-400">
                        <Clock className="w-3.5 h-3.5 text-cyan-400" />
                        {runResponse.elapsed_ms ?? 0}ms
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full font-medium ${
                          runResponse.success
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}
                      >
                        {runResponse.success ? 'Success' : 'Failed'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Console Output Viewer */}
                <div className="mt-4 flex-1 flex flex-col space-y-3 min-h-[360px]">
                  {runResponse ? (
                    <>
                      {/* Return Value */}
                      {runResponse.result !== undefined && (
                        <div>
                          <div className="text-xs font-semibold text-slate-400 mb-1 flex items-center justify-between">
                            <span>Function Return Value (<code className="text-cyan-400 font-mono">result</code>):</span>
                            <button
                              onClick={() => copyToClipboard(JSON.stringify(runResponse.result, null, 2), 'result')}
                              className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1"
                            >
                              {copied === 'result' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              Copy
                            </button>
                          </div>
                          <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm font-mono text-emerald-300 overflow-x-auto">
                            {typeof runResponse.result === 'object'
                              ? JSON.stringify(runResponse.result, null, 2)
                              : String(runResponse.result)}
                          </pre>
                        </div>
                      )}

                      {/* Standard Output / stdout */}
                      {runResponse.output && (
                        <div>
                          <div className="text-xs font-semibold text-slate-400 mb-1">
                            Standard Output (<code className="text-cyan-400 font-mono">stdout</code>):
                          </div>
                          <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-cyan-200 overflow-x-auto whitespace-pre-wrap">
                            {runResponse.output}
                          </pre>
                        </div>
                      )}

                      {/* Error Message */}
                      {runResponse.error && (
                        <div>
                          <div className="text-xs font-semibold text-rose-400 mb-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Execution Error:
                          </div>
                          <pre className="bg-rose-950/30 border border-rose-900/50 rounded-lg p-3 text-xs font-mono text-rose-300 overflow-x-auto">
                            {runResponse.error}
                          </pre>
                        </div>
                      )}

                      {/* Full JSON Response */}
                      <div className="pt-2">
                        <div className="text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
                          <span>Raw JSON Response:</span>
                          <button
                            onClick={() => copyToClipboard(JSON.stringify(runResponse, null, 2), 'full')}
                            className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1"
                          >
                            {copied === 'full' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            Copy JSON
                          </button>
                        </div>
                        <pre className="bg-slate-950 border border-slate-800/80 rounded-lg p-3 text-xs font-mono text-slate-400 overflow-x-auto max-h-48">
                          {JSON.stringify(runResponse, null, 2)}
                        </pre>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500">
                      <Terminal className="w-12 h-12 text-slate-700 mb-3" />
                      <p className="text-sm font-medium text-slate-400">Ready to execute</p>
                      <p className="text-xs max-w-sm mt-1">
                        Select a function like <code className="text-cyan-400 font-mono">fib([10])</code> or <code className="text-cyan-400 font-mono">secret_formula([5, 3])</code> and click Run.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PROJECTS */}
        {activeTab === 'projects' && (
          <div className="space-y-6">
            {/* Create Project Form */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                <div>
                  <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-cyan-400" />
                    Deploy New Protected Python Script
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Uploaded code is immediately encrypted using Fernet / AES-256 before disk storage.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setNewProjectName('data_cruncher.py');
                      setNewProjectCode(`def analyze(numbers):\n    return {"avg": sum(numbers)/len(numbers), "max": max(numbers), "min": min(numbers)}\n`);
                    }}
                    className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    Template: Data
                  </button>
                  <button
                    onClick={() => {
                      setNewProjectName('prime_generator.py');
                      setNewProjectCode(`def is_prime(n):\n    if n < 2: return False\n    for i in range(2, int(n**0.5) + 1):\n        if n % i == 0: return False\n    return True\n\ndef primes(up_to=50):\n    return [x for x in range(up_to) if is_prime(x)]\n`);
                    }}
                    className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    Template: Math
                  </button>
                </div>
              </div>

              <form onSubmit={handleCreateProject} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-300 mb-1 block">Project File Name</label>
                    <input
                      type="text"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="my_algorithm.py"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Python Source Code</label>
                  <textarea
                    rows={6}
                    value={newProjectCode}
                    onChange={(e) => setNewProjectCode(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-cyan-200 focus:outline-none focus:border-cyan-500 whitespace-pre"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isCreatingProject}
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-sm flex items-center gap-2 cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Encrypt & Save Project (POST /admin/projects)
                </button>
              </form>
            </div>

            {/* Projects List */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Stored Projects ({projectsList.length})</h3>
                <button
                  onClick={loadProjects}
                  className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh
                </button>
              </div>

              <div className="divide-y divide-slate-800">
                {projectsList.map((p) => (
                  <div key={p.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-800/20">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-lg bg-slate-800 border border-slate-700 text-cyan-400">
                        <Lock className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">{p.name}</span>
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700">
                            ID: {p.id}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                          <span>Size: {p.size} bytes</span>
                          <span>•</span>
                          <span>Created: {new Date(p.created_at * 1000).toLocaleString()}</span>
                          <span>•</span>
                          <span className="text-emerald-400 font-medium">AES-256 Encrypted</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setNewKeyProjectId(p.id);
                          setStubProjectId(p.id);
                          setActiveTab('keys');
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs bg-cyan-950/70 border border-cyan-800 text-cyan-300 hover:bg-cyan-900"
                      >
                        + Issue Key
                      </button>
                      <button
                        onClick={() => {
                          setStubProjectId(p.id);
                          setActiveTab('client');
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700"
                      >
                        Client Stub
                      </button>
                      <button
                        onClick={() => handleDeleteProject(p.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40"
                        title="Delete Project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: API KEYS */}
        {activeTab === 'keys' && (
          <div className="space-y-6">
            {/* Create API Key Box */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-white mb-4 pb-3 border-b border-slate-800 flex items-center gap-2">
                <Key className="w-4 h-4 text-cyan-400" />
                Issue Project API Key (POST /admin/keys)
              </h2>

              <form onSubmit={handleCreateKey} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Target Project</label>
                  <select
                    value={newKeyProjectId}
                    onChange={(e) => setNewKeyProjectId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  >
                    {projectsList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">TTL / Duration (Hours)</label>
                  <input
                    type="number"
                    min="1"
                    max="8760"
                    value={newKeyDurationHours}
                    onChange={(e) => setNewKeyDurationHours(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Description / Notes</label>
                  <input
                    type="text"
                    value={newKeyNotes}
                    onChange={(e) => setNewKeyNotes(e.target.value)}
                    placeholder="Customer client token"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="sm:col-span-3">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-sm flex items-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Generate Key
                  </button>
                </div>
              </form>

              {/* Newly Generated Key Notice */}
              {generatedKeyResult && (
                <div className="mt-4 p-4 rounded-xl bg-cyan-950/40 border border-cyan-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Key Created! Save this key now (it will never be displayed in plain text again):
                    </span>
                    <button
                      onClick={() => copyToClipboard(generatedKeyResult.api_key, 'newkey')}
                      className="text-xs text-cyan-400 hover:text-cyan-200 flex items-center gap-1"
                    >
                      {copied === 'newkey' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      Copy Key
                    </button>
                  </div>
                  <div className="p-2.5 bg-slate-950 border border-cyan-900 rounded font-mono text-sm text-emerald-300 select-all">
                    {generatedKeyResult.api_key}
                  </div>
                </div>
              )}
            </div>

            {/* Keys Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Active & Revoked API Keys</h3>
                <button onClick={loadKeys} className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-mono border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Key ID</th>
                      <th className="px-4 py-3">Project</th>
                      <th className="px-4 py-3">Total Calls</th>
                      <th className="px-4 py-3">Expires At</th>
                      <th className="px-4 py-3">Notes</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {keysList.map((k) => (
                      <tr key={k.key_id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-mono text-cyan-400">{k.key_id}</td>
                        <td className="px-4 py-3 font-mono text-slate-300">{k.project_id}</td>
                        <td className="px-4 py-3 text-slate-200">{k.total_requests}</td>
                        <td className="px-4 py-3 text-slate-400">
                          {new Date(k.expires_at * 1000).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-slate-400">{k.notes || '—'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full font-medium ${
                              k.active
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-slate-800 text-slate-500'
                            }`}
                          >
                            {k.active ? 'Active' : 'Revoked'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {k.active && (
                            <button
                              onClick={() => handleRevokeKey(k.key_id)}
                              className="text-rose-400 hover:text-rose-300 text-xs"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CLIENT STUB GENERATOR */}
        {activeTab === 'client' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Download className="w-4 h-4 text-cyan-400" />
                  Client Distribution Package
                </h2>
                <p className="text-xs text-slate-400">
                  Deliver this lightweight stub script to your end-users. It exposes your code&apos;s functions remotely with zero proprietary logic embedded.
                </p>

                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Project</label>
                  <select
                    value={stubProjectId}
                    onChange={(e) => setStubProjectId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  >
                    {projectsList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-300 mb-1 block">Embed API Key</label>
                  <input
                    type="text"
                    value={stubApiKey}
                    onChange={(e) => setStubApiKey(e.target.value)}
                    placeholder="moon_xxxxxxxx"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-cyan-300 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-slate-300">Public Server URL (API_URL)</label>
                    <span className="text-[10px] text-cyan-400">رابط السيرفر</span>
                  </div>
                  <input
                    type="text"
                    value={publicUrlInput}
                    onChange={(e) => setPublicUrlInput(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-cyan-300 font-mono focus:outline-none focus:border-cyan-500"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    هذا هو الرابط الذي سيتصل به ملف العميل من الهواتف (مثل Pydroid 3).
                  </p>
                </div>

                <a
                  href={`/api/client-stub?project_id=${encodeURIComponent(stubProjectId)}&api_key=${encodeURIComponent(stubApiKey)}&public_url=${encodeURIComponent(publicUrlInput)}&download=true`}
                  download
                  className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm flex items-center justify-center gap-2 shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Download <code className="font-mono text-xs">client.py</code>
                </a>
              </div>
            </div>

            <div className="lg:col-span-8">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
                  <span className="text-xs font-semibold text-slate-300">Generated Client Stub File Preview:</span>
                  <button
                    onClick={() => copyToClipboard(clientStubCode, 'stubcode')}
                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                  >
                    {copied === 'stubcode' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    Copy Code
                  </button>
                </div>
                <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs font-mono text-cyan-200 overflow-x-auto max-h-[500px]">
                  {clientStubCode || 'Loading client stub...'}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: AUDIT LOGS */}
        {activeTab === 'logs' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Execution Audit Trail</h3>
                <p className="text-xs text-slate-400 mt-0.5">Real-time log of API execution requests</p>
              </div>
              <button onClick={loadLogs} className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1">
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase font-mono border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Endpoint</th>
                    <th className="px-4 py-3">Key ID</th>
                    <th className="px-4 py-3">Project</th>
                    <th className="px-4 py-3">Latency</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {logsList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                        No requests logged yet.
                      </td>
                    </tr>
                  ) : (
                    logsList.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-800/30">
                        <td className="px-4 py-3 text-slate-400 font-mono">
                          {new Date(l.ts * 1000).toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-3 font-mono text-cyan-400">{l.endpoint}</td>
                        <td className="px-4 py-3 font-mono text-slate-400">{l.key_id}</td>
                        <td className="px-4 py-3 font-mono text-slate-300">{l.project_id}</td>
                        <td className="px-4 py-3 text-slate-300">{l.elapsed_ms ?? '—'}ms</td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full font-medium ${
                              l.ok
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-rose-950 text-rose-400 border border-rose-800'
                            }`}
                          >
                            {l.ok ? '200 OK' : 'Error'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 truncate max-w-xs">{l.error || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: TELEGRAM BOT */}
        {activeTab === 'bot' && <TelegramBotPanel />}

        {/* TAB 6: API DOCS */}
        {activeTab === 'docs' && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-cyan-400" />
                Moon API Developer Documentation & Reference
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Full reference for public caller endpoints and administrative management endpoints.
              </p>
            </div>

            <div className="space-y-4">
              {/* Endpoint 1 */}
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono text-xs font-bold">
                    POST
                  </span>
                  <code className="text-sm text-cyan-300 font-mono">/api/run</code>
                  <span className="text-xs text-slate-400">Header: <code className="text-slate-300">X-API-Key: moon_...</code></span>
                </div>
                <p className="text-xs text-slate-300">
                  Executes the project&apos;s function or script remotely.
                </p>
                <pre className="text-xs font-mono text-slate-400 bg-slate-900/80 p-2.5 rounded border border-slate-800">
{`// Call a function
curl -X POST http://0.0.0.0:3000/api/run \\
  -H "X-API-Key: ${apiKeyInput}" \\
  -H "Content-Type: application/json" \\
  -d '{"function": "fib", "args": [10]}'

// Run as script with stdin
curl -X POST http://0.0.0.0:3000/api/run \\
  -H "X-API-Key: ${apiKeyInput}" \\
  -H "Content-Type: application/json" \\
  -d '{"stdin": "test user"}'`}
                </pre>
              </div>

              {/* Endpoint 2 */}
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono text-xs font-bold">
                    GET
                  </span>
                  <code className="text-sm text-cyan-300 font-mono">/api/functions</code>
                  <span className="text-xs text-slate-400">Header: <code className="text-slate-300">X-API-Key: moon_...</code></span>
                </div>
                <p className="text-xs text-slate-300">
                  Returns all exported callable function names defined in the encrypted code.
                </p>
              </div>

              {/* Endpoint 3 */}
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800 font-mono text-xs font-bold">
                    POST
                  </span>
                  <code className="text-sm text-cyan-300 font-mono">/admin/projects</code>
                  <span className="text-xs text-slate-400">Header: <code className="text-slate-300">X-Admin-Key: ...</code></span>
                </div>
                <p className="text-xs text-slate-300">
                  Encrypts and stores a new Python project file.
                </p>
              </div>

              {/* Endpoint 4 */}
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800 font-mono text-xs font-bold">
                    POST
                  </span>
                  <code className="text-sm text-cyan-300 font-mono">/admin/keys</code>
                  <span className="text-xs text-slate-400">Header: <code className="text-slate-300">X-Admin-Key: ...</code></span>
                </div>
                <p className="text-xs text-slate-300">
                  Issues a new API key bound to a specific project with custom duration (TTL) and rate limits.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 px-4 lg:px-8 py-4 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span>🌙 Moon API</span>
          <span>•</span>
          <span>Server-Side Code Protection Engine</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Port: 3000 (0.0.0.0)</span>
          <span>•</span>
          <span>Node.js 22 + TypeScript + Express + React</span>
        </div>
      </footer>
    </div>
  );
}
