import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { telegramBot } from './telegramBot.ts';
// 'vite' is a devDependency and is only ever needed for the dev middleware
// below (NODE_ENV !== 'production'). It's imported dynamically inside that
// branch instead of statically here so a production image/build doesn't
// need vite (or its own dependency tree) installed at runtime at all.

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

// Configuration
const envMasterSecret = process.env.MOON_MASTER_SECRET?.trim();
const MASTER_SECRET = (envMasterSecret && !envMasterSecret.startsWith('#')) ? envMasterSecret : 'moon_master_secret_key_ai_studio_2026';

const envAdminKey = process.env.ADMIN_API_KEY?.trim();
const ADMIN_API_KEY = (envAdminKey && !envAdminKey.startsWith('#')) ? envAdminKey : 'moon_admin_master_key_9999';
const API_KEY_TTL = parseInt((process.env.API_KEY_TTL || '86400').split('#')[0].trim(), 10) || 86400;
const RATE_LIMIT_PER_HOUR = parseInt((process.env.RATE_LIMIT || '100').split('#')[0].trim(), 10) || 100;
const MAX_EXECUTION_TIME_SEC = parseInt((process.env.MAX_EXECUTION_TIME || '60').split('#')[0].trim(), 10) || 60;

// Telegram Configuration (sanitized of trailing comments)
const rawBotToken = (process.env.TELEGRAM_BOT_TOKEN || '').split('#')[0].trim();
const rawAllowedIds = (process.env.TELEGRAM_ALLOWED_IDS || '').split('#')[0].trim();
const defaultAllowedIds = [1726923679];
const parsedAllowedIds = rawAllowedIds
  ? Array.from(new Set([...defaultAllowedIds, ...rawAllowedIds.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => !isNaN(n))]))
  : defaultAllowedIds;
const rawPublicModeStr = (process.env.TELEGRAM_PUBLIC_MODE || '').split('#')[0].trim().toLowerCase();
const initialPublicMode = rawPublicModeStr === 'true' || parsedAllowedIds.length === 0;
const MAX_PROJECTS_PER_USER = parseInt((process.env.MAX_PROJECTS_PER_USER || '10').split('#')[0].trim(), 10) || 10;
const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || '').split('#')[0].trim();

// Dynamic URL detection & configuration
let detectedPublicUrl: string = '';
let customPublicApiUrl: string = '';

export function getEffectivePublicUrl(req?: Request): string {
  if (customPublicApiUrl) {
    return customPublicApiUrl.replace(/\/+$/, '');
  }
  if (PUBLIC_API_URL && !PUBLIC_API_URL.includes('your-domain.com') && !PUBLIC_API_URL.includes('example.com') && !PUBLIC_API_URL.includes('2o3pnm')) {
    return PUBLIC_API_URL.replace(/\/+$/, '');
  }
  if (req) {
    const host = (req.headers['x-forwarded-host'] || req.headers.host) as string | undefined;
    if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
      return `https://${host}`.replace(/\/+$/, '');
    }
  }
  if (detectedPublicUrl) {
    return detectedPublicUrl.replace(/\/+$/, '');
  }
  return 'https://ais-pre-rrmlgbo7vp4atnn3s7i5hj-319478204212.europe-west2.run.app';
}

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  const host = (req.headers['x-forwarded-host'] || req.headers.host) as string | undefined;
  if (host && typeof host === 'string' && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    detectedPublicUrl = `https://${host}`;
  }
  next();
});

// In-Memory Database (encrypted project storage, active keys, audit logs)
interface ProjectRecord {
  id: string;
  owner_id: number;
  name: string;
  size: number;
  created_at: number;
  encrypted_code: string;
  iv: string;
  required_packages?: string[];
}

interface ApiKeyRecord {
  key_id: string;
  key_hash: string;
  project_id: string;
  owner_id: number;
  created_at: number;
  expires_at: number;
  window_start: number;
  window_count: number;
  total_requests: number;
  active: boolean;
  notes: string;
}

interface RequestLogRecord {
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

const projects = new Map<string, ProjectRecord>();
const apiKeys = new Map<string, ApiKeyRecord>();
const requestLogs: RequestLogRecord[] = [];

// Configurable so this file can live on a mounted persistent volume (e.g. a
// Railway Volume) instead of the container's local filesystem, which is
// wiped on every redeploy/restart. Set DATA_DIR (a directory) or the more
// specific DATA_FILE (the full path) to override; defaults to the previous
// behavior (projects_data.json next to the running process) for anyone not
// using a volume.
const DATA_FILE = (process.env.DATA_FILE?.trim())
  || path.join((process.env.DATA_DIR?.trim() || process.cwd()), 'projects_data.json');

interface PersistedTelegramConfig {
  token?: string;
  allowedIds?: number[];
  publicMode?: boolean;
}
let persistedTelegram: PersistedTelegramConfig | null = null;

export function saveStoreToDisk() {
  try {
    const tg = telegramBot.getState();
    const data = {
      projects: Array.from(projects.entries()),
      apiKeys: Array.from(apiKeys.entries()),
      telegram: { token: tg.token, allowedIds: tg.allowedIds, publicMode: tg.publicMode },
    };
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf8');
  } catch (e) {
    console.warn('Failed to persist store:', e);
  }
}

export function loadStoreFromDisk() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.projects)) {
        for (const [k, v] of data.projects) {
          projects.set(k, v);
        }
      }
      if (Array.isArray(data.apiKeys)) {
        for (const [k, v] of data.apiKeys) {
          apiKeys.set(k, v);
        }
      }
      if (data.telegram && typeof data.telegram === 'object') {
        persistedTelegram = data.telegram;
      }
    }
  } catch (e) {
    console.warn('Failed to load store:', e);
  }
}

const PYTHON_STDLIB_MODULES = new Set([
  'sys', 'os', 'io', 're', 'json', 'math', 'time', 'datetime', 'random',
  'string', 'collections', 'itertools', 'functools', 'urllib', 'http',
  'subprocess', 'threading', 'multiprocessing', 'concurrent', 'asyncio',
  'socket', 'ssl', 'select', 'selectors', 'pathlib', 'shutil', 'tempfile',
  'traceback', 'logging', 'argparse', 'optparse', 'configparser', 'copy',
  'typing', 'types', 'inspect', 'contextlib', 'hashlib', 'hmac', 'secrets',
  'base64', 'binascii', 'struct', 'pickle', 'shelve', 'dbm', 'sqlite3',
  'zlib', 'gzip', 'bz2', 'lzma', 'zipfile', 'tarfile', 'csv', 'xml',
  'html', 'email', 'mailbox', 'mimetypes', 'wave', 'audioop', 'cgi',
  'cgitb', 'wsgiref', 'enum', 'dataclasses', 'abc', 'queue', 'weakref',
  'gc', 'platform', 'dis', 'ast', 'symtable', 'symbol', 'token', 'keyword',
  'tokenize', 'tabnanny', 'pyclbr', 'py_compile', 'compileall', 'uuid',
  'unittest', 'doctest', 'test', 'venv', 'ensurepip', 'site', '__future__'
]);

