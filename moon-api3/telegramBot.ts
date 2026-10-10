import { spawn } from 'node:child_process';

export function escapeHtml(str: string = ''): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface TelegramBotState {
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

export interface BotContext {
  createProject: (ownerId: number, name: string, code: string) => Promise<string>;
  createKey: (projectId: string, ownerId: number, duration: number, notes: string) => Promise<{ rawKey: string; keyId: string }>;
  listProjects: (ownerId?: number) => Array<{ id: string; name: string; size: number; created_at: number; owner_id: number; required_packages?: string[] }>;
  getProject: (projectId: string) => { id: string; name: string; required_packages?: string[] } | undefined;
  deleteProject: (projectId: string, ownerId?: number) => boolean;
  listKeys: (ownerId?: number, projectId?: string) => Array<{ key_id: string; project_id: string; created_at: number; expires_at: number; active: boolean; notes: string }>;
  revokeKey: (keyId: string, ownerId?: number) => boolean;
  buildStub: (name: string, filename: string, url: string, key: string, packages?: string[]) => string;
  extractImports?: (code: string) => string[];
  getPublicApiUrl: () => string;
  defaultTtl: number;
}

class TelegramBotManager {
  private state: TelegramBotState = {
    token: '',
    running: false,
    botInfo: null,
    publicMode: true, // Default to true or config so owner can immediately use it
    allowedIds: [],
    maxProjectsPerUser: 10,
    lastError: null,
    lastPollTime: null,
    totalMessagesProcessed: 0,
    recentActivity: [],
    unauthorizedAttempts: [],
  };

  private context: BotContext | null = null;
  private pollAbortController: AbortController | null = null;
  private offset = 0;
  private isPolling = false;

  public init(token: string, allowedIds: number[], publicMode: boolean, maxProjects: number, context: BotContext) {
    this.state.token = token.trim();
    this.state.allowedIds = allowedIds;
    this.state.publicMode = publicMode;
    this.state.maxProjectsPerUser = maxProjects;
    this.context = context;

    if (this.state.token) {
      this.start();
    }
  }

  public getState(): TelegramBotState {
    return { ...this.state };
  }

  public updateConfig(config: { token?: string; publicMode?: boolean; allowedIds?: number[] }) {
    let restartNeeded = false;

    if (config.token !== undefined && config.token.trim() !== this.state.token) {
      this.state.token = config.token.trim();
      restartNeeded = true;
    }

    if (config.publicMode !== undefined) {
      this.state.publicMode = config.publicMode;
    }

    if (config.allowedIds !== undefined) {
      this.state.allowedIds = config.allowedIds;
    }

    if (restartNeeded) {
      this.restart();
    }
  }

  public addAllowedId(id: number) {
    if (!this.state.allowedIds.includes(id)) {
      this.state.allowedIds.push(id);
    }
    // Remove from unauthorized attempts
    this.state.unauthorizedAttempts = this.state.unauthorizedAttempts.filter((u) => u.userId !== id);
  }

  public removeAllowedId(id: number) {
    this.state.allowedIds = this.state.allowedIds.filter((x) => x !== id);
  }

  public async start(): Promise<boolean> {
    if (this.state.running) {
      return true;
    }

    if (!this.state.token) {
      this.state.lastError = 'No bot token provided';
      return false;
    }

    try {
      // Validate token with getMe
      const res = await fetch(`https://api.telegram.org/bot${this.state.token}/getMe`);
      const data = await res.json();

      if (!data.ok) {
        this.state.lastError = `Telegram API error: ${data.description || 'Invalid token'}`;
        this.state.running = false;
        return false;
      }

      this.state.botInfo = {
        id: data.result.id,
        username: data.result.username,
        firstName: data.result.first_name,
      };
      this.state.lastError = null;
      this.state.running = true;

      // Start long polling loop
      this.startPollingLoop();
      console.log(`🤖 Telegram Bot started: @${data.result.username} (ID: ${data.result.id})`);
      return true;
    } catch (err: any) {
      this.state.lastError = `Connection failed: ${err.message}`;
      this.state.running = false;
      return false;
    }
  }

  public stop() {
    this.state.running = false;
    if (this.pollAbortController) {
      this.pollAbortController.abort();
      this.pollAbortController = null;
    }
    this.isPolling = false;
  }

  public restart() {
    this.stop();
    return this.start();
  }

  private async startPollingLoop() {
    if (this.isPolling) return;
    this.isPolling = true;

    while (this.state.running) {
      try {
        this.pollAbortController = new AbortController();
        this.state.lastPollTime = Math.floor(Date.now() / 1000);

        const url = `https://api.telegram.org/bot${this.state.token}/getUpdates?offset=${this.offset}&timeout=20&allowed_updates=${encodeURIComponent(JSON.stringify(['message']))}`;
        const response = await fetch(url, { signal: this.pollAbortController.signal });

        if (!response.ok) {
          const errText = await response.text();
          this.state.lastError = `getUpdates HTTP ${response.status}: ${errText}`;
          await new Promise((r) => setTimeout(r, 4000));
          continue;
        }

        const data = await response.json();
        if (data.ok && Array.isArray(data.result)) {
          this.state.lastError = null;
          for (const update of data.result) {
            this.offset = Math.max(this.offset, update.update_id + 1);
            if (update.message) {
              await this.handleMessage(update.message);
            }
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
          break;
        }
        this.state.lastError = `Polling error: ${err.message}`;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    this.isPolling = false;
  }

  private isAllowed(userId: number): boolean {
    if (this.state.publicMode) return true;
    return this.state.allowedIds.includes(userId);
  }

  private logActivity(activity: {
    userId: number;
    username?: string;
    type: 'message' | 'command' | 'document' | 'unauthorized';
    text?: string;
    details: string;
    status: 'ok' | 'rejected' | 'error';
  }) {
    this.state.totalMessagesProcessed += 1;
    this.state.recentActivity.unshift({
      id: 'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      timestamp: Math.floor(Date.now() / 1000),
      ...activity,
    });
    if (this.state.recentActivity.length > 100) {
      this.state.recentActivity.pop();
    }
  }

  public async sendMessage(chatId: number, text: string, parseMode: string = 'HTML') {
    if (!this.state.token) return;
    try {
      const payload: any = {
        chat_id: chatId,
        text,
      };
      if (parseMode) {
        payload.parse_mode = parseMode;
      }
      const res = await fetch(`https://api.telegram.org/bot${this.state.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn('sendMessage HTTP error:', res.status, errText);
        // Fallback: If Telegram failed due to unparsed HTML/Markdown entities, send as clean plain text
        if (parseMode) {
          const plainText = text.replace(/<[^>]*>/g, '');
          await fetch(`https://api.telegram.org/bot${this.state.token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: plainText,
            }),
            signal: AbortSignal.timeout(10000),
          });
        }
      }
    } catch (err: any) {
      console.error('Failed to send Telegram message:', err.message);
    }
  }

  public async sendDocument(chatId: number, fileContent: string, filename: string, caption?: string) {
    if (!this.state.token) return;
    try {
      const formData = new FormData();
      formData.append('chat_id', chatId.toString());
      if (caption) {
        formData.append('caption', caption);
        formData.append('parse_mode', 'HTML');
      }

      const file = new File([fileContent], filename, { type: 'text/plain' });
      formData.append('document', file);

      const res = await fetch(`https://api.telegram.org/bot${this.state.token}/sendDocument`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) {
        const body = await res.text();
        console.warn('sendDocument failed, retrying without HTML parse mode on caption:', body);

        // Retry 1: send with plain text caption (stripping HTML tags that might fail entity parsing)
        const retryForm = new FormData();
        retryForm.append('chat_id', chatId.toString());
        if (caption) {
          retryForm.append('caption', caption.replace(/<[^>]*>/g, ''));
        }
        retryForm.append('document', new File([fileContent], filename, { type: 'text/plain' }));

        const retryRes = await fetch(`https://api.telegram.org/bot${this.state.token}/sendDocument`, {
          method: 'POST',
          body: retryForm,
          signal: AbortSignal.timeout(20000),
        });

        if (!retryRes.ok) {
          const secondErr = await retryRes.text();
          console.error('sendDocument retry failed:', secondErr);
          // Retry 2: If file transmission fails on Telegram side, send the client stub code as message
          await this.sendMessage(
            chatId,
            `📎 <b>كود العميل (${escapeHtml(filename)}):</b>\n<pre><code class="language-python">${escapeHtml(fileContent)}</code></pre>`
          );
        }
      }
    } catch (err: any) {
      console.error('Failed to send Telegram document:', err.message);
      try {
        await this.sendMessage(
          chatId,
          `📎 <b>كود العميل (${escapeHtml(filename)}):</b>\n<pre><code class="language-python">${escapeHtml(fileContent)}</code></pre>`
        );
      } catch {}
    }
  }

  public async handleMessage(message: any) {
    if (!this.context) return;

    const chatId = message.chat.id;
    const fromUser = message.from || {};
    const userId = fromUser.id;
    const username = fromUser.username ? `@${fromUser.username}` : fromUser.first_name || 'User';

    // Guard Check
    if (!this.isAllowed(userId)) {
      if (!this.state.unauthorizedAttempts.some((u) => u.userId === userId)) {
        this.state.unauthorizedAttempts.unshift({
          userId,
          username: fromUser.username,
          firstName: fromUser.first_name,
          timestamp: Math.floor(Date.now() / 1000),
        });
      }

      this.logActivity({
        userId,
        username,
        type: 'unauthorized',
        text: message.text || (message.document ? 'Document: ' + message.document.file_name : ''),
        details: `Access denied. User ID ${userId} is not in ALLOWED_IDS.`,
        status: 'rejected',
      });

      await this.sendMessage(
        chatId,
        `❌ <b>غير مصرح لك باستخدام البوت حالياً.</b>\n\n` +
        `🆔 معرّفك الشخصي: <code>${userId}</code>\n\n` +
        `⚙️ <b>كيفية الحل:</b>\n` +
        `1. افتح لوحة التحكم (Moon API Dashboard).\n` +
        `2. اذهب إلى تبويب <b>Telegram Bot</b>.\n` +
        `3. اضغط على <b>Authorize User</b> بجانب معرّفك، أو فعّل خيار <b>Public Mode</b>.`
      );
      return;
    }

    // Command / Text handling
    const text = message.text ? message.text.trim() : '';

    if (text.startsWith('/start') || text.startsWith('/help')) {
      const helpMsg =
        `🌙 <b>Moon API — حماية أكواد بايثون (Server-Side)</b>\n\n` +
        `أرسل لي أي ملف <code>.py</code> وسأقوم بتشفيره وحفظه على السيرفر، وسأعطيك <b>مفتاح API</b> و<b>ملف عميل جاهز (client.py)</b> لا يحتوي على أي كود أصلي.\n\n` +
        `<b>الأوامر المتاحة:</b>\n` +
        `📁 /projects — عرض مشاريعك المحفوظة\n` +
        `🔑 /newkey &lt;project_id&gt; [ساعات] — إصدار مفتاح جديد + ملف عميل\n` +
        `📜 /keys — استعراض مفاتيحك النشطة\n` +
        `🚫 /revoke &lt;key_id&gt; — إبطال مفتاح\n` +
        `🗑️ /delete &lt;project_id&gt; — حذف مشروع نهائياً\n\n` +
        `🚀 <i>جرّب الآن: أرسل أي ملف .py إلى المحادثة!</i>`;

      this.logActivity({
        userId,
        username,
        type: 'command',
        text: '/start',
        details: 'Sent start/help menu',
        status: 'ok',
      });

      await this.sendMessage(chatId, helpMsg);
      return;
    }

    if (text.startsWith('/projects')) {
      const userProjects = this.context.listProjects(userId);
      let reply = `📂 <b>مشاريعك المحفوظة (${userProjects.length}):</b>\n\n`;

      if (userProjects.length === 0) {
        reply += `لا يوجد مشاريع محفوظة بعد.\nأرسل ملف <code>.py</code> لإنشاء أول مشروع!`;
      } else {
        for (const p of userProjects) {
          reply += `• <b>${p.name}</b>\n  🆔 ID: <code>${p.id}</code>\n  💾 الحجم: ${p.size} بايت\n  📅 التاريخ: ${new Date(p.created_at * 1000).toLocaleDateString()}\n\n`;
        }
      }

      this.logActivity({
        userId,
        username,
        type: 'command',
        text: '/projects',
        details: `Listed ${userProjects.length} projects`,
        status: 'ok',
      });

      await this.sendMessage(chatId, reply);
      return;
    }

    if (text.startsWith('/keys')) {
      const userKeys = this.context.listKeys(userId);
      let reply = `🔑 <b>مفاتيح API الخاصة بك (${userKeys.length}):</b>\n\n`;

      if (userKeys.length === 0) {
        reply += `لا توجد مفاتيح مسجلة لك حالياً.`;
      } else {
        for (const k of userKeys) {
          const statusStr = k.active ? '🟢 نشط' : '🔴 ملغى';
          reply += `• <b>${k.key_id}</b> (${statusStr})\n  📁 مشروع: <code>${k.project_id}</code>\n  ⏳ ينتهي: ${new Date(k.expires_at * 1000).toLocaleString()}\n\n`;
        }
      }

      this.logActivity({
        userId,
        username,
        type: 'command',
        text: '/keys',
        details: `Listed ${userKeys.length} keys`,
        status: 'ok',
      });

      await this.sendMessage(chatId, reply);
      return;
    }

    if (text.startsWith('/newkey')) {
      const parts = text.split(/\s+/).slice(1);
      if (parts.length === 0) {
        await this.sendMessage(chatId, `⚠️ الاستخدام: <code>/newkey &lt;project_id&gt; [ساعات]</code>`);
        return;
      }

      const projectId = parts[0];
      const hours = parts[1] ? parseFloat(parts[1]) || 24 : 24;
      const durationSec = Math.floor(hours * 3600);

      const projects = this.context.listProjects(userId);
      const targetProj = projects.find((p) => p.id === projectId);

      if (!targetProj) {
        await this.sendMessage(chatId, `❌ المشروع <code>${projectId}</code> غير موجود أو لا تملكه.`);
        return;
      }

      try {
        const { rawKey, keyId } = await this.context.createKey(
          projectId,
          userId,
          durationSec,
          `Generated via Telegram by ${username}`
        );

        const fname = targetProj.name.endsWith('.py') ? targetProj.name : `${targetProj.name}.py`;
        const pkgs = targetProj.required_packages || [];
        const clientStub = this.context.buildStub(
          targetProj.name,
          fname,
          this.context.getPublicApiUrl(),
          rawKey,
          pkgs
        );

        const keyMessage =
          `✅ <b>تم إصدار مفتاح جديد بنجاح!</b>\n\n` +
          `📁 مشروع: <code>${escapeHtml(projectId)}</code>\n` +
          `🔑 المفتاح: <code>${escapeHtml(rawKey)}</code>\n` +
          `🆔 key_id: <code>${escapeHtml(keyId)}</code>\n` +
          `⏳ الصلاحية: ${hours} ساعة\n` +
          `📦 المكتبات المكتشفة: <code>${pkgs.length > 0 ? escapeHtml(pkgs.join(', ')) : 'لا توجد'}</code>\n\n` +
          `⚠️ <i>احفظ المفتاح الآن، لن يُعرض بالكامل مرة أخرى!</i>`;

        await this.sendMessage(chatId, keyMessage);

        this.logActivity({
          userId,
          username,
          type: 'command',
          text: `/newkey ${projectId}`,
          details: `Issued key ${keyId} for ${projectId}`,
          status: 'ok',
        });

        await this.sendDocument(chatId, clientStub, fname, `📁 ملف العميل: ${fname}\n🔑 المفتاح: ${rawKey}\n⚡ تثبيت تلقائي للمكتبات على أي نسخة بايثون`);
      } catch (err: any) {
        await this.sendMessage(chatId, `❌ فشل إصدار المفتاح: ${escapeHtml(err.message)}`);
      }
      return;
    }

    if (text.startsWith('/revoke')) {
      const parts = text.split(/\s+/).slice(1);
      if (parts.length === 0) {
        await this.sendMessage(chatId, `⚠️ الاستخدام: <code>/revoke &lt;key_id&gt;</code>`);
        return;
      }

      const keyId = parts[0];
      const success = this.context.revokeKey(keyId, userId);

      this.logActivity({
        userId,
        username,
        type: 'command',
        text: `/revoke ${keyId}`,
        details: success ? `Revoked key ${keyId}` : `Key ${keyId} not found or unauthorized`,
        status: success ? 'ok' : 'rejected',
      });

      if (success) {
        await this.sendMessage(chatId, `✅ تم إبطال المفتاح <code>${escapeHtml(keyId)}</code> بنجاح.`);
      } else {
        await this.sendMessage(chatId, `❌ لم يتم العثور على المفتاح <code>${escapeHtml(keyId)}</code> أو لا تملكه.`);
      }
      return;
    }

    if (text.startsWith('/delete')) {
      const parts = text.split(/\s+/).slice(1);
      if (parts.length === 0) {
        await this.sendMessage(chatId, `⚠️ الاستخدام: <code>/delete &lt;project_id&gt;</code>`);
        return;
      }

      const projectId = parts[0];
      const success = this.context.deleteProject(projectId, userId);

      this.logActivity({
        userId,
        username,
        type: 'command',
        text: `/delete ${projectId}`,
        details: success ? `Deleted project ${projectId}` : `Project ${projectId} not found`,
        status: success ? 'ok' : 'rejected',
      });

      if (success) {
        await this.sendMessage(chatId, `✅ تم حذف المشروع <code>${escapeHtml(projectId)}</code> وجميع مفاتيحه المرتبطة.`);
      } else {
        await this.sendMessage(chatId, `❌ لم يتم العثور على المشروع <code>${escapeHtml(projectId)}</code> أو لا تملكه.`);
      }
      return;
    }

    // Document handling (.py file upload)
    if (message.document) {
      const doc = message.document;
      const fileName = doc.file_name || 'project.py';

      if (!fileName.endsWith('.py')) {
        await this.sendMessage(chatId, `⚠️ يُرجى إرسال ملف ينتهي بـ <code>.py</code> فقط.`);
        return;
      }

      if (doc.file_size && doc.file_size > 512 * 1024) {
        await this.sendMessage(chatId, `❌ حجم الملف كبير جداً (الحد الأقصى 512 كيلوبايت).`);
        return;
      }

      // Check max projects per user
      const userProjects = this.context.listProjects(userId);
      if (userProjects.length >= this.state.maxProjectsPerUser) {
        await this.sendMessage(
          chatId,
          `❌ تجاوزت الحد الأقصى للمشاريع (${this.state.maxProjectsPerUser}). استخدم <code>/delete &lt;id&gt;</code> لحذف مشروع قديم أولاً.`
        );
        return;
      }

      await this.sendMessage(chatId, `⏳ جارٍ استلام الملف وتشفيره والتحقق منه...`);

      try {
        let codeText = (doc as any).direct_content;

        if (!codeText) {
          // Download document file from Telegram
          const fileInfoRes = await fetch(
            `https://api.telegram.org/bot${this.state.token}/getFile?file_id=${encodeURIComponent(doc.file_id)}`,
            { signal: AbortSignal.timeout(15000) }
          );

          if (!fileInfoRes.ok) {
            const errTxt = await fileInfoRes.text();
            throw new Error(`تعذر جلب بيانات الملف من تيليجرام (${fileInfoRes.status}): ${errTxt}`);
          }

          const fileInfo = await fileInfoRes.json();

          if (!fileInfo.ok || !fileInfo.result?.file_path) {
            throw new Error(fileInfo.description || 'لم يتم العثور على مسار الملف في تيليجرام');
          }

          const downloadUrl = `https://api.telegram.org/file/bot${this.state.token}/${fileInfo.result.file_path}`;
          const fileContentRes = await fetch(downloadUrl, { signal: AbortSignal.timeout(20000) });

          if (!fileContentRes.ok) {
            throw new Error(`تعذر تنزيل الملف من خوادم تيليجرام (${fileContentRes.status})`);
          }

          codeText = await fileContentRes.text();
        }

        if (!codeText || typeof codeText !== 'string') {
          throw new Error('الملف فارغ أو تعذر قراءة محتواه النصي');
        }

        // Validate Python syntax with strict timeout and safe error handling
        const syntaxCheck = await new Promise<{ valid: boolean; error?: string }>((resolve) => {
          let resolved = false;
          const finish = (result: { valid: boolean; error?: string }) => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              resolve(result);
            }
          };

          const timer = setTimeout(() => {
            try {
              proc?.kill('SIGKILL');
            } catch {}
            // In case of timeout, do not block the user; treat as valid
            finish({ valid: true });
          }, 4000);

          let proc: any;
          try {
            proc = spawn('python3', ['-c', 'import sys; compile(sys.stdin.read(), "<check>", "exec")']);
          } catch {
            return finish({ valid: true });
          }

          let errData = '';

          proc.on('error', (err: any) => {
            console.warn('Python syntax check spawn warning (bypassing):', err.message);
            finish({ valid: true });
          });

          if (proc.stderr) {
            proc.stderr.on('data', (d: any) => {
              errData += d.toString();
            });
          }

          proc.on('close', (c: number) => {
            finish({ valid: c === 0, error: errData.trim() });
          });

          if (proc.stdin) {
            proc.stdin.on('error', () => {
              finish({ valid: true });
            });
            try {
              proc.stdin.write(codeText);
              proc.stdin.end();
            } catch {
              finish({ valid: true });
            }
          }
        });

        if (!syntaxCheck.valid) {
          const safeError = escapeHtml(syntaxCheck.error || 'Syntax Error');
          await this.sendMessage(
            chatId,
            `❌ خطأ في بناء جملة بايثون (SyntaxError):\n<pre><code>${safeError}</code></pre>`
          );
          return;
        }

        // Store encrypted project
        const projectId = await this.context.createProject(userId, fileName, codeText);

        // Generate API key
        const durationSec = this.context.defaultTtl;
        const hours = Math.round(durationSec / 3600);
        const { rawKey, keyId } = await this.context.createKey(
          projectId,
          userId,
          durationSec,
          `Created via Telegram upload (${fileName})`
        );

        // Get project and detected packages
        const proj = this.context.getProject(projectId);
        const pkgs = proj?.required_packages || (this.context.extractImports ? this.context.extractImports(codeText) : []);

        // Build client stub
        const clientStub = this.context.buildStub(
          fileName,
          fileName,
          this.context.getPublicApiUrl(),
          rawKey,
          pkgs
        );

        // Send confirmation text message FIRST so user is never left hanging
        const pkgsText = pkgs.length > 0 ? pkgs.join(', ') : 'لا توجد مكتبات خارجية مطلوبة';
        const successMessage =
          `✅ <b>تم استلام وتشفير المشروع بنجاح!</b>\n\n` +
          `📁 معرّف المشروع: <code>${escapeHtml(projectId)}</code>\n` +
          `🔑 مفتاح API الخاص بك:\n<code>${escapeHtml(rawKey)}</code>\n\n` +
          `🆔 معرّف المفتاح: <code>${escapeHtml(keyId)}</code>\n` +
          `⏳ الصلاحية: ${hours} ساعة\n` +
          `📦 المكتبات المكتشفة: <code>${escapeHtml(pkgsText)}</code>\n` +
          `⚡ <i>تم تفعيل التثبيت التلقائي للمكتبات الناقصة مع أي نسخة بايثون!</i>\n\n` +
          `⚠️ <i>احفظ مفتاحك الآن، لن يُعرض مجدداً!</i>\n` +
          `📎 <i>جارٍ إرسال ملف العميل <code>${escapeHtml(fileName)}</code>...</i>`;

        await this.sendMessage(chatId, successMessage);

        this.logActivity({
          userId,
          username,
          type: 'document',
          text: `Uploaded ${fileName} (${doc.file_size || codeText.length} bytes)`,
          details: `Created project ${projectId} and key ${keyId} with packages [${pkgs.join(', ')}]`,
          status: 'ok',
        });

        const docCaption = `📁 ملف العميل: ${fileName}\n🔑 المفتاح: ${rawKey}\n⚡ مزوّد بمكتشف ومثبّت المكتبات التلقائي`;
        await this.sendDocument(chatId, clientStub, fileName, docCaption);
      } catch (err: any) {
        console.error('Telegram file processing error:', err);
        const safeError = escapeHtml(err.message || 'Unknown error');
        await this.sendMessage(chatId, `❌ حدث خطأ أثناء معالجة الملف: ${safeError}`);
      }
      return;
    }

    // Default response for unrecognized text
    if (text) {
      await this.sendMessage(
        chatId,
        `❓ أمر غير معروف. أرسل ملف <code>.py</code> أو اكتب <code>/start</code> للاطلاع على الأوامر المتاحة.`
      );
    }
  }

  // Simulator helper for browser testing without Telegram client
  public async simulateMessage(
    userId: number,
    username: string,
    text?: string,
    document?: { fileName: string; code: string }
  ) {
    const fakeMessage: any = {
      chat: { id: userId },
      from: { id: userId, username, first_name: username },
    };
    if (document && document.fileName && document.code) {
      fakeMessage.document = {
        file_name: document.fileName,
        file_size: Buffer.byteLength(document.code, 'utf8'),
        file_id: 'sim_doc_' + Date.now(),
        direct_content: document.code,
      };
    } else {
      fakeMessage.text = text || '';
    }
    await this.handleMessage(fakeMessage);
  }
}

export const telegramBot = new TelegramBotManager();
