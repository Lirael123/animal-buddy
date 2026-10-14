/**
 * Unit 3 听写错题记录 + 学生学习进度聚合（对象存储 JSON，按 uid 隔离）。
 *
 * 安全说明（重要）：
 * - 所有记录/进度读取接口必须在服务端核对"请求方 uid 与记录属主 uid 一致"，不能仅凭前端传入的 uid 放行；
 * - 开发/展示阶段只允许「虚拟学生 ID」（animal-buddy-demo-*），不收集真实姓名等无关个人信息；
 * - 教师端身份认证与班级数据查看属 3B 阶段，这里不做教师端。
 *
 * 幂等/去重约定：
 * - 一个「练习批次」由 session 标识；同一 uid+qid+session 视为同一道题的同一轮练习。
 * - 该键首次提交 = 计入新的练习成绩；之后的提交（含页面刷新后沿用同一 session）
 *   视为本道题的重练/重复提交，更新同一记录（追加 retries、提示次数、最终掌握状态）而不重复累计成绩。
 * - 学习进度/掌握状态只按「每人每题」聚合，绝不因刷新、重复提交而虚增。
 */

import { S3Storage } from 'coze-coding-dev-sdk';

const storage = new S3Storage({});

export interface DictationAttempt {
  key: string;            // 对象存储对象名（唯一；SDK 会为 fileName 追加随机后缀）
  time: string;           // 最近一次提交时间（ISO）
  createdAt: string;      // 首次提交时间（ISO）
  uid: string;
  qid: string;            // 题目 ID
  page: number;
  type: 'word' | 'sentence';
  session: string;        // 练习批次（同 uid+qid+session 视为同一轮练习）
  firstAnswer: string;             // 首次回答
  retries: string[];               // 每次重试答案（按序，不含首次）
  errorType: string | null;        // 最终判定：correct/grammar/word/missing_article/wrong/unclear
  aiHintCount: number;
  corrected: boolean;              // 最终是否纠正成功（首错后改对）
  firstCorrect: number;            // 首次正确(1) / 首次错误(0)
  mastered: boolean;               // 最终掌握状态
  vocabOk: boolean;                // 词汇理解达标
  formOk: boolean;                 // 句型表达达标
  asrSkipped: boolean;             // 是否因 ASR 不清不计分
}

export interface ProgressSummary {
  uid: string;
  exercised: number;         // 已完成练习数（按 qid 去重后的题目数）
  masteredVocab: number;     // 已掌握词汇数（最终 mastered 且词汇理解达标的题）
  firstPassRate: number;     // 首次作答正确率（0-1）
  correctionCount: number;   // 纠错成功次数（首错但最终改对）
  pending: string[];         // 待巩固题目 ID 清单
  reviewRecommend: string[]; // 按错题推荐的复习内容（待巩固题目 ID）
}

const PREFIX = 'dictation/records/';
const UID_KEY = (uid: string) => `${PREFIX}${uid}/`;

export interface SubmitInput {
  uid: string;
  qid: string;
  page: number;
  type: 'word' | 'sentence';
  session: string;
  answer: string;
  isRetry: boolean;
  errorType: string;
  vocabOk: boolean;
  formOk: boolean;
  asrSkipped: boolean;
  isCorrect: boolean;
}

export interface SubmitResult {
  attempt: DictationAttempt | null;
  /** 是否计为新成绩（首次提交且该练习批次尚未计过） */
  counted: boolean;
}

/**
 * 记录一次提交：首次建记录，重练/重复则合并更新同一条（幂等去重）。
 */
const writes = new Map<string, Promise<unknown>>();
export async function recordSubmission(inp: SubmitInput): Promise<SubmitResult> {
  const key = `${inp.uid}::${inp.qid}::${inp.session}`;
  const previous = writes.get(key) || Promise.resolve();
  const work = previous.catch(() => undefined).then(() => saveSubmission(inp));
  writes.set(key, work);
  try { return await work; }
  finally { if (writes.get(key) === work) writes.delete(key); }
}
async function saveSubmission(inp: SubmitInput): Promise<SubmitResult> {
  if (inp.asrSkipped) return { attempt: null, counted: false };
  const { uid, qid, session } = inp;
  const existing = await findAttempt(uid, qid, session);

  if (!existing) {
    // —— 新练习：计入成绩 ——
    const now = new Date().toISOString();
    const attempt: DictationAttempt = {
      key: '',
      createdAt: now,
      time: now,
      uid,
      qid,
      page: inp.page,
      type: inp.type,
      session,
      firstAnswer: inp.answer,
      retries: [],
      errorType: inp.errorType,
      aiHintCount: 0,
      corrected: false,
      firstCorrect: inp.isCorrect ? 1 : 0,
      mastered: inp.isCorrect,
      vocabOk: inp.vocabOk,
      formOk: inp.formOk,
      asrSkipped: inp.asrSkipped,
    };
    await persist(attempt);
    return { attempt, counted: !inp.asrSkipped };
  }

  // —— 已有记录：合并更新（重练 / 重复提交），不重复累计 ——
  const updated: DictationAttempt = {
    ...existing,
    time: new Date().toISOString(),
    errorType: inp.errorType,
    vocabOk: inp.vocabOk,
    formOk: inp.formOk,
    asrSkipped: inp.asrSkipped,
  };
  const wasCorrect = existing.firstCorrect === 1 || existing.mastered;
  if (!wasCorrect) {
    // 首次尚未通过：本次作答并入重试序列，提示次数 +1
    updated.retries = [...existing.retries, inp.answer];
    updated.aiHintCount = existing.aiHintCount + 1;
    updated.corrected = inp.isCorrect;
    updated.mastered = inp.isCorrect;
  } else {
    updated.mastered = true;
    updated.corrected = existing.firstCorrect === 0;
    updated.vocabOk = existing.vocabOk;
    updated.formOk = existing.formOk;
  }
  await persist(updated);
  return { attempt: updated, counted: false };
}