export function extractPythonImports(codeText: string): string[] {
  const pkgs = new Set<string>();
  if (!codeText) return [];

  // NOTE: the captured class must exclude \n (and \r) explicitly. A plain
  // \s inside a character class also matches newlines, which previously let
  // this regex "bleed" past the end of an `import x` line into whatever
  // followed on the next line(s) — e.g. a following `from telegram import
  // ReplyKeyboardMarkup, ReplyKeyboardRemove, ...` would get its imported
  // *names* mistaken for separate top-level packages. Restricting the class
  // to same-line characters (and cutting at `#` for inline comments) keeps
  // each match confined to its own `import ...` statement.
  const importRegex = /^[ \t]*import[ \t]+([^\n\r#]+)/gm;
  let match;
  while ((match = importRegex.exec(codeText)) !== null) {
    const list = match[1].split(',');
    for (const item of list) {
      const top = item.trim().split(/\s+/)[0]?.split('.')[0];
      if (top && !PYTHON_STDLIB_MODULES.has(top)) {
        pkgs.add(top);
      }
    }
  }

  const fromRegex = /^\s*from\s+([a-zA-Z0-9_.]+)\s+import/gm;
  while ((match = fromRegex.exec(codeText)) !== null) {
    const top = match[1].trim().split('.')[0];
    if (top && !PYTHON_STDLIB_MODULES.has(top)) {
      pkgs.add(top);
    }
  }

  return Array.from(pkgs);
}

// Crypto helpers for AES-256-GCM
const derivedKey = crypto.createHash('sha256').update('moon-code-v1:' + MASTER_SECRET).digest();

function encryptCode(codeText: string): { encrypted: string; iv: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', derivedKey, iv);
  let encrypted = cipher.update(codeText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return { encrypted, iv: iv.toString('hex') };
}

function decryptCode(encryptedHex: string, ivHex: string): string {
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', derivedKey, iv);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function hashKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

// Seed Demo Project and Demo Key
const demoCode = `"""Demo project with protected algorithms."""

def secret_formula(x, y):
    """Calculates protected proprietary formula."""
    return (x ** 2 + y ** 3) * 42


def fib(n):
    """Generates Fibonacci series up to n numbers."""
    a, b, out = 0, 1, []
    for _ in range(n):
        out.append(a)
        a, b = b, a + b
    return out


if __name__ == "__main__":
    try:
        import sys
        stdin_content = sys.stdin.read().strip()
        name = stdin_content if stdin_content else "world"
    except Exception:
        name = "world"
    print(f"hello from Moon protected runner, {name}!")
`;

const demoEnc = encryptCode(demoCode);
const DEMO_PROJECT_ID = 'demo_project';
projects.set(DEMO_PROJECT_ID, {
  id: DEMO_PROJECT_ID,
  owner_id: 1,
  name: 'demo_algorithms.py',
  size: Buffer.byteLength(demoCode, 'utf8'),
  created_at: Math.floor(Date.now() / 1000) - 3600,
  encrypted_code: demoEnc.encrypted,
  iv: demoEnc.iv,
});

const DEMO_API_KEY = 'moon_demo_secret_key_12345';
const DEMO_KEY_ID = 'demo_key';
apiKeys.set(DEMO_KEY_ID, {
  key_id: DEMO_KEY_ID,
  key_hash: hashKey(DEMO_API_KEY),
  project_id: DEMO_PROJECT_ID,
  owner_id: 1,
  created_at: Math.floor(Date.now() / 1000) - 3600,
  expires_at: Math.floor(Date.now() / 1000) + 86400 * 30,
  window_start: Math.floor(Date.now() / 1000),
  window_count: 0,
  total_requests: 3,
  active: true,
  notes: 'Pre-configured starter key for testing demo algorithms',
});

// Seed an initial request log
requestLogs.push({
  id: 'log_init',
  key_id: DEMO_KEY_ID,
  project_id: DEMO_PROJECT_ID,
  endpoint: '/api/run',
  ts: Math.floor(Date.now() / 1000) - 120,
  ip: '127.0.0.1',
  ok: true,
  error: '',
  elapsed_ms: 18,
});

// Load persistent projects & keys if present
loadStoreFromDisk();

// Authentication middleware helpers
function validateApiKey(req: Request): { key_id: string; project_id: string; expires_at: number; ip: string } {
  const raw = (req.headers['x-api-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '')) as string | undefined;
  if (!raw || !raw.startsWith('moon_')) {
    const err = new Error('Invalid or missing API key (Header: X-API-Key)');
    (err as any).statusCode = 401;
    throw err;
  }

  const h = hashKey(raw);
  const now = Math.floor(Date.now() / 1000);

  let matched: ApiKeyRecord | undefined;
  for (const k of apiKeys.values()) {
    if (k.key_hash === h) {
      matched = k;
      break;
    }
  }

  if (!matched || !matched.active || now > matched.expires_at) {
    const err = new Error('Invalid or expired API key');
    (err as any).statusCode = 401;
    throw err;
  }

  // Rate limiting check
  if (now - matched.window_start >= 3600) {
    matched.window_start = now;
    matched.window_count = 0;
  }

  if (matched.window_count >= RATE_LIMIT_PER_HOUR) {
    const err = new Error(`Rate limit exceeded (${RATE_LIMIT_PER_HOUR}/hour)`);
    (err as any).statusCode = 429;
    throw err;
  }

  matched.window_count += 1;
  matched.total_requests += 1;

  const ip = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';
  return {
    key_id: matched.key_id,
    project_id: matched.project_id,
    expires_at: matched.expires_at,
    ip,
  };
}

function verifyAdmin(req: Request) {
  const adminKey = (req.headers['x-admin-key'] || req.headers['admin-key']) as string | undefined;
  if (!adminKey || adminKey !== ADMIN_API_KEY) {
    const err = new Error('Forbidden: Invalid or missing X-Admin-Key');
    (err as any).statusCode = 403;
    throw err;
  }
}

let pyodideInstance: any = null;
let pyodideLoadingPromise: Promise<any> | null = null;

async function getPyodide() {
  if (pyodideInstance) return pyodideInstance;
  if (!pyodideLoadingPromise) {
    pyodideLoadingPromise = (async () => {
      const { loadPyodide } = await import('pyodide');
      const py = await loadPyodide();
      try {
        await py.loadPackage('micropip');
      } catch {}
      const runner = `
import sys, json, io, contextlib, types, inspect

def run_moon(action, payload_json):
    payload = json.loads(payload_json)
    code_str = payload.get("code", "")
    stdin_data = payload.get("stdin") or ""
    fn_name = payload.get("function")
    args = payload.get("args") or []
    kwargs = payload.get("kwargs") or {}

    out = {"ok": False, "result": None, "error": "", "output": "", "missing_module": ""}
    buf = io.StringIO()
    sys.stdin = io.StringIO(stdin_data)

    try:
        code = compile(code_str, "<protected>", "exec")
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            if action == "script":
                try:
                    exec(code, {"__name__": "__main__"})
                except SystemExit:
                    pass
                out["ok"] = True
            else:
                mod = types.ModuleType("protected")
                exec(code, mod.__dict__)
                funcs = {
                    n: f for n, f in vars(mod).items()
                    if not n.startswith("_") and inspect.isfunction(f)
                }
                if action == "list":
                    out["result"] = sorted(funcs.keys())
                    out["ok"] = True
                else:
                    if fn_name not in funcs:
                        raise LookupError(f"function '{fn_name}' not found")
                    res = funcs[fn_name](*args, **kwargs)
                    out["result"] = res
                    out["ok"] = True
    except ModuleNotFoundError as e:
        mod = getattr(e, "name", "")
        if not mod:
            import re
            m = re.search(r"No module named '([^']+)'", str(e))
            mod = m.group(1).split('.')[0] if m else ""
        out["missing_module"] = mod
        out["error"] = f"{type(e).__name__}: {e}"[:500]
    except BaseException as e:
        out["error"] = f"{type(e).__name__}: {e}"[:500]

    out["output"] = buf.getvalue()[:20000]
    return json.dumps(out, default=str)
`;
      py.runPython(runner);
      pyodideInstance = py;
      return py;
    })();
  }
  return pyodideLoadingPromise;
}

const COMMON_PKG_MAP: Record<string, string> = {
  bs4: 'beautifulsoup4',
  PIL: 'Pillow',
  cv2: 'opencv-python',
  yaml: 'pyyaml',
  telebot: 'pyTelegramBotAPI',
  telegram: 'python-telegram-bot',
  dotenv: 'python-dotenv',
  jwt: 'pyjwt',
  dateutil: 'python-dateutil',
  sklearn: 'scikit-learn',
  Crypto: 'pycryptodome',
  crypto: 'pycryptodome',
  websocket: 'websocket-client',
  googleapiclient: 'google-api-python-client',
  dns: 'dnspython',
  OpenSSL: 'pyOpenSSL',
  serial: 'pyserial',
  docx: 'python-docx',
  pptx: 'python-pptx',
  fitz: 'PyMuPDF',
  magic: 'python-magic',
  discord: 'discord.py',
  attr: 'attrs',
  pg: 'psycopg2-binary',
  psycopg2: 'psycopg2-binary',
  MySQLdb: 'mysqlclient',
  fake_useragent: 'fake-useragent',
  requests: 'requests',
  urllib3: 'urllib3',
  aiohttp: 'aiohttp',
};

async function executeWithPyodide(
  code: string,
  action: 'call' | 'script' | 'list',
  functionName?: string,
  args: any[] = [],
  kwargs: Record<string, any> = {},
  stdin: string = '',
  startTime: number = Date.now()
): Promise<{ ok: boolean; result: any; output: string; error: string; elapsed_ms: number }> {
  try {
    const py = await getPyodide();
    const runMoon = py.globals.get('run_moon');
    const payload = JSON.stringify({
      code,
      function: functionName,
      args,
      kwargs,
      stdin,
    });
    let resultJson = runMoon(action, payload);
    let parsed = JSON.parse(resultJson);

    // If a missing module was detected in Pyodide, auto-install via micropip and retry
    if (!parsed.ok && parsed.missing_module) {
      const missingMod = parsed.missing_module.split('.')[0];
      const targetPkg = COMMON_PKG_MAP[missingMod] || missingMod;
      try {
        console.log(`[*] Pyodide auto-installing missing package: ${targetPkg}`);
        try {
          await py.loadPackage(targetPkg);
        } catch {
          const micropip = py.pyimport('micropip');
          await micropip.install(targetPkg);
        }
        // Retry execution with newly loaded package
        resultJson = runMoon(action, payload);
        parsed = JSON.parse(resultJson);
      } catch (installErr: any) {
        console.warn(`Could not auto-install ${targetPkg} in Pyodide:`, installErr.message);
      }
    }

    return {
      ok: Boolean(parsed.ok),
      result: parsed.result ?? null,
      output: parsed.output || '',
      error: parsed.error || '',
      elapsed_ms: Date.now() - startTime,
    };
  } catch (err: any) {
    return {
      ok: false,
      result: null,
      output: '',
      error: `Execution error (Pyodide): ${err.message}`,
      elapsed_ms: Date.now() - startTime,
    };
  }
}

// Python Runner with Pyodide fallback and auto-dependency installation
async function executePython(
  code: string,
  action: 'call' | 'script' | 'list',
  functionName?: string,
  args: any[] = [],
  kwargs: Record<string, any> = {},
  stdin: string = ''
): Promise<{ ok: boolean; result: any; output: string; error: string; elapsed_ms: number }> {
  const startTime = Date.now();

  const first = await executePythonAttempt(code, action, functionName, args, kwargs, stdin, startTime);
  if (!first.ok && first.killedBySignal) {
    // The interpreter process was torn down by an external signal (SIGINT/
    // SIGTERM/etc.) rather than our own MAX_EXECUTION_TIME_SEC timeout (which
    // always kills with SIGKILL and resolves before reaching this check).
    // That pattern — empty stdout/stderr, non-zero/negative "exit code" —
    // is the signature of the HOST killing the container mid-request (a
    // Cloud Run/Render instance being recycled, scaled down, or restarted
    // while processing this request), not a bug in the user's code. Such
    // events are transient, so one silent retry on a fresh process clears
    // the vast majority of them instead of surfacing a cryptic error.
    const second = await executePythonAttempt(code, action, functionName, args, kwargs, stdin, startTime);
    return { ok: second.ok, result: second.result, output: second.output, error: second.error, elapsed_ms: second.elapsed_ms };
  }
  return { ok: first.ok, result: first.result, output: first.output, error: first.error, elapsed_ms: first.elapsed_ms };
}

async function executePythonAttempt(
  code: string,
  action: 'call' | 'script' | 'list',
  functionName: string | undefined,
  args: any[],
  kwargs: Record<string, any>,
  stdin: string,
  startTime: number
): Promise<{ ok: boolean; result: any; output: string; error: string; elapsed_ms: number; killedBySignal: boolean }> {
  const runnerScript = `
import sys, json, io, contextlib, types, inspect, subprocess, re, os, site, importlib, tempfile

# Dedicated, always-writable install directory (works even when the system
# site-packages is read-only, externally-managed, or blocked by PEP 668).
# Keyed by Python major.minor so it never mixes incompatible wheels, and
# cached under the OS temp dir so re-runs on the same host reuse installs.
def _moon_pkg_dir():
    base = os.environ.get("MOON_PKG_DIR") or os.path.join(
        tempfile.gettempdir(), "moon_pylibs", f"py{sys.version_info[0]}{sys.version_info[1]}"
    )
    try:
        os.makedirs(base, exist_ok=True)
    except Exception:
        pass
    return base

MOON_PKG_DIR = _moon_pkg_dir()
if MOON_PKG_DIR not in sys.path:
    sys.path.insert(0, MOON_PKG_DIR)

action = sys.argv[1]
try:
    payload = json.loads(sys.stdin.read())
except Exception as e:
    print(json.dumps({"ok": False, "result": None, "error": f"Invalid payload: {e}", "output": ""}))
    sys.exit(0)

code_str = payload.get("code", "")
stdin_data = payload.get("stdin") or ""
fn_name = payload.get("function")
args = payload.get("args") or []
kwargs = payload.get("kwargs") or {}

out = {"ok": False, "result": None, "error": "", "output": ""}
buf = io.StringIO()
sys.stdin = io.StringIO(stdin_data)

pkg_map = {
    "bs4": "beautifulsoup4",
    "PIL": "Pillow",
    "cv2": "opencv-python",
    "yaml": "pyyaml",
    "telebot": "pyTelegramBotAPI",
    "telegram": "python-telegram-bot",
    "dotenv": "python-dotenv",
    "jwt": "pyjwt",
    "dateutil": "python-dateutil",
    "sklearn": "scikit-learn",
    "Crypto": "pycryptodome",
    "crypto": "pycryptodome",
    "websocket": "websocket-client",
    "googleapiclient": "google-api-python-client",
    "dns": "dnspython",
    "OpenSSL": "pyOpenSSL",
    "serial": "pyserial",
    "docx": "python-docx",
    "pptx": "python-pptx",
    "fitz": "PyMuPDF",
    "magic": "python-magic",
    "discord": "discord.py",
    "attr": "attrs",
    "pg": "psycopg2-binary",
    "psycopg2": "psycopg2-binary",
    "MySQLdb": "mysqlclient",
    "fake_useragent": "fake-useragent",
    "requests": "requests",
    "urllib3": "urllib3",
    "aiohttp": "aiohttp",
}

stdlib_modules = {
    "sys", "os", "io", "re", "json", "math", "time", "datetime", "random",
    "string", "collections", "itertools", "functools", "urllib", "http",
    "subprocess", "threading", "multiprocessing", "concurrent", "asyncio",
    "socket", "ssl", "select", "selectors", "pathlib", "shutil", "tempfile",
    "traceback", "logging", "argparse", "optparse", "configparser", "copy",
    "typing", "types", "inspect", "contextlib", "hashlib", "hmac", "secrets",
    "base64", "binascii", "struct", "pickle", "shelve", "dbm", "sqlite3",
    "zlib", "gzip", "bz2", "lzma", "zipfile", "tarfile", "csv", "xml",
    "html", "email", "mailbox", "mimetypes", "wave", "audioop", "cgi",
    "cgitb", "wsgiref", "enum", "dataclasses", "abc", "queue", "weakref",
    "gc", "platform", "dis", "ast", "symtable", "symbol", "token", "keyword",
    "tokenize", "tabnanny", "pyclbr", "py_compile", "compileall", "uuid",
    "unittest", "doctest", "test", "venv", "ensurepip", "site", "__future__"
}

def auto_install_missing(mod_name):
    """Installs mod_name with whatever pip strategy actually works on this
    host/Python version, and returns (import_ok, last_pip_error).
    Tries, in order: a dedicated --target dir (survives read-only /
    externally-managed site-packages), plain install, --user install —
    each both with and without --break-system-packages, since not all
    pip versions understand that flag. Errors are captured (not swallowed)
    so a genuine failure is diagnosable instead of a silent no-op."""
    target = pkg_map.get(mod_name, mod_name)
    env = os.environ.copy()
    env["PIP_BREAK_SYSTEM_PACKAGES"] = "1"
    env["PIP_DISABLE_PIP_VERSION_CHECK"] = "1"
    env["PYTHONUNBUFFERED"] = "1"

    # Bootstrap pip itself if this interpreter doesn't have it (some slim
    # Docker/Render base images ship Python without pip preinstalled).
    try:
        import pip  # noqa: F401
    except ImportError:
        try:
            subprocess.run(
                [sys.executable, "-m", "ensurepip", "--default-pip"],
                env=env, stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60,
            )
        except Exception:
            pass

    attempts = [
        ["--target", MOON_PKG_DIR, "--quiet", "--no-warn-script-location", "--upgrade", target],
        ["--target", MOON_PKG_DIR, "--quiet", "--break-system-packages", "--upgrade", target],
        ["--quiet", "--no-warn-script-location", target],
        ["--quiet", "--break-system-packages", target],
        ["--user", "--quiet", target],
        ["--user", "--quiet", "--break-system-packages", target],
    ]

    installed = False
    last_err = ""
    for extra in attempts:
        cmd = [sys.executable, "-m", "pip", "install"] + extra
        try:
            res = subprocess.run(
                cmd,
                env=env,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=90,
                text=True,
            )
            if res.returncode == 0:
                installed = True
                break
            last_err = ((res.stderr or "") + (res.stdout or "")).strip()[-800:]
        except Exception as e:
            last_err = str(e)

    # Make sure a freshly-installed package (wherever it landed) is visible
    # to THIS process right away, without needing a restart.
    if MOON_PKG_DIR not in sys.path:
        sys.path.insert(0, MOON_PKG_DIR)
    try:
        user_site = site.getusersitepackages()
        if user_site and user_site not in sys.path:
            sys.path.insert(0, user_site)
    except Exception:
        pass
    try:
        for sp in site.getsitepackages():
            if sp not in sys.path:
                sys.path.append(sp)
    except Exception:
        pass
    importlib.invalidate_caches()

    try:
        importlib.import_module(mod_name)
        return True, ""
    except ImportError:
        return False, last_err

def pre_install_dependencies(source_code):
    modules = set()
    try:
        import ast
        tree = ast.parse(source_code)
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for a in node.names:
                    modules.add(a.name.split('.')[0])
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    modules.add(node.module.split('.')[0])
    except Exception:
        for line in source_code.splitlines():
            m = re.match(r"^\\s*(?:import|from)\\s+([a-zA-Z0-9_]+)", line)
            if m:
                modules.add(m.group(1))

    for mod in modules:
        if mod in stdlib_modules or not mod:
            continue
        try:
            __import__(mod)
        except ImportError:
            auto_install_missing(mod)  # best-effort pre-warm; real errors surface on actual use

# Run AST dependency pre-scanner before execution
pre_install_dependencies(code_str)

attempted_installs = set()

while True:
    try:
        code = compile(code_str, "<protected>", "exec")
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            if action == "script":
                try:
                    exec(code, {"__name__": "__main__"})
                except SystemExit:
                    pass
                out["ok"] = True
            else:
                mod = types.ModuleType("protected")
                exec(code, mod.__dict__)
                funcs = {
                    n: f for n, f in vars(mod).items()
                    if not n.startswith("_") and inspect.isfunction(f)
                }
                if action == "list":
                    out["result"] = sorted(funcs.keys())
                    out["ok"] = True
                else:
                    if fn_name not in funcs:
                        raise LookupError(f"function '{fn_name}' not found")
                    res = funcs[fn_name](*args, **kwargs)
                    out["result"] = res
                    out["ok"] = True
        break
    except ModuleNotFoundError as e:
        mod = getattr(e, "name", None)
        if not mod and "'" in str(e):
            mod = str(e).split("'")[1].split('.')[0]
        if mod and mod not in attempted_installs:
            attempted_installs.add(mod)
            ok, install_err = auto_install_missing(mod)
            if ok:
                buf.seek(0)
                buf.truncate(0)
                continue
            if install_err:
                out["error"] = (f"{type(e).__name__}: {e} | auto-install of '{mod}' failed: {install_err}")[:1500]
            else:
                out["error"] = f"{type(e).__name__}: {e}"[:500]
        else:
            out["error"] = f"{type(e).__name__}: {e}"[:500]
        break
    except BaseException as e:
        out["error"] = f"{type(e).__name__}: {e}"[:500]
        break

out["output"] = buf.getvalue()[:20000]
print(json.dumps(out, default=str))
`;

  return new Promise((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        pyProc.kill('SIGKILL');
        resolve({
          ok: false,
          result: null,
          output: '',
          error: `Execution timed out (${MAX_EXECUTION_TIME_SEC}s)`,
          elapsed_ms: Date.now() - startTime,
          killedBySignal: false,
        });
      }
    }, MAX_EXECUTION_TIME_SEC * 1000);

    const pyProc = spawn('python3', ['-c', runnerScript, action], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PIP_BREAK_SYSTEM_PACKAGES: '1',
        PYTHONUNBUFFERED: '1',
      },
    });

    const payload = JSON.stringify({
      code,
      function: functionName,
      args,
      kwargs,
      stdin,
    });

    pyProc.stdin.write(payload);
    pyProc.stdin.end();

    let stdoutData = '';
    let stderrData = '';

    pyProc.stdout.on('data', (chunk) => {
      stdoutData += chunk.toString();
    });

    pyProc.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    pyProc.on('error', async (err: any) => {
      if (!resolved) {
        clearTimeout(timeout);
        // Fallback directly to Pyodide if python3 is not in system PATH
        if (err.code === 'ENOENT') {
          try {
            const pyodideRes = await executeWithPyodide(code, action, functionName, args, kwargs, stdin, startTime);
            resolved = true;
            return resolve({ ...pyodideRes, killedBySignal: false });
          } catch (pyErr: any) {
            resolved = true;
            return resolve({
              ok: false,
              result: null,
              output: '',
              error: `Python runner unavailable: ${pyErr.message}`,
              elapsed_ms: Date.now() - startTime,
              killedBySignal: false,
            });
          }
        }
        resolved = true;
        resolve({
          ok: false,
          result: null,
          output: '',
          error: `Failed to spawn Python interpreter: ${err.message}`,
          elapsed_ms: Date.now() - startTime,
          killedBySignal: false,
        });
      }
    });

    pyProc.on('close', (codeStatus, signalName) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        const elapsed = Date.now() - startTime;
        try {
          const parsed = JSON.parse(stdoutData.trim());
          resolve({
            ok: Boolean(parsed.ok),
            result: parsed.result ?? null,
            output: parsed.output || '',
            error: parsed.error || (stderrData ? stderrData.trim().slice(0, 500) : ''),
            elapsed_ms: elapsed,
            killedBySignal: false,
          });
        } catch {
          // No valid JSON on stdout and nothing on stderr: the interpreter
          // was torn down before it could report anything. If Node/Bun gave
          // us a signal name (or a negative code, which some runtimes use to
          // encode -signalNumber), it was killed by something outside this
          // function — most likely the host, not the user's code — so flag
          // it for the retry in executePython() rather than a generic error.
          const killedBySignal = Boolean(signalName) || (typeof codeStatus === 'number' && codeStatus < 0);
          const reason = signalName
            ? `Process was killed by signal ${signalName} (the host likely restarted or recycled the container mid-execution)`
            : killedBySignal
              ? `Process was killed (exit code ${codeStatus}, likely signal ${-codeStatus}) — the host likely restarted or recycled the container mid-execution`
              : `Process exited with code ${codeStatus}`;
          resolve({
            ok: false,
            result: null,
            output: stdoutData,
            error: stderrData.trim() || reason,
            elapsed_ms: elapsed,
            killedBySignal,
          });
        }
      }
    });
  });
}

