import type { Request } from 'express';

/**
 * 原 Animal Buddy 智能体跨项目调用客户端。
 *
 * 规则：
 * - API 地址 / Token 仅从服务端环境变量读取，绝不下发前端、不打日志。
 * - 教学对话统一走原智能体，不在此处回退到独立豆包模型。
 * - /stream_run 返回 SSE，按 sequence_id 拼接 data.content.answer，
 *   只有收到 message_end 且执行状态成功才算成功；HTTP 200 不等于成功。
 * - 同一学生(uid)在 scene 内保持同一 session_id；不同学生会话隔离。
 */

export interface AgentConfig {
  /** 原智能体 `/stream_run` 完整地址 */
  apiUrl: string;
  /** Bearer Token，来自服务端环境变量 */
  token: string;
  /** 原智能体 project_id（必须为完整数字字符串，避免大整数精度丢失） */
  projectId: string;
}

/** 原智能体 project_id（用户确认提供；完整数字字符串防大整数精度丢失） */
const DEFAULT_PROJECT_ID = '7695394094121631763';

/** 读取并校验服务端环境变量的 Agent 配置。缺项会给出明确错误信息，不猜测。 */
export function resolveAgentConfig(): AgentConfig {
  // 原智能体 /stream_run 地址（用户提供；也可用 AGENT_API_URL 覆盖）
  const apiUrl =
    process.env.AGENT_API_URL ?? 'https://sf3vptr7j6.coze.site/stream_run';
  const token = process.env.ANIMAL_BUDDY_AGENT_TOKEN;
  // project_id：优先环境变量覆盖（便于切换），缺省用用户确认的原智能体 project_id
  const projectId = process.env.ANIMAL_BUDDY_AGENT_PROJECT_ID ?? DEFAULT_PROJECT_ID;

  if (!apiUrl) {
    throw new Error(
      'AGENT_API_URL 未配置：请在服务端环境变量中设置为原智能体 /stream_run 地址',
    );
  }
  if (!token) {
    throw new Error(
      'ANIMAL_BUDDY_AGENT_TOKEN 未配置：缺少原智能体 API Token（Authorization: Bearer <token>）',
    );
  }
  // project_id 必须作为完整字符串传递（避免 JS Number 大整数精度丢失）
  if (!/^\d+$/.test(projectId)) {
    throw new Error('ANIMAL_BUDDY_AGENT_PROJECT_ID 必须是纯数字字符串');
  }
  return { apiUrl, token, projectId };
}

/** SSE 协议事件类型 */
type SSEType =
  | 'message_start'
  | 'answer'
  | 'tool_request'
  | 'tool_response'
  | 'message_end'
  | 'error';

interface SSEBlock {
  type: SSEType;
  data: Record<string, unknown>;
}

/** 解析 SSE 文本流为 block 列表（兼容分块、多 event 单 data 场景）。 */
function parseSSE(chunk: string): SSEBlock[] {
  const blocks: SSEBlock[] = [];
  const normalized = chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // SSE 块以空行分隔
  const rawBlocks = normalized.split('\n\n');
  for (const raw of rawBlocks) {
    let type: SSEType | null = null;
    const dataLines: string[] = [];
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (t.startsWith('event:')) type = t.slice('event:'.length).trim() as SSEType;
      else if (t.startsWith('data:')) dataLines.push(t.slice('data:'.length).trim());
      else if (t.startsWith('retry:')) continue;
    }
    if (type && dataLines.length) {
      // 兼容将 JSON 直接放在 non-data 行的实现：若 data 为空但 type 存在，尝试整块解析
      try {
        const jsonStr =
          dataLines.length === 1 ? dataLines[0] : `[${dataLines.join(',')}]`;
        const parsed =
          dataLines.length === 1
            ? JSON.parse(jsonStr)
            : JSON.parse(jsonStr);
        blocks.push({ type, data: parsed });
      } catch {
        // 无效 JSON 跳过，不中断
      }
    }
  }
  return blocks;
}

interface AgentStreamResult {
  answer: string;
  success: boolean;
  /** 用于脱敏日志的执行状态（不暴露敏感头/token） */
  statusText: string;
  /** 追加诊断（如知识库命中数） */
  diagnostics?: string;
}

/**
 * 向原智能体 stream_run 发起一次流式对话，并把 SSE 中 data.content.answer
 * 按 sequence_id 排序拼接为最终回复文本。
 *
 * @param uid 学生标识（用于 session 隔离）
 * @param scene 场景键（用于 session 隔离，不传给原 Agent）
 * @param prompt 学生的英文输入
 * @param sessionId 会话 ID（同一学生连续对话保持同一 ID；为空则新建）
 * @returns 新的 session_id（与传入一致时说明会话延续）与完整回复
 */
