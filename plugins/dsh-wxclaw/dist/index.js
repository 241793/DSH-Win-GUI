/**
 * dsh-wxclaw — 把 wxclaw (ilink Bot) 微信账号接入 deepseek-harness。
 *
 * 原理对齐 @tencent-connect/dsh-qqbot：
 *   - 未配置 token 时，调用 ilink/bot/get_bot_qrcode 打印二维码，
 *     轮询 ilink/bot/get_qrcode_status 直到扫码成功，拿到 token/UIN 后持久化。
 *   - 轮询 ilink/bot/getupdates 拉取微信消息，交给 dsh agent。
 *   - 监听 ctx.on('session/event')，把 dsh 回复通过 ilink/bot/sendmessage 发回微信。
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import Schema from '@deepseek-ai/schemastery';
import { SessionId } from '@deepseek-ai/dsh-session';
import { createUserMessage } from '@deepseek-ai/dsh-llm';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');

export const name = 'im-wxclaw';
export const inject = ['agents'];

export const Config = Schema.object({
  apiUrl: Schema.string().default('https://ilinkai.weixin.qq.com').description('wxclaw ilink API 地址（官方统一地址，一般无需修改）'),
  token: Schema.string().default('').description('wxclaw bot token（留空则启动时扫码绑定）'),
  xWechatUin: Schema.string().default('').description('X-WECHAT-UIN（一般留空，自动随机生成）'),
  botId: Schema.string().default('').description('绑定后的微信 bot_id（自动写入，用于展示）'),
  authorizationType: Schema.string().default('ilink_bot_token').description('AuthorizationType 请求头'),
  pollIntervalSec: Schema.number().default(2).description('拉取消息间隔（秒）'),
  textChunkLimit: Schema.number().default(4000).description('单条回复最大字符数'),
  sessionIdleTimeout: Schema.number().default(30 * 60 * 1000).description('会话闲置超时(ms)'),
  streaming: Schema.boolean().default(true).description('流式增量是否合并为一条消息发送'),
  showToolResults: Schema.boolean().default(false).description('工具调用成功结果是否发送给用户（错误始终发送）'),
  adminIds: Schema.array(Schema.string()).default([]).description('管理员 user_id 列表'),
  provider: Schema.string().description('LLM provider（留空使用宿主默认）'),
  model: Schema.string().description('LLM model（留空使用宿主默认）'),
  debug: Schema.boolean().default(false),
});

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function resolveEnv(value, envKey) {
  if (value && value !== '__FROM_ENV__' && !String(value).startsWith('process.env')) return value;
  return process.env[envKey] ?? '';
}

/** 从插件安装路径向上找 node_modules，返回 profile 目录。 */
function getProfileDir(baseDir = PLUGIN_ROOT) {
  let dir = baseDir;
  for (let i = 0; i < 32; i += 1) {
    if (basename(dir) === 'node_modules') return dirname(dir);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** 把 wxclaw 配置写入 profile 的 cordis.patch.yml（JSON 风格，兼容桌面端生成格式）。 */
function persistConfig(patch, logger) {
  const profileDir = getProfileDir();
  if (!profileDir) {
    logger.warn('未定位到 profile 目录，跳过凭据持久化');
    return false;
  }
  const patchPath = resolve(profileDir, 'cordis.patch.yml');
  try {
    let entries = [];
    if (existsSync(patchPath)) {
      const raw = readFileSync(patchPath, 'utf8');
      const stripped = raw.replace(/^\s*#.*$/gm, '').trim();
      try {
        const parsed = JSON.parse(stripped || '[]');
        if (Array.isArray(parsed)) entries = parsed.filter((e) => e && e.id);
      } catch {
        logger.warn(`现有 ${patchPath} 不是 JSON 风格，放弃自动写入。`);
        return false;
      }
    }
    const existing = entries.find((e) => e.id === 'im-wxclaw');
    if (existing) existing.config = { ...(existing.config || {}), ...patch };
    else entries.push({ id: 'im-wxclaw', config: { ...patch } });
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(patchPath, `# wxclaw 配置（扫码绑定自动生成）\n${JSON.stringify(entries, null, 2)}\n`);
    logger.info(`✔ wxclaw 配置已写入: ${patchPath}`);
    return true;
  } catch (err) {
    logger.warn(`写入配置失败：${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

function clickableLink(url) {
  return `\u001b]8;;${url}\u001b\\${url}\u001b]8;;\u001b\\`;
}

class WxClawClient {
  constructor({ apiUrl, token = '', uin = '', authorizationType = 'ilink_bot_token', logger = console }) {
    this.apiUrl = String(apiUrl || '').trim().replace(/\/+$/, '');
    this.token = String(token || '').trim();
    this.uin = String(uin || '').trim();
    this.authorizationType = authorizationType;
    this.logger = logger;
    this.loginQrPath = 'ilink/bot/get_bot_qrcode';
    this.loginCheckPath = 'ilink/bot/get_qrcode_status';
    this.getUpdatesPath = 'ilink/bot/getupdates';
    this.sendMessagePath = 'ilink/bot/sendmessage';
  }

  setAuth(token, uin) {
    this.token = String(token || '').trim();
    if (uin) this.uin = String(uin).trim();
  }

  _headers() {
    const token = this.token;
    const auth = token
      ? (token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`)
      : '';
    // 对齐 Python 适配器：X-WECHAT-UIN 为空时使用随机 base64，而不是 bot_id。
    let wechatUin = this.uin;
    if (!wechatUin) wechatUin = randomBytes(8).toString('base64');
    return {
      'Content-Type': 'application/json',
      AuthorizationType: this.authorizationType || 'ilink_bot_token',
      Authorization: auth,
      'X-WECHAT-UIN': wechatUin,
      'iLink-App-Id': 'bot',
      'iLink-App-ClientVersion': '1',
    };
  }

  async post(path, payload) {
    const url = `${this.apiUrl}/${String(path).replace(/^\/+/, '')}`;
    let text = '';
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(payload ?? {}),
        signal: AbortSignal.timeout(20000),
      });
      text = await resp.text();
      if (!text.trim()) return { ret: 0, data: {} };
      try {
        return JSON.parse(text);
      } catch {
        return { ret: -1, msg: `non-json: ${text.slice(0, 200)}` };
      }
    } catch (err) {
      return { ret: -1, msg: `${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /** GET 请求（扫码登录接口用 GET + query）。 */
  async get(path, params = {}) {
    let url = `${this.apiUrl}/${String(path).replace(/^\/+/, '')}`;
    const query = new URLSearchParams(params).toString();
    if (query) url += (url.includes('?') ? '&' : '?') + query;
    let text = '';
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'iLink-App-ClientVersion': '1',
        },
        signal: AbortSignal.timeout(20000),
      });
      text = await resp.text();
      if (!text.trim()) return {};
      try {
        return JSON.parse(text);
      } catch {
        return { ret: -1, msg: `non-json: ${text.slice(0, 200)}` };
      }
    } catch (err) {
      return { ret: -1, msg: `${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /** 宽松解析扫码登录响应（对齐 wxclaw Python 适配器）。 */
  _extractLoginPayload(obj) {
    if (!obj || typeof obj !== 'object') return {};
    const src = obj.data && typeof obj.data === 'object' ? obj.data : obj;
    return {
      token: String(src.token || src.access_token || src.bot_token || src.auth_token || '').trim(),
      qr: String(src.qr_url || src.qrcode_url || src.qrcode_img_content || src.qrcodeUrl || src.url || src.qr || src.qr_base64 || src.image || '').trim(),
      ticket: String(src.ticket || src.uuid || src.login_id || src.qrcode || src.key || src.state || '').trim(),
      status: String(src.status || src.state || '').trim().toLowerCase(),
      botId: String(src.ilink_user_id || src.user_id || src.myuid || src.ilink_bot_id || src.bot_id || '').trim(),
    };
  }

  /** 扫码绑定：GET 拿二维码 → GET 轮询状态 → 返回 {token, uin}。 */
  async loginFlow() {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      console.log(`\n══════════════════════════════════════════════════════`);
      console.log(`  wxclaw 账号未配置，开始扫码绑定（第 ${attempt} 次）`);
      console.log(`══════════════════════════════════════════════════════\n`);

      const qrResp = await this.get(this.loginQrPath, { bot_type: '3' });
      const qrParsed = this._extractLoginPayload(qrResp);
      const qrContent = qrParsed.qr || qrParsed.ticket || '';
      if (qrContent && /^https?:\/\//i.test(qrContent)) {
        console.log('请用微信扫描下方二维码（若二维码错位，点链接打开扫码页）：');
        console.log(`  ${clickableLink(qrContent)}\n`);
        try {
          const qrcodeTerminal = require('qrcode-terminal');
          qrcodeTerminal.generate(qrContent, { small: true }, (qr) => console.log(qr));
        } catch { /* 未安装 qrcode-terminal，仅显示链接 */ }
      } else if (qrContent) {
        console.log('请用微信扫描下方二维码：\n');
        console.log(qrContent);
      } else {
        console.log('[im-wxclaw] get_bot_qrcode 返回：', JSON.stringify(qrResp || {}).slice(0, 500));
      }

      const ticket = qrParsed.ticket || qrParsed.qr || '';
      for (let i = 1; i <= 120; i += 1) {
        await sleep(2000);
        const stResp = await this.get(this.loginCheckPath, ticket ? { qrcode: ticket } : {});
        const st = this._extractLoginPayload(stResp);
        if (st.token) {
          console.log(`\n✔ 绑定成功！token=${st.token.slice(0, 8)}…${st.token.slice(-4)}${st.botId ? ` bot_id=${st.botId}` : ''}\n`);
          return { token: st.token, uin: this.uin || '', botId: st.botId || '' };
        }
        const status = st.status || '';
        if (/expired|timeout|fail|invalid|error/i.test(status)) {
          console.log(`二维码已过期或校验失败（${status || JSON.stringify(stResp || {}).slice(0, 120)}），正在刷新…`);
          break;
        }
        if (i === 1 || i % 10 === 0) {
          console.log(`等待微信扫码中…（${i * 2}s）status=${status || JSON.stringify(stResp || {}).slice(0, 120)}`);
        }
      }
    }
    return null;
  }

  /** 拉取消息。返回 {ret, msgs, get_updates_buf}。 */
  async getUpdates(cursor) {
    const resp = await this.post(this.getUpdatesPath, {
      get_updates_buf: cursor || '',
      base_info: { channel_version: '1.0.3' },
    });
    return resp || {};
  }

  /** 发送文本消息。 */
  async sendMessage(userId, text, contextToken = '') {
    const nowMs = Date.now();
    const payload = {
      msg: {
        from_user_id: '',
        to_user_id: String(userId),
        client_id: `dsh_${nowMs}_${randomBytes(4).toString('hex')}`,
        message_type: 2,
        message_state: 2,
        create_time_ms: nowMs,
        update_time_ms: nowMs,
        item_list: [{ type: 1, text_item: { text } }],
      },
      base_info: { channel_version: '1.0.3' },
    };
    if (contextToken) payload.msg.context_token = contextToken;
    return this.post(this.sendMessagePath, payload);
  }
}

/** 解析一条 wxclaw update 为内部消息。 */
function parseWxMessage(raw, accountName = 'default') {
  if (!raw || typeof raw !== 'object') return null;
  const mtype = Number(raw.message_type || 0);
  if (![1, 2, 3, 4, 5].includes(mtype)) return null;
  const userId = String(raw.from_user_id || raw.to_user_id || '');
  if (!userId) return null;

  const parts = [];
  const files = [];
  const itemList = Array.isArray(raw.item_list) ? raw.item_list : [];
  for (const item of itemList) {
    if (!item || typeof item !== 'object') continue;
    const itype = Number(item.type || 0);
    if (itype === 1) {
      const text = String((item.text_item && item.text_item.text) || '').trim();
      if (text) parts.push(text);
    } else if (itype === 2) {
      const img = item.image_item || {};
      const media = img.media || {};
      const url = img.cdn_big_img_url || media.full_url || img.full_url || '';
      parts.push(url ? `[图片] ${url}` : '[图片]');
      files.push({ type: 'image', url });
    } else if (itype === 3) {
      const voice = item.voice_item || item.voice_text || {};
      const voiceText = String(voice.text || '').trim();
      parts.push(voiceText ? `[语音转文字] ${voiceText}` : '[语音]');
    } else if (itype === 4) {
      const fi = item.file_item || {};
      const fname = String(fi.filename || fi.file_name || '文件').trim();
      parts.push(`[文件: ${fname}]`);
      files.push({ type: 'file', name: fname });
    } else if (itype === 5) {
      parts.push('[视频]');
    }
  }
  const content = parts.join('\n').trim();
  if (!content && files.length === 0) return null;

  return {
    accountName,
    messageId: String(raw.message_id || raw.msg_id || `wx-${Date.now()}`),
    userId,
    content,
    files,
    contextToken: String(raw.context_token || ''),
    raw,
  };
}

/** 极简 Markdown 切分（按换行边界，保持代码块完整）。 */
function chunkText(text, limit) {
  if (text.length <= limit) return [text];
  const lines = text.split('\n');
  const chunks = [];
  let current = '';
  let inCode = false;
  for (const line of lines) {
    if (/^```/.test(line)) inCode = !inCode;
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > limit && current && !inCode) {
      chunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text];
}

/** dsh session/event 解析（对齐 qqbot 插件）。 */
function parseEvent(raw) {
  switch (raw.type) {
    case 'assistant/chunk': {
      const chunk = raw.data && raw.data.chunk;
      if (!chunk || chunk.type !== 'text-delta' || !chunk.text) return undefined;
      return { type: 'assistant/chunk', text: chunk.text };
    }
    case 'assistant/message': {
      const message = raw.data && raw.data.message;
      if (!message || !Array.isArray(message.content)) return undefined;
      return { type: 'assistant/message', content: message.content };
    }
    case 'tool/result': {
      const data = raw.data || {};
      const callId = data.message && data.message.source && data.message.source.callId;
      if (!callId) return undefined;
      return { type: 'tool/result', callId, error: data.error, raw: data };
    }
    case 'turn/end': {
      return { type: 'turn/end', reason: (raw.data && raw.data.reason) || {} };
    }
    default:
      return undefined;
  }
}

function extractTurnError(reason) {
  if (!reason || reason.kind !== 'error') return undefined;
  const detail = reason.error || reason.failure;
  return {
    code: (detail && detail.code) || reason.code || 'UNKNOWN',
    message: (detail && detail.message) || reason.message || 'unknown error',
  };
}

/** 解析默认模型路由（config 显式 > 宿主 agentDefaultModel > 兜底）。 */
function resolveRoute(ctx, config) {
  if (config.provider && config.model) return { provider: config.provider, model: config.model };
  try {
    const service = ctx && typeof ctx.get === 'function' ? ctx.get('agentDefaultModel') : undefined;
    if (service && typeof service.currentSelection === 'function') {
      const selection = service.currentSelection();
      if (selection && selection.provider && selection.model) {
        return { provider: selection.provider, model: selection.model };
      }
    }
  } catch { /* ignore */ }
  return { provider: 'deepseek-official', model: 'deepseek-v4-flash' };
}

/** SessionManager：wxclaw user → dsh agent。 */
class SessionManager {
  constructor(ctx, agents, config, logger) {
    this.ctx = ctx;
    this.agents = agents;
    this.config = config;
    this.logger = logger;
    this.route = resolveRoute(ctx, config);
    this.sessions = new Map();
    this.contextTokens = new Map(); // key: account|user -> token
    this.timers = new Set();
    if (config.sessionIdleTimeout > 0) {
      const timer = setInterval(() => this.evict(), 60000);
      this.timers.add(timer);
    }
  }

  sessionKey(account, userId) {
    return `wxclaw:${account}:${userId}`;
  }

  deriveSessionId(key) {
    const hash = createHash('sha256').update(key).digest('hex');
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
  }

  evict() {
    const now = Date.now();
    for (const [key, record] of this.sessions) {
      if (now - record.lastActivity > this.config.sessionIdleTimeout) {
        this.sessions.delete(key);
        record.agent.cancel({ kind: 'user' });
        void record.handle.dispose().catch(() => {});
        this.logger.info(`evicting idle session: key=${key}`);
      }
    }
  }

  async getOrCreate(account, userId, replyTarget) {
    const key = this.sessionKey(account, userId);
    const existing = this.sessions.get(key);
    if (existing) {
      existing.replyTarget = replyTarget;
      existing.lastActivity = Date.now();
      return existing;
    }
    const sessionId = SessionId(this.deriveSessionId(key));
    let agent;
    let handle;
    const live = this.agents.get(sessionId);
    if (live) {
      agent = live;
    } else {
      try {
        const resumed = await this.agents.resume({
          resumeSessionId: sessionId,
          agentOptions: this.route,
        });
        agent = resumed.agent;
        handle = resumed;
      } catch {
        const created = await this.agents.create({
          sessionId,
          meta: { cwd: this.config.cwd || process.cwd() },
          agentOptions: this.route,
        });
        agent = created.agent;
        handle = created;
      }
    }
    const record = {
      sessionKey: key,
      sessionId,
      agent,
      handle: handle || { agent, dispose: async () => {} },
      replyTarget,
      lastActivity: Date.now(),
    };
    this.sessions.set(key, record);
    return record;
  }

  findBySessionId(sessionId) {
    for (const record of this.sessions.values()) {
      if (record.sessionId === sessionId) return record;
    }
    return undefined;
  }

  setContextToken(account, userId, token) {
    if (token) this.contextTokens.set(`${account}|${userId}`, token);
  }

  getContextToken(account, userId) {
    return this.contextTokens.get(`${account}|${userId}`) || '';
  }

  async disposeAll() {
    for (const timer of this.timers) clearInterval(timer);
    this.timers.clear();
    const records = [...this.sessions.values()];
    this.sessions.clear();
    for (const record of records) record.agent.cancel({ kind: 'user' });
    await Promise.allSettled(records.map((r) => r.handle.dispose()));
  }
}

/** 入站：wxclaw 消息 → dsh agent。 */
async function handleInbound(manager, msg, config, logger) {
  const replyTarget = { userId: msg.userId, account: msg.accountName };
  manager.setContextToken(msg.accountName, msg.userId, msg.contextToken);
  let record;
  try {
    record = await manager.getOrCreate(msg.accountName, msg.userId, replyTarget);
  } catch (err) {
    console.log(`[im-wxclaw] ERROR creating session: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  const body = msg.content;
  if (!body) return;
  const message = createUserMessage({ content: [{ type: 'text', text: body }], source: { kind: 'user' } });
  record.agent.followup(message);
  console.log(`[im-wxclaw] → followup sent: account=${msg.accountName} user=${msg.userId} body="${body.slice(0, 160)}"`);
}

/** 出站：dsh event → wxclaw 回复。 */
function createOutboundHandler(manager, client, config, logger) {
  const buffers = new Map();
  const send = async (record, text) => {
    const ctx = manager.getContextToken(record.replyTarget.account, record.replyTarget.userId);
    const chunks = chunkText(text, config.textChunkLimit);
    for (const chunk of chunks) {
      const result = await client.sendMessage(record.replyTarget.userId, chunk, ctx);
      const body = result && result.data && typeof result.data === 'object' ? result.data : result;
      const ret = Number((body && body.ret) ?? 0);
      if (ret !== 0) {
        console.log(`[im-wxclaw] send failed: user=${record.replyTarget.userId} ret=${ret} msg=${(body && body.msg) || JSON.stringify(result || {}).slice(0, 200)}`);
      } else {
        console.log(`[im-wxclaw] → 回复已发送: user=${record.replyTarget.userId} text=${text.slice(0, 60)}`);
      }
    }
  };
  return (session, raw) => {
    const event = parseEvent(raw);
    if (!event) return;
    const record = manager.findBySessionId(session.header.id);
    if (!record) return;
    if (event.type === 'assistant/chunk') {
      if (!config.streaming) return;
      buffers.set(session.header.id, (buffers.get(session.header.id) || '') + event.text);
    } else if (event.type === 'assistant/message') {
      const buffered = buffers.get(session.header.id) || '';
      buffers.delete(session.header.id);
      const parts = [];
      if (buffered.trim()) parts.push(buffered.trim());
      for (const block of event.content) {
        if (block.type === 'text' && block.text) parts.push(block.text);
      }
      const fullText = parts.join('\n');
      if (fullText.trim()) void send(record, fullText);
    } else if (event.type === 'tool/result') {
      if (event.error !== undefined || config.showToolResults) {
        const text = event.error !== undefined
          ? `⚠️ 工具调用失败\n${event.error}`
          : `工具执行完成`;
        void send(record, text);
      }
    } else if (event.type === 'turn/end') {
      const buffered = buffers.get(session.header.id) || '';
      buffers.delete(session.header.id);
      if (buffered.trim()) void send(record, buffered.trim());
      const failure = extractTurnError(event.reason);
      if (failure) void send(record, `⚠️ 本轮异常结束\n\`${failure.code}\`: ${failure.message}`);
    }
  };
}

export async function apply(ctx, config) {
  const agents = ctx.agents;
  const logger = ctx.logger || console;

  let apiUrl = resolveEnv(config.apiUrl, 'WXCLAW_API_URL');
  let token = resolveEnv(config.token, 'WXCLAW_TOKEN');
  let uin = resolveEnv(config.xWechatUin, 'WXCLAW_UIN');

  if (!apiUrl) {
    logger.error('[im-wxclaw] apiUrl 未配置，请设置 WXCLAW_API_URL 或在 cordis.patch.yml 中配置。');
    return;
  }

  const client = new WxClawClient({ apiUrl, token, uin, authorizationType: config.authorizationType, logger });

  // ── 未配置 token：扫码绑定 ──
  if (!token) {
    console.log('[im-wxclaw] token 未配置，开始扫码绑定...');
    const cred = await client.loginFlow();
    if (!cred || !cred.token) {
      console.log('[im-wxclaw] 扫码绑定失败，插件未启动');
      return;
    }
    token = cred.token;
    if (cred.uin) uin = cred.uin;
    client.setAuth(token, uin);
    persistConfig({ apiUrl, token, xWechatUin: uin, botId: cred.botId || '' }, logger);
    console.log('[im-wxclaw] 绑定成功，开始接收消息...');
  }

  const manager = new SessionManager(ctx, agents, config, logger);
  ctx.on('session/event', createOutboundHandler(manager, client, config, logger));

  let cursor = '';
  let polling = true;
  const seen = new Map(); // messageKey -> ts

  const dedupe = (key) => {
    const now = Date.now();
    for (const [k, ts] of seen) if (now - ts > 600000) seen.delete(k);
    if (seen.has(key)) return false;
    seen.set(key, now);
    return true;
  };

  const tick = async () => {
    try {
      const resp = await client.getUpdates(cursor);
      const body = resp && resp.data && typeof resp.data === 'object' ? resp.data : resp;
      const ret = Number((body && body.ret) ?? 0);
      if (ret !== 0) {
        console.log(`[im-wxclaw] getupdates ret=${ret} msg=${(body && body.msg) || JSON.stringify(resp || {}).slice(0, 200)}`);
        return;
      }
      const msgs = (body && body.msgs) || [];
      if (Array.isArray(msgs)) {
        for (const raw of msgs) {
          const msg = parseWxMessage(raw, 'default');
          if (!msg) continue;
          const key = `${msg.accountName}|${msg.messageId}|${msg.userId}`;
          if (!dedupe(key)) continue;
          console.log(`[im-wxclaw] ← 收到消息: user=${msg.userId} content=${msg.content.slice(0, 120)}`);
          await handleInbound(manager, msg, config, logger);
        }
      }
      const next = body && (body.get_updates_buf || body.next_get_updates_buf || body.sync_buf);
      if (next && next !== cursor) cursor = String(next);
    } catch (err) {
      console.log(`[im-wxclaw] poll error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const loop = (async () => {
    while (polling) {
      await tick();
      await sleep(Math.max(0.5, Number(config.pollIntervalSec || 2)) * 1000);
    }
  })();

  ctx.effect(() => async () => {
    polling = false;
    await manager.disposeAll();
    console.log('[im-wxclaw] shutdown');
  }, 'im-wxclaw.lifecycle');

  if (config.botId) {
    console.log(`[im-wxclaw] 已加载保存的账号（botId=${config.botId}），无需重新扫码。`);
  }
  console.log(`[im-wxclaw] started: apiUrl=${apiUrl} token=${token.slice(0, 6)}…${config.botId ? ` botId=${config.botId}` : ''}`);
  void loop;
}