// Client stub generator (as in original stub.py)
function buildStub(
  name: string,
  filename: string,
  url: string,
  key: string,
  packages: string[] = []
): string {
  let cleanUrl = (url || '').trim().replace(/\/+$/, '');
  // Always enforce HTTPS for non-localhost endpoints so redirects don't downgrade POST
  if (cleanUrl.startsWith('http://') && !cleanUrl.includes('localhost') && !cleanUrl.includes('127.0.0.1')) {
    cleanUrl = 'https://' + cleanUrl.slice(7);
  }
  const pkgsJson = JSON.stringify(packages);
  const template = `# -*- coding: utf-8 -*-
"""__NAME__ — Encrypted by Moon
The original source code stays encrypted on the server and executes remotely.
This client stub contains zero business logic and automatically manages dependencies.

Usage:
    python __FILE__                       # Run as script
    python __FILE__ function_name arg1 arg2 ...  # Call function
"""
import json
import os
import sys
import subprocess
import importlib
import site
import tempfile
import urllib.error
import urllib.request


class StrictPostRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Preserves POST method and payload on 301/302 redirects."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        new_req = urllib.request.Request(
            newurl,
            data=req.data,
            headers=dict(req.headers),
            origin_req_host=req.origin_req_host,
            unverifiable=True,
        )
        new_req.get_method = lambda: "POST"
        return new_req


API_URL = "__URL__"
API_KEY = "__KEY__"
REQUIRED_PACKAGES = __PACKAGES_JSON__

PKG_MAP = {
    "bs4": "beautifulsoup4",
    "PIL": "Pillow",
    "cv2": "opencv-python",
    "yaml": "pyyaml",
    "telebot": "pyTelegramBotAPI",
    "telegram": "python-telegram-bot",
    "dotenv": "python-dotenv",
    "jwt": "pyjwt",
    "dateutil": "python-dateutil",
    "sklearn": "scikit-learn",
    "Crypto": "pycryptodome",
    "crypto": "pycryptodome",
    "websocket": "websocket-client",
    "googleapiclient": "google-api-python-client",
    "dns": "dnspython",
    "OpenSSL": "pyOpenSSL",
    "serial": "pyserial",
    "docx": "python-docx",
    "pptx": "python-pptx",
    "fitz": "PyMuPDF",
    "magic": "python-magic",
    "discord": "discord.py",
    "attr": "attrs",
    "pg": "psycopg2-binary",
    "psycopg2": "psycopg2-binary",
    "MySQLdb": "mysqlclient",
    "fake_useragent": "fake-useragent",
    "requests": "requests",
    "urllib3": "urllib3",
    "aiohttp": "aiohttp",
}


def _moon_pkg_dir():
    """A dedicated, always-writable install directory, keyed by Python
    major.minor so it never mixes incompatible wheels across interpreters,
    and cached under the OS temp dir so re-runs on the same host reuse
    installs. This is what makes auto-install work even when the system
    site-packages is read-only or 'externally managed' (PEP 668) — the
    case on many hosted/managed Python images (Render, some VPS images,
    Pydroid, etc.)."""
    base = os.environ.get("MOON_PKG_DIR") or os.path.join(
        tempfile.gettempdir(), "moon_pylibs", f"py{sys.version_info[0]}{sys.version_info[1]}"
    )
    try:
        os.makedirs(base, exist_ok=True)
    except Exception:
        pass
    return base


MOON_PKG_DIR = _moon_pkg_dir()
if MOON_PKG_DIR not in sys.path:
    sys.path.insert(0, MOON_PKG_DIR)


def ensure_packages(packages=None):
    """Auto-detects and installs missing libraries on any Python version (3.6+ to 3.14).
    Works on Linux, Render, VPS, Windows, macOS, and Android Pydroid 3 — including
    environments where the system site-packages is read-only or pip refuses with
    'externally-managed-environment', by falling back to a private --target dir.
    """
    if packages is None:
        packages = REQUIRED_PACKAGES
    if not packages:
        return

    env = os.environ.copy()
    env["PIP_BREAK_SYSTEM_PACKAGES"] = "1"
    env["PIP_DISABLE_PIP_VERSION_CHECK"] = "1"
    env["PYTHONUNBUFFERED"] = "1"

    for mod in packages:
        mod = str(mod).strip()
        if not mod:
            continue
        try:
            __import__(mod)
            continue
        except ImportError:
            pass

        target = PKG_MAP.get(mod, mod)
        sys.stderr.write(f"[*] [Moon] مكتبة ناقصة: '{mod}' -> جارٍ التثبيت التلقائي لـ '{target}'...\\n")
        sys.stderr.flush()

        try:
            import pip  # noqa: F401
        except ImportError:
            try:
                subprocess.run(
                    [sys.executable, "-m", "ensurepip", "--default-pip"],
                    env=env, stdin=subprocess.DEVNULL,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60,
                )
            except Exception:
                pass

        attempts = [
            ["--target", MOON_PKG_DIR, "--quiet", "--no-warn-script-location", "--upgrade", target],
            ["--target", MOON_PKG_DIR, "--quiet", "--break-system-packages", "--upgrade", target],
            ["--quiet", "--no-warn-script-location", target],
            ["--quiet", "--break-system-packages", target],
            ["--user", "--quiet", target],
            ["--user", "--quiet", "--break-system-packages", target],
        ]

        installed = False
        last_err = ""
        for extra in attempts:
            cmd = [sys.executable, "-m", "pip", "install"] + extra
            try:
                res = subprocess.run(
                    cmd,
                    env=env,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=90,
                    text=True,
                )
                if res.returncode == 0:
                    installed = True
                    break
                last_err = ((res.stderr or "") + (res.stdout or "")).strip()[-800:]
            except Exception as e:
                last_err = str(e)

        if MOON_PKG_DIR not in sys.path:
            sys.path.insert(0, MOON_PKG_DIR)
        try:
            user_site = site.getusersitepackages()
            if user_site and user_site not in sys.path:
                sys.path.insert(0, user_site)
        except Exception:
            pass
        try:
            for sp in site.getsitepackages():
                if sp not in sys.path:
                    sys.path.append(sp)
        except Exception:
            pass
        importlib.invalidate_caches()

        try:
            __import__(mod)
            sys.stderr.write(f"[+] [Moon] تم تثبيت '{target}' بنجاح!\\n")
            sys.stderr.flush()
        except ImportError:
            if last_err:
                sys.stderr.write(f"[!] [Moon] فشل تثبيت '{target}': {last_err}\\n")
            else:
                sys.stderr.write(f"[!] [Moon] تعذر تثبيت '{target}' تلقائياً. ثبّتها يدويًا: pip install {target}\\n")
            sys.stderr.flush()


def call(function=None, *args, stdin="", **kwargs):
    # Ensure required packages exist
    try:
        ensure_packages()
    except Exception:
        pass

    # Normalize base endpoint URL and enforce HTTPS for remote servers
    base_url = API_URL.strip().rstrip("/")
    if base_url.startswith("http://") and not ("localhost" in base_url or "127.0.0.1" in base_url):
        base_url = "https://" + base_url[7:]
    endpoint = base_url + "/api/run"

    payload = {
        "function": function,
        "args": list(args),
        "kwargs": kwargs,
        "stdin": stdin,
    }
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
        "User-Agent": "Mozilla/5.0 (compatible; MoonClient/2.0; Linux; Android)",
        "Accept": "application/json",
    }
    req = urllib.request.Request(endpoint, data=body, method="POST", headers=headers)
    opener = urllib.request.build_opener(StrictPostRedirectHandler)

    try:
        with opener.open(req, timeout=__HTTP_TIMEOUT__) as resp:
            status_code = getattr(resp, "status", 200)
            raw_body = resp.read()
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="replace").strip()
        raise SystemExit(f"[{e.code}] Error from {endpoint}: {err_msg}")
    except urllib.error.URLError as e:
        raise SystemExit(
            f"Server connection failed to {endpoint}:\\n"
            f"Reason: {e.reason}\\n"
            f"Please check your internet connection and verify that API_URL is reachable."
        )

    text_resp = raw_body.decode("utf-8", errors="replace").strip()
    if not text_resp:
        raise SystemExit(
            f"Error: Server at {endpoint} returned an empty response.\\n"
            f"Please verify that the Moon API server is online and API_KEY is correct."
        )

    if text_resp.startswith("<!DOCTYPE") or "<html" in text_resp[:100].lower():
        raise SystemExit(
            f"Error: Server returned an HTML web page instead of JSON API response from {endpoint}.\\n"
            f"Please ensure API_URL uses https:// (not http://), e.g. https://remix-moon-ap.ai.studio"
        )

    try:
        data = json.loads(text_resp)
    except Exception:
        raise SystemExit(
            f"Error: Non-JSON response received from {endpoint} (HTTP {status_code}):\\n"
            f"{text_resp[:500]}\\n\\n"
            f"Tip: If this is an authentication or 404 page, verify the PUBLIC_API_URL."
        )

    if data.get("output"):
        print(data["output"], end="")
    if not data.get("success"):
        err = data.get("error", "Remote execution failed")
        if "ModuleNotFoundError" in err or "No module named" in err:
            try:
                missing = ""
                if "'" in err:
                    missing = err.split("'")[1].split(".")[0]
                elif '"' in err:
                    missing = err.split('"')[1].split(".")[0]
                if missing:
                    ensure_packages([missing])
            except Exception:
                pass
        raise RuntimeError(err)
    return data.get("result")


def _parse(v):
    try:
        return json.loads(v)
    except (ValueError, TypeError):
        return v


if __name__ == "__main__":
    ensure_packages()
    if len(sys.argv) > 1:
        res = call(sys.argv[1], *[_parse(a) for a in sys.argv[2:]])
        if res is not None:
            print(res)
    else:
        call(None, stdin="" if sys.stdin.isatty() else sys.stdin.read())
`;
  return template
    .replace(/__NAME__/g, name)
    .replace(/__FILE__/g, filename)
    .replace(/__URL__/g, cleanUrl)
    .replace(/__KEY__/g, key)
    .replace(/__PACKAGES_JSON__/g, pkgsJson)
    .replace(/__HTTP_TIMEOUT__/g, String(MAX_EXECUTION_TIME_SEC + 30));
}