export async function runAgentStream(
  req: Request,
  opts: {
    uid: string;
    scene: string;
    prompt: string;
    sessionId: string;
  },
): Promise<{ sessionId: string; reply: string; success: boolean; detail: string }> {
  const cfg = resolveAgentConfig();
  const { uid, prompt, sessionId } = opts;

  const header = new Headers();
  header.set('Authorization', `Bearer ${cfg.token}`);
  header.set('Content-Type', 'application/json');

  const body = {
    content: { query: { prompt } },
    type: 'query',
    session_id: sessionId,
    project_id: cfg.projectId,
    user_id: uid,
  };

  let resp: Response;
  try {
    resp = await fetch(cfg.apiUrl, {
      method: 'POST',
      headers: header,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[agent] network failed:', msg);
    return { sessionId, reply: '', success: false, detail: `network:${msg}` };
  }

  // 鉴权/网关层错误：直接报脱敏状态，不继续假装成功。
  if (resp.status === 401) {
    return {
      sessionId,
      reply: '',
      success: false,
      detail: `auth:401 未授权（Token 无效或缺失）`,
    };
  }
  if (resp.status === 403) {
    return {
      sessionId,
      reply: '',
      success: false,
      detail: `auth:403 禁止访问（Token 无权限访问该智能体/project）`,
    };
  }
  if (!resp.ok) {
    return {
      sessionId,
      reply: '',
      success: false,
      detail: `http:${resp.status} ${resp.statusText}`,
    };
  }

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const answers: { seq: number; text: string }[] = [];
  let lastSessionId = sessionId;
  let toolRequest = 0;
  let toolResponse = 0;
  let sawMessageEnd = false;
  let execStatus = '';
  let execMsg = '';

  const consume = async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // 按换行尝试切分（写文件后统一解析空行分隔块）
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const blockRaw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        processBlock(blockRaw);
      }
    }
    // 结尾残块
    if (buffer.trim()) processBlock(buffer);
    buffer = '';
  };

  const processBlock = (raw: string) => {
    for (const b of parseSSE(raw)) {
      const d = b.data as {
        type?: string;
        sequence_id?: number | string;
        content?: { answer?: string; msg?: string };
        session_id?: string;
        // 部分实现在 data.message
        message?: {
          sequence_id?: number;
          status?: string;
          content?: { answer?: string };
        };
        // 执行状态
        status?: string;
        msg?: string;
        error?: string;
      };

      if (b.type === 'message_start') {
        if (d.session_id) lastSessionId = String(d.session_id);
        continue;
      }
      if (b.type === 'answer') {
        const seq = Number(
          d.sequence_id ?? d.message?.sequence_id ?? answers.length,
        );
        const text =
          (d.content && (d.content.answer ?? d.content.msg)) ??
          (d.message?.content?.answer ?? '');
        if (text) answers.push({ seq, text });
        continue;
      }
      if (b.type === 'tool_request') {
        toolRequest += 1;
        continue;
      }
      if (b.type === 'tool_response') {
        toolResponse += 1;
        continue;
      }
      if (b.type === 'message_end') {
        sawMessageEnd = true;
        execStatus = d.status ?? 'success';
        execMsg = d.msg ?? '';
        if (d.session_id) lastSessionId = String(d.session_id);
        continue;
      }
      if (b.type === 'error') {
        sawMessageEnd = true;
        execStatus = 'error';
        execMsg = d.error ?? d.msg ?? 'unknown error';
        continue;
      }
    }
  };

  await consume();
  await reader.cancel().catch(() => undefined);

  answers.sort((a, b) => a.seq - b.seq);
  const reply = answers
    .map((a) => a.text)
    .join('')
    .trim();

  // 只有真正收到 message_end 且状态成功才算成功，不能只看 HTTP 200。
  const success =
    sawMessageEnd && execStatus === 'success' && reply.length > 0;

  const detail = success
    ? `answered seq=${answers.map((a) => a.seq).join(',')} tools=${toolRequest}>${toolResponse}`
    : `exec=${execStatus || 'no_message_end'}${execMsg ? ` msg=${execMsg}` : ''}`;

  return { sessionId: lastSessionId, reply, success, detail };
}

const noop = (_req: Request) => undefined;
export { noop };