async function persist(a: DictationAttempt): Promise<void> {
  // Upload first. A failed upload must never erase the previous result.
  const old = await storage.listFiles({ prefix: `${UID_KEY(a.uid)}${a.qid}-${a.session}_`, maxKeys: 1000 });
  const key = await storage.uploadFile({
    fileContent: Buffer.from(JSON.stringify(a)),
    fileName: `${PREFIX}${a.uid}/${a.qid}-${a.session}.json`,
    contentType: 'application/json',
  });
  a.key = key;
  const exact = new RegExp(`^${UID_KEY(a.uid)}${a.qid}-${a.session}_[a-f0-9]{8}\\.json$`);
  await Promise.all((old.keys || []).filter(fileKey => exact.test(fileKey)).map(async fileKey => {
    try { await storage.deleteFile({ fileKey }); } catch { /* new result remains durable */ }
  }));
}

/** 查找某 uid+qid+session 的既有记录 */
async function findAttempt(uid: string, qid: string, session: string): Promise<DictationAttempt | null> {
  const existing = await listAttempts(uid);
  return existing.find((a) => a.qid === qid && a.session === session) ?? null;
}

/** 读取某学生全部听写记录（已按 uid 过滤属主） */
export async function listAttempts(uid: string): Promise<DictationAttempt[]> {
  const prefix = UID_KEY(uid);
  const listed = await storage.listFiles({ prefix, maxKeys: 1000 });
  if (listed.isTruncated) throw new Error('学习记录超过当前读取上限，需要扩展存储分页后查看完整进度');
  const keys = listed.keys || [];
  const out: DictationAttempt[] = [];
  // Small bounded batches avoid one storage round trip per record in series.
  for (let i = 0; i < keys.length; i += 8) {
    await Promise.all(keys.slice(i, i + 8).map(async k => {
      const buf = await storage.readFile({ fileKey: k });
      try {
        const parsed: unknown = JSON.parse(buf.toString('utf8'));
        if (typeof parsed === 'object' && parsed !== null && 'uid' in parsed && parsed.uid === uid) {
          out.push({ ...parsed as DictationAttempt, key: k });
        }
      } catch { /* skip malformed JSON only; report storage/network failures */ }
    }));
  }
  return out.sort((x, y) => (x.createdAt < y.createdAt ? -1 : 1));
}

/** 聚合学习进度（只基于真实记录，不编造数据） */
export function aggregateProgress(uid: string, attempts: DictationAttempt[]): ProgressSummary {
  // 按 qid 取"最能代表掌握情况"的一条（已掌握优先，其次 corrected 优先）
  const bestByQid = new Map<string, DictationAttempt>();
  for (const a of attempts) {
    if (a.asrSkipped) continue;
    const cur = bestByQid.get(a.qid);
    if (!cur) {
      bestByQid.set(a.qid, a);
      continue;
    }
    const curScore = (cur.mastered ? 2 : 0) + (cur.corrected ? 1 : 0);
    const nextScore = (a.mastered ? 2 : 0) + (a.corrected ? 1 : 0);
    if (nextScore > curScore || (nextScore === curScore && a.createdAt > cur.createdAt)) {
      bestByQid.set(a.qid, a);
    }
  }

  const items = [...bestByQid.values()];
  const exercised = items.length;
  const masteredVocab = items.filter((i) => i.mastered && i.vocabOk).length;
  const firstOk = items.filter((i) => i.firstCorrect === 1).length;
  const firstPassRate = exercised ? Math.round((firstOk / exercised) * 1000) / 1000 : 0;
  const correctionCount = items.filter((i) => i.firstCorrect === 0 && i.mastered).length;
  const pending = items.filter((i) => !i.mastered).map((i) => i.qid);
  const reviewRecommend = pending.slice(0, 6);

  return { uid, exercised, masteredVocab, firstPassRate, correctionCount, pending, reviewRecommend };
}