// ---------------- PUBLIC API ENDPOINTS ----------------

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: Math.floor(Date.now() / 1000) });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: Math.floor(Date.now() / 1000) });
});

app.get('/api/system-status', (req, res) => {
  res.json({
    service: 'Moon API',
    status: 'online',
    version: '2.0.0',
    watermark: 'Encrypted by Moon',
    total_projects: projects.size,
    active_keys: Array.from(apiKeys.values()).filter((k) => k.active).length,
    rate_limit_per_hour: RATE_LIMIT_PER_HOUR,
    max_execution_time_sec: MAX_EXECUTION_TIME_SEC,
    default_admin_key_hint: ADMIN_API_KEY.slice(0, 10) + '...',
  });
});

app.get('/api/info', (req, res) => {
  try {
    const authInfo = validateApiKey(req);
    const p = projects.get(authInfo.project_id);
    if (!p) {
      return res.status(404).json({ detail: 'Project not found' });
    }
    return res.json({ project: p.name, expires_at: authInfo.expires_at, project_id: p.id });
  } catch (err: any) {
    return res.status(err.statusCode || 401).json({ detail: err.message });
  }
});

app.get('/api/functions', async (req, res) => {
  try {
    const authInfo = validateApiKey(req);
    const p = projects.get(authInfo.project_id);
    if (!p) {
      return res.status(404).json({ detail: 'Project not found' });
    }
    const code = decryptCode(p.encrypted_code, p.iv);
    const runResult = await executePython(code, 'list');

    requestLogs.unshift({
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      key_id: authInfo.key_id,
      project_id: authInfo.project_id,
      endpoint: '/api/functions',
      ts: Math.floor(Date.now() / 1000),
      ip: authInfo.ip,
      ok: runResult.ok,
      error: runResult.error,
      elapsed_ms: runResult.elapsed_ms,
    });
    if (requestLogs.length > 500) requestLogs.pop();

    if (!runResult.ok) {
      return res.status(500).json({ detail: runResult.error || 'Failed to inspect functions' });
    }
    return res.json({ functions: runResult.result || [] });
  } catch (err: any) {
    return res.status(err.statusCode || 401).json({ detail: err.message });
  }
});

app.get('/api/run', (req, res) => {
  return res.status(405).json({
    error: 'Method Not Allowed',
    detail: 'Use POST /api/run with X-API-Key and application/json payload. Do not use GET.',
  });
});

app.post('/api/run', async (req, res) => {
  try {
    const authInfo = validateApiKey(req);
    const p = projects.get(authInfo.project_id);
    if (!p) {
      return res.status(404).json({ detail: 'Project not found' });
    }

    const { function: fnName, args, kwargs, stdin } = req.body || {};
    const code = decryptCode(p.encrypted_code, p.iv);

    const action = fnName ? 'call' : 'script';
    const runResult = await executePython(code, action, fnName, args || [], kwargs || {}, stdin || '');

    requestLogs.unshift({
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      key_id: authInfo.key_id,
      project_id: authInfo.project_id,
      endpoint: '/api/run',
      ts: Math.floor(Date.now() / 1000),
      ip: authInfo.ip,
      ok: runResult.ok,
      error: runResult.error,
      elapsed_ms: runResult.elapsed_ms,
    });
    if (requestLogs.length > 500) requestLogs.pop();

    return res.json({
      success: runResult.ok,
      result: runResult.result,
      output: runResult.output,
      error: runResult.error,
      elapsed_ms: runResult.elapsed_ms,
    });
  } catch (err: any) {
    return res.status(err.statusCode || 401).json({ detail: err.message });
  }
});

// Client stub generator route
app.get('/api/client-stub', (req, res) => {
  const projectId = req.query.project_id as string;
  const apiKey = req.query.api_key as string;
  const publicUrl = (req.query.public_url as string) || getEffectivePublicUrl(req);

  if (!projectId || !projects.has(projectId)) {
    return res.status(404).json({ detail: 'Project not found' });
  }
  const p = projects.get(projectId)!;
  const stubCode = buildStub(p.name, p.name, publicUrl, apiKey || 'moon_YOUR_KEY_HERE', p.required_packages || []);

  if (req.query.download === 'true') {
    res.setHeader('Content-Disposition', `attachment; filename="${p.name.replace(/\.py$/, '')}_client.py"`);
    res.setHeader('Content-Type', 'text/x-python');
    return res.send(stubCode);
  }

  return res.json({
    project_id: projectId,
    project_name: p.name,
    client_code: stubCode,
    public_url: publicUrl,
    required_packages: p.required_packages || [],
  });
});

// ---------------- ADMIN ENDPOINTS ----------------

app.post('/admin/projects', (req, res) => {
  try {
    verifyAdmin(req);
    const { owner_id, name, code } = req.body || {};
    if (!name || typeof code !== 'string') {
      return res.status(400).json({ detail: 'Invalid parameters: "name" and "code" are required' });
    }

    const pid = 'p_' + crypto.randomBytes(4).toString('hex');
    const enc = encryptCode(code);
    const size = Buffer.byteLength(code, 'utf8');
    const requiredPackages = extractPythonImports(code);

    projects.set(pid, {
      id: pid,
      owner_id: owner_id || 1,
      name: name.slice(0, 100),
      size,
      created_at: Math.floor(Date.now() / 1000),
      encrypted_code: enc.encrypted,
      iv: enc.iv,
      required_packages: requiredPackages,
    });
    saveStoreToDisk();

    return res.json({ project_id: pid, required_packages: requiredPackages });
  } catch (err: any) {
    return res.status(err.statusCode || 400).json({ detail: err.message });
  }
});

app.get('/admin/projects', (req, res) => {
  try {
    verifyAdmin(req);
    const list = Array.from(projects.values()).map((p) => ({
      id: p.id,
      owner_id: p.owner_id,
      name: p.name,
      size: p.size,
      created_at: p.created_at,
    }));
    return res.json({ projects: list });
  } catch (err: any) {
    return res.status(err.statusCode || 400).json({ detail: err.message });
  }
});

app.delete('/admin/projects/:project_id', (req, res) => {
  try {
    verifyAdmin(req);
    const { project_id } = req.params;
    const exists = projects.delete(project_id);

    // Also deactivate associated keys
    for (const key of apiKeys.values()) {
      if (key.project_id === project_id) {
        key.active = false;
      }
    }

    return res.json({ deleted: exists });
  } catch (err: any) {
    return res.status(err.statusCode || 400).json({ detail: err.message });
  }
});

app.post('/admin/keys', (req, res) => {
  try {
    verifyAdmin(req);
    const { project_id, owner_id, duration, notes } = req.body || {};
    if (!project_id || !projects.has(project_id)) {
      return res.status(404).json({ detail: 'Project not found' });
    }

    const ttl = duration || API_KEY_TTL;
    const rawKey = 'moon_' + crypto.randomBytes(24).toString('base64url');
    const keyId = 'k_' + crypto.randomBytes(4).toString('hex');
    const now = Math.floor(Date.now() / 1000);

    apiKeys.set(keyId, {
      key_id: keyId,
      key_hash: hashKey(rawKey),
      project_id,
      owner_id: owner_id || 0,
      created_at: now,
      expires_at: now + ttl,
      window_start: now,
      window_count: 0,
      total_requests: 0,
      active: true,
      notes: notes || '',
    });

    return res.json({
      api_key: rawKey,
      key_id: keyId,
      expires_in: ttl,
    });
  } catch (err: any) {
    return res.status(err.statusCode || 400).json({ detail: err.message });
  }
});

app.get('/admin/keys', (req, res) => {
  try {
    verifyAdmin(req);
    const projectId = req.query.project_id as string | undefined;
    let list = Array.from(apiKeys.values());
    if (projectId) {
      list = list.filter((k) => k.project_id === projectId);
    }
    const formatted = list.map((k) => ({
      key_id: k.key_id,
      project_id: k.project_id,
      created_at: k.created_at,
      expires_at: k.expires_at,
      total_requests: k.total_requests,
      active: k.active,
      notes: k.notes,
    }));
    return res.json({ keys: formatted });
  } catch (err: any) {
    return res.status(err.statusCode || 400).json({ detail: err.message });
  }
});

app.delete('/admin/keys/:key_id', (req, res) => {
  try {
    verifyAdmin(req);
    const { key_id } = req.params;
    const key = apiKeys.get(key_id);
    if (!key) {
      return res.json({ revoked: false });
    }
    key.active = false;
    return res.json({ revoked: true });
  } catch (err: any) {
    return res.status(err.statusCode || 400).json({ detail: err.message });
  }
});

app.get('/admin/logs', (req, res) => {
  try {
    verifyAdmin(req);
    return res.json({ logs: requestLogs.slice(0, 100) });
  } catch (err: any) {
    return res.status(err.statusCode || 400).json({ detail: err.message });
  }
});

// App configuration helper for frontend dev convenience
app.get('/api/dev-config', requireSetupAuth, (req, res) => {
  res.json({
    adminApiKey: ADMIN_API_KEY,
    demoApiKey: DEMO_API_KEY,
    demoProjectId: DEMO_PROJECT_ID,
    publicApiUrl: getEffectivePublicUrl(req),
  });
});

app.get('/api/public-url', (req, res) => {
  res.json({
    url: getEffectivePublicUrl(req),
    custom: customPublicApiUrl || null,
    detected: detectedPublicUrl || null,
    env: PUBLIC_API_URL || null,
  });
});

app.post('/api/public-url', requireSetupAuth, (req, res) => {
  const { url } = req.body || {};
  if (typeof url === 'string') {
    customPublicApiUrl = url.trim().replace(/\/+$/, '');
  }
  res.json({ ok: true, url: getEffectivePublicUrl(req) });
});

// Root API response (matches original server.py root)
app.get('/api', (req, res) => {
  res.json({ service: 'Moon API', status: 'online', watermark: 'Encrypted by Moon' });
});

// ---------------- SETUP PAGE (password-protected bot token / IDs) ----------------

const envSetupPassword = process.env.SETUP_PASSWORD?.trim();
const SETUP_PASSWORD = envSetupPassword || ADMIN_API_KEY;
const SETUP_COOKIE = 'moon_setup';
const setupSessionToken = crypto.createHmac('sha256', SETUP_PASSWORD).update('moon-setup-session').digest('hex');

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function getCookie(req: Request, name: string): string {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1 && part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return '';
}

function isSetupAuthed(req: Request): boolean {
  const adminHeader = req.headers['x-admin-key'];
  if (typeof adminHeader === 'string' && safeEqual(adminHeader, ADMIN_API_KEY)) return true;
  return safeEqual(getCookie(req, SETUP_COOKIE), setupSessionToken);
}

function requireSetupAuth(req: Request, res: Response, next: NextFunction) {
  if (isSetupAuthed(req)) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function setupPage(body: string): string {
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Moon Setup</title>
<style>body{font-family:system-ui,sans-serif;background:#fff;color:#111;max-width:420px;margin:40px auto;padding:0 16px}input{width:100%;padding:10px;margin:6px 0 14px;box-sizing:border-box;border:1px solid #ccc;border-radius:6px}button{padding:10px 16px;border:0;border-radius:6px;background:#111;color:#fff;cursor:pointer}.err{color:#c00}.muted{color:#666;font-size:13px}a{color:#06c}</style>
</head><body>${body}</body></html>`;
}

function publicDomain(req: Request): string {
  return getEffectivePublicUrl(req).replace(/^https?:\/\//, '');
}

app.use('/setup', express.urlencoded({ extended: false }));

app.get('/', (req, res, next) => {
  if (req.query.setup !== undefined) return res.redirect('/setup');
  const tg = telegramBot.getState();
  if (!tg.token) return res.redirect('/setup');
  res.json({
    status: 'ok',
    service: 'Moon API Telegram Bot',
    bot: tg.botInfo?.username ? `@${tg.botInfo.username}` : null,
    running: tg.running,
    domain: publicDomain(req),
  });
});

app.get('/setup', (req, res) => {
  if (!isSetupAuthed(req)) {
    const err = req.query.error ? '<p class="err">كلمة السر غير صحيحة</p>' : '';
    return res.send(setupPage(`<h2>تسجيل الدخول</h2>${err}
<form method="POST" action="/setup/login"><label>كلمة السر</label><input type="password" name="password" required autofocus><button type="submit">دخول</button></form>`));
  }
  const tg = telegramBot.getState();
  const status = tg.token
    ? `<p class="muted">البوت: ${tg.botInfo?.username ? '@' + escapeHtml(tg.botInfo.username) : '-'} — ${tg.running ? 'يعمل' : 'متوقف'}${tg.lastError ? ' — ' + escapeHtml(tg.lastError) : ''}</p>`
    : '<p class="muted">لم يتم تثبيت توكن البوت بعد.</p>';
  const saved = req.query.saved ? '<p>تم الحفظ.</p>' : '';
  res.send(setupPage(`<h2>إعداد بوت تيليجرام</h2>${status}${saved}
<form method="POST" action="/setup"><label>توكن البوت</label><input type="text" name="token" placeholder="${tg.token ? 'اتركه فارغاً للإبقاء على التوكن الحالي' : '123456:ABC...'}" autocomplete="off">
<label>الآيدي المسموح بها (مفصولة بفاصلة)</label><input type="text" name="allowedIds" value="${escapeHtml(tg.allowedIds.join(','))}">
<button type="submit">حفظ</button></form>
<p><a href="/">عرض الحالة</a> · <a href="/dashboard">لوحة التحكم</a></p>
<form method="POST" action="/setup/logout"><button type="submit">خروج</button></form>`));
});

app.post('/setup/login', (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!safeEqual(password, SETUP_PASSWORD)) return res.redirect('/setup?error=1');
  res.setHeader('Set-Cookie', `${SETUP_COOKIE}=${setupSessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`);
  res.redirect('/setup');
});

app.post('/setup/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${SETUP_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.redirect('/setup');
});

app.post('/setup', (req, res) => {
  if (!isSetupAuthed(req)) return res.redirect('/setup');
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const idsRaw = typeof req.body?.allowedIds === 'string' ? req.body.allowedIds : '';
  const allowedIds: number[] = Array.from(new Set<number>(idsRaw.split(',').map((x: string) => parseInt(x.trim(), 10)).filter((n: number) => !isNaN(n))));
  telegramBot.updateConfig({ ...(token ? { token } : {}), allowedIds });
  saveStoreToDisk();
  res.redirect(token ? '/' : '/setup?saved=1');
});

app.get('/dashboard', (req, res, next) => {
  if (!isSetupAuthed(req)) return res.redirect('/setup');
  if (process.env.NODE_ENV !== 'production') {
    req.url = '/';
    return next();
  }
  res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
});

// ---------------- TELEGRAM BOT API & INTEGRATION ----------------

const tgPersisted = persistedTelegram as PersistedTelegramConfig | null;
telegramBot.init(
  tgPersisted?.token || rawBotToken,
  tgPersisted?.allowedIds?.length ? tgPersisted.allowedIds : parsedAllowedIds,
  tgPersisted?.publicMode ?? initialPublicMode,
  MAX_PROJECTS_PER_USER,
  {
    createProject: async (ownerId, name, code) => {
      const pid = 'p_' + crypto.randomBytes(4).toString('hex');
      const enc = encryptCode(code);
      const size = Buffer.byteLength(code, 'utf8');
      const requiredPackages = extractPythonImports(code);
      projects.set(pid, {
        id: pid,
        owner_id: ownerId,
        name: name.slice(0, 100),
        size,
        created_at: Math.floor(Date.now() / 1000),
        encrypted_code: enc.encrypted,
        iv: enc.iv,
        required_packages: requiredPackages,
      });
      saveStoreToDisk();
      return pid;
    },
    createKey: async (projectId, ownerId, duration, notes) => {
      const ttl = duration || API_KEY_TTL;
      const rawKey = 'moon_' + crypto.randomBytes(24).toString('base64url');
      const keyId = 'k_' + crypto.randomBytes(4).toString('hex');
      const now = Math.floor(Date.now() / 1000);
      apiKeys.set(keyId, {
        key_id: keyId,
        key_hash: hashKey(rawKey),
        project_id: projectId,
        owner_id: ownerId,
        created_at: now,
        expires_at: now + ttl,
        window_start: now,
        window_count: 0,
        total_requests: 0,
        active: true,
        notes,
      });
      saveStoreToDisk();
      return { rawKey, keyId };
    },
    listProjects: (ownerId) => {
      let list = Array.from(projects.values());
      if (ownerId !== undefined) {
        list = list.filter((p) => p.owner_id === ownerId);
      }
      return list.map((p) => ({
        id: p.id,
        name: p.name,
        size: p.size,
        created_at: p.created_at,
        owner_id: p.owner_id,
        required_packages: p.required_packages || [],
      }));
    },
    getProject: (projectId: string) => {
      const p = projects.get(projectId);
      if (!p) return undefined;
      return {
        id: p.id,
        name: p.name,
        required_packages: p.required_packages || [],
      };
    },
    deleteProject: (projectId, ownerId) => {
      const p = projects.get(projectId);
      if (!p) return false;
      if (ownerId !== undefined && p.owner_id !== ownerId) return false;
      projects.delete(projectId);
      for (const k of apiKeys.values()) {
        if (k.project_id === projectId) k.active = false;
      }
      saveStoreToDisk();
      return true;
    },
    listKeys: (ownerId, projectId) => {
      let list = Array.from(apiKeys.values());
      if (ownerId !== undefined) list = list.filter((k) => k.owner_id === ownerId);
      if (projectId) list = list.filter((k) => k.project_id === projectId);
      return list.map((k) => ({
        key_id: k.key_id,
        project_id: k.project_id,
        created_at: k.created_at,
        expires_at: k.expires_at,
        active: k.active,
        notes: k.notes,
      }));
    },
    revokeKey: (keyId, ownerId) => {
      const k = apiKeys.get(keyId);
      if (!k) return false;
      if (ownerId !== undefined && k.owner_id !== ownerId) return false;
      k.active = false;
      saveStoreToDisk();
      return true;
    },
    buildStub,
    extractImports: extractPythonImports,
    getPublicApiUrl: () => {
      return getEffectivePublicUrl();
    },
    defaultTtl: API_KEY_TTL,
  }
);

app.get('/api/telegram/status', requireSetupAuth, (req, res) => {
  res.json(telegramBot.getState());
});

app.post('/api/telegram/config', requireSetupAuth, (req, res) => {
  const { token, publicMode, allowedIds } = req.body || {};
  telegramBot.updateConfig({ token, publicMode, allowedIds });
  saveStoreToDisk();
  res.json({ ok: true, state: telegramBot.getState() });
});

app.post('/api/telegram/authorize-user', requireSetupAuth, (req, res) => {
  const { userId } = req.body || {};
  if (!userId || typeof userId !== 'number') {
    return res.status(400).json({ error: 'Valid numeric userId is required' });
  }
  telegramBot.addAllowedId(userId);
  saveStoreToDisk();
  res.json({ ok: true, state: telegramBot.getState() });
});

app.post('/api/telegram/remove-user', requireSetupAuth, (req, res) => {
  const { userId } = req.body || {};
  if (!userId || typeof userId !== 'number') {
    return res.status(400).json({ error: 'Valid numeric userId is required' });
  }
  telegramBot.removeAllowedId(userId);
  saveStoreToDisk();
  res.json({ ok: true, state: telegramBot.getState() });
});

app.post('/api/telegram/restart', requireSetupAuth, async (req, res) => {
  const started = await telegramBot.restart();
  res.json({ ok: started, state: telegramBot.getState() });
});

app.post('/api/telegram/simulate', requireSetupAuth, async (req, res) => {
  const { userId = 12345678, username = 'test_developer', text, document } = req.body || {};
  await telegramBot.simulateMessage(userId, username, text, document);
  res.json({ ok: true, state: telegramBot.getState() });
});

app.post('/api/telegram/webhook', async (req, res) => {
  if (req.body?.message) {
    await telegramBot.handleMessage(req.body.message);
  }
  res.sendStatus(200);
});

// ---------------- FRONTEND INTEGRATION ----------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath, { index: false }));
      app.get('*', (req, res) => {
        res.status(404).json({
          error: 'Not Found',
          detail: `Endpoint ${req.method} ${req.path} not found.`,
        });
      });
    }
  }

  app.listen(PORT, HOST, () => {
    console.log(`🌙 Moon API server listening on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
