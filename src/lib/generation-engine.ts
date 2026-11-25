import { z } from "zod";
import { AppError } from "./app-error";
import { ContentRefusalError, isParagraphRefusal } from "./model-refusal";
import { ModelRequestError } from "./model-errors";
import {
  chunkBlocks,
  sourceContainsSentence,
  parseSource,
  assertNoGeneratedMarkup,
  restoreAndValidate,
  type SourceBlock,
} from "./markdown";
import type { Generation, Settings } from "./schemas";
import { normalizeLemma } from "./review";
import type { Coverage } from "./types";
import {
  compactVocabularyContext,
  generationLimits,
  GenerationRetryBudget,
  parallelChunks,
  type ProgressCallback,
} from "./generation-limits";
export type GenerationModel = (
  instruction: string,
  data: unknown,
  signal?: AbortSignal,
  feedback?: string,
  beforeModelCall?: () => Promise<void>,
) => Promise<Generation>;
const missingModel: GenerationModel = async () => {
  throw new AppError("尚未配置模型调用", 503);
};
function delay(
  ms: number,
  _value: undefined,
  { signal }: { signal?: AbortSignal },
) {
  return new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const done = () => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    };
    const timer = setTimeout(done, ms);
    const cancel = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", cancel, { once: true });
  });
}
function validationMessage(error: unknown) {
  if (
    error instanceof Error &&
    [
      "代码或链接保护标记丢失或重复",
      "保护标记不可作为学习词",
      "未知保护标记",
    ].includes(error.message)
  )
    return "模型未完整保留代码或链接。各段指定的保护标记必须在该段正文文本中原样保留一次，不能省略、重复或作为学习词。";
  return error instanceof z.ZodError
    ? "输出字段未通过 JSON Schema 校验，请严格遵循 schema"
    : error instanceof SyntaxError
      ? "输出不是合法 JSON"
      : error instanceof Error && error.name === "TimeoutError"
        ? "模型请求超时"
        : error instanceof AppError ||
            (error instanceof Error && error.message.startsWith("模型"))
          ? error.message
          : "段落 ID、保护标记、Markdown 结构或原句未通过校验，请保持对应关系";
}

export async function validatedModel(
  instruction: string,
  data: unknown,
  validate: (result: Generation) => Generation,
  budget: GenerationRetryBudget,
  signal?: AbortSignal,
  onRetry?: (message?: string) => Promise<void> | void,
  beforeModelCall?: () => Promise<void>,
  callModel: GenerationModel = missingModel,
) {
  let feedback: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    signal?.throwIfAborted();
    try {
      return validate(
        await callModel(instruction, data, signal, feedback, beforeModelCall),
      );
    } catch (error) {
      if (signal?.aborted)
        throw new AppError(
          "生成超过四分钟，已停止。原文和已有版本已保留，请拆分长文章或稍后重试。",
          504,
        );
      if (
        error instanceof ContentRefusalError ||
        error instanceof RefusalRecoveryLimitError
      )
        throw error;
      feedback = validationMessage(error);
      if (
        (error instanceof ModelRequestError && !error.retryable) ||
        (error instanceof AppError &&
          [409, 429, 503, 504].includes(error.status)) ||
        feedback.includes("超过大小上限") ||
        attempt === 1 ||
        !budget.take()
      ) {
        if (error instanceof AppError) throw error;
        throw new AppError(
          feedback.startsWith("模型")
            ? feedback
            : `模型输出未通过校验：${feedback}。已有版本未受影响。`,
          502,
        );
      }
      if (error instanceof ModelRequestError) {
        // Honor short Retry-After delays, avoid immediate retry bursts, and stop
        // sleeping when the article deadline or another chunk aborts the job.
        const waitMs = error.retryDelayMs + Math.floor(Math.random() * 250);
        await onRetry?.(
          `${error.message} 等待约 ${Math.ceil(waitMs / 1000)} 秒后重试一次。`,
        );
        try {
          await delay(waitMs, undefined, { signal });
        } catch (waitError) {
          if (signal?.aborted)
            throw new AppError(
              "生成已停止，原文和已有版本已保留。请稍后重试。",
              504,
            );
          throw waitError;
        }
      } else {
        await onRetry?.();
      }
    }
  }
  throw new AppError("生成失败", 502);
}
const isLiteral = (b: SourceBlock) =>
  ["code", "html", "definition", "thematicBreak"].includes(b.kind);

function keepOriginal(
  blocks: SourceBlock[],
  reason: "content_refused" | "recovery_limit",
): Generation {
  return {
    title: "学习文章",
    terms: [],
    paragraphs: blocks.map((block) => ({
      id: block.id,
      original: block.original,
      segments: [{ type: "text", text: block.original }],
    })),
    untranslated: blocks.map((block) => ({ sourceId: block.id, reason })),
  };
}

function mergeRecovered(parts: Generation[]): Generation {
  return {
    title: parts[0].title,
    terms: parts.flatMap((part, index) =>
      part.terms.map((term) => ({ ...term, id: `s${index}_${term.id}` })),
    ),
    paragraphs: parts.flatMap((part, index) =>
      part.paragraphs.map((paragraph) => ({
        ...paragraph,
        segments: paragraph.segments.map((segment) =>
          segment.type === "term"
            ? { ...segment, termId: `s${index}_${segment.termId}` }
            : segment,
        ),
      })),
    ),
    untranslated: parts.flatMap((part) => part.untranslated ?? []),
  };
}
export async function generateTranslated(
  blocks: SourceBlock[],
  settings: Settings,
  mode: string,
  context: unknown,
  signal?: AbortSignal,
  options: {
    onProgress?: ProgressCallback;
    retryBudget?: GenerationRetryBudget;
    validate?: (result: Generation) => Generation;
    beforeModelCall?: () => Promise<void>;
    callModel?: GenerationModel;
    /** Editorial jobs can trade more, smaller requests for reliable JSON output. */
    chunkCharacters?: number;
    withValidatedChunk?: (
      blocks: SourceBlock[],
      generate: () => Promise<Generation>,
    ) => Promise<Generation>;
  } = {},
): Promise<Generation> {
  const all: Generation = { title: "学习文章", terms: [], paragraphs: [] };
  const budget = options.retryBudget ?? new GenerationRetryBudget();
  const refusalBudget = new GenerationRetryBudget(
    generationLimits().refusalCalls,
  );
  const instructions =
    mode === "tech"
      ? "把英文解释性正文翻译成以中文为主体的自然正文，再嵌入少量有学习价值的英文搭配、工作表达或完整分句。每个正文段落的普通 text 片段必须提供有实质内容的中文译文，词卡释义里的中文不算正文翻译。绝不能只把原文拆成多个 term 或仅删掉部分英文就当作学习版。一个短句只选择 1–2 个连续完整表达（high 最多3个），不要拆成许多单词卡；例如 avoid unnecessary re-renders 应作为一个整体，不能分别标注 avoid、unnecessary、re-renders。不要把 React 等产品名和零散功能词当学习目标。先完整表达原文主谓宾、动作和因果，再嵌入表达；不得省略谓语或改写关键事实。英文保留量按数据中的 settings.retention（low 约 10%，medium 约 25%，high 约 40%），选择表达数量要克制，避免把全部英文词变成词卡。严格保留否定、条件、限制、推测程度、数字和关键事实。term.sentence 必须逐字引用所在原文的完整英文句子。category 标记 technical 或 general。"
      : "把德语原文改造成中文为主嵌入德语词/短语的学习版，同一内容和段落对应不变。难度与学习目标按数据中的 settings。必须恰好使用设置的新词数（只复习则 0）和给定复习目标，已有词汇不算新词。reviewVocabularyId 仅在复习目标词上填写对应 id。term.sentence 必须引用对应完整德语原文句子。";
  const chunks =
    mode === "german" ? [blocks] : chunkBlocks(blocks, options.chunkCharacters);
  let completed = 0;
  await options.onProgress?.({
    stage: "translating",
    completed,
    total: chunks.length,
    message: "正在生成并校验学习段落",
  });
  const translated = await parallelChunks(
    chunks,
    mode === "german" ? 1 : generationLimits().concurrency,
    async (chunk, _index, chunkSignal) => {
      const generateChunk = async () => {
        const editable = chunk.filter((b) => !isLiteral(b));
        let validated: Generation = {
          title: "学习文章",
          terms: [],
          paragraphs: [],
        };
        const translate = async (
          subset: SourceBlock[],
          recovering = false,
        ): Promise<Generation> => {
          try {
            const compact = compactVocabularyContext(
              context,
              subset.map((block) => block.original).join("\n"),
            );
            const generationContext =
              mode === "tech"
                ? {
                    existingVocabulary:
                      compact &&
                      typeof compact === "object" &&
                      "existingVocabulary" in compact
                        ? compact.existingVocabulary
                        : [],
                    sourceIsUntrusted: true,
                  }
                : compact;
            return await validatedModel(
              instructions,
              {
                settings:
                  mode === "tech"
                    ? { retention: settings.retention }
                    : settings,
                paragraphs: subset.map((b) => ({
                  id: b.id,
                  kind: b.kind,
                  source: b.masked,
                  ...(Object.keys(b.protected).length
                    ? { protectedTokens: Object.keys(b.protected) }
                    : {}),
                })),
                context: generationContext,
              },
              (result) => {
                if (
                  result.paragraphs.length !== subset.length ||
                  result.paragraphs.some(
                    (paragraph, index) => paragraph.id !== subset[index].id,
                  )
                )
                  throw new Error("段落数量、顺序或对应 ID 不一致");
                const refused = subset.filter((block, index) =>
                  isParagraphRefusal(result.paragraphs[index], block.original),
                );
                if (refused.length && mode !== "tech")
                  throw new ContentRefusalError();
                if (refused.length === subset.length)
                  return keepOriginal(refused, "content_refused");
                const refusedIds = new Set(refused.map((block) => block.id));
                const accepted = subset.filter(
                  (block) => !refusedIds.has(block.id),
                );
                const paragraphs = result.paragraphs.filter(
                  (paragraph) => !refusedIds.has(paragraph.id),
                );
                const used = new Set(
                  paragraphs.flatMap((paragraph) =>
                    paragraph.segments.flatMap((segment) =>
                      segment.type === "term" ? [segment.termId] : [],
                    ),
                  ),
                );
                const restored = restoreAndValidate(
                  refused.length
                    ? {
                        ...result,
                        paragraphs,
                        terms: result.terms.filter((term) => used.has(term.id)),
                      }
                    : result,
                  accepted,
                );
                if (mode === "tech")
                  validateTechnicalProse(restored, accepted, settings);
                validateSourceSentences(restored);
                // Semantic checks run per chunk before success is retained. There is
                // no outer whole-article retry that resends already validated chunks.
                const validated = options.validate
                  ? options.validate(restored)
                  : restored;
                if (!refused.length) return validated;
                const original = keepOriginal(refused, "content_refused");
                const byId = new Map(
                  [...validated.paragraphs, ...original.paragraphs].map(
                    (paragraph) => [paragraph.id, paragraph],
                  ),
                );
                return {
                  ...validated,
                  paragraphs: subset.map((block) => byId.get(block.id)!),
                  untranslated: original.untranslated,
                };
              },
              budget,
              chunkSignal,
              (message) =>
                options.onProgress?.({
                  stage: "translating",
                  completed,
                  total: chunks.length,
                  message:
                    message ?? "正在重试未通过校验的分块，已完成部分会保留",
                }),
              async () => {
                if (recovering && !refusalBudget.take())
                  throw new RefusalRecoveryLimitError();
                await options.beforeModelCall?.();
              },
              options.callModel,
            );
          } catch (error) {
            if (mode !== "tech") throw error;
            if (error instanceof RefusalRecoveryLimitError)
              return keepOriginal(subset, "recovery_limit");
            if (!(error instanceof ContentRefusalError)) throw error;
            if (subset.length === 1)
              return keepOriginal(subset, "content_refused");
            await options.onProgress?.({
              stage: "translating",
              completed,
              total: chunks.length,
              message:
                "模型拒绝了部分内容，正在按段缩小范围；被拒绝的段落将保留原文",
            });
            // Sequential subdivision stays within the existing article concurrency.
            // Never redact words, resend a rejected leaf, or send protected code.
            const middle = Math.ceil(subset.length / 2);
            const left = await translate(subset.slice(0, middle), true);
            chunkSignal.throwIfAborted();
            const right = await translate(subset.slice(middle), true);
            return mergeRecovered([left, right]);
          }
        };
        if (editable.length) validated = await translate(editable);
        return validated;
      };
      const validated = options.withValidatedChunk
        ? await options.withValidatedChunk(chunk, generateChunk)
        : await generateChunk();
      completed++;
      await options.onProgress?.({
        stage: "translating",
        completed,
        total: chunks.length,
        message: `已处理 ${completed} / ${chunks.length} 个分块${validated.untranslated?.length ? "，部分段落保留原文" : ""}`,
      });
      return validated;
    },
    signal,
  );
  const untranslated = translated.flatMap((part) => part.untranslated ?? []);
  if (untranslated.length) {
    if (
      untranslated.length === blocks.filter((block) => !isLiteral(block)).length
    )
      throw new AppError(
        "模型内容拒绝后未得到可用译文，原文和已有版本已保留。可阅读原文或调整材料后再试。",
        422,
      );
    all.untranslated = untranslated;
  }
  for (const [i, chunk] of chunks.entries()) {
    const validated = translated[i];
    all.title = validated.title;
    const prefix = `c${i}_`;
    all.terms.push(
      ...validated.terms.map((t) => ({ ...t, id: prefix + t.id })),
    );
    for (const block of chunk) {
      if (isLiteral(block))
        all.paragraphs.push({
          id: block.id,
          original: block.original,
          segments: [{ type: "text", text: block.original }],
        });
      else {
        const p = validated.paragraphs.find((p) => p.id === block.id)!;
        all.paragraphs.push({
          ...p,
          segments: p.segments.map((s) =>
            s.type === "term" ? { ...s, termId: prefix + s.termId } : s,
          ),
        });
      }
    }
  }
  return all;
}
export function validateTargets(
  result: Generation,
  settings: Settings,
  mode: string,
  targets: { id: string; lemma: string }[],
  known: { lemma: string }[] = [],
): Coverage {
  const used = new Set(
    result.paragraphs.flatMap((p) =>
      p.segments.flatMap((s) => (s.type === "term" ? [s.termId] : [])),
    ),
  );
  const terms = result.terms.filter((t) => used.has(t.id));
  const invalid = result.paragraphs
    .flatMap((p) => p.segments)
    .some(
      (s) => s.type === "term" && !result.terms.some((t) => t.id === s.termId),
    );
  if (invalid) throw new AppError("模型输出包含未定义词条", 502);
  const reviewIds = new Set(targets.map((t) => t.id));
  for (const t of terms) {
    if (
      t.reviewVocabularyId &&
      (!reviewIds.has(t.reviewVocabularyId) ||
        normalizeLemma(
          targets.find((r) => r.id === t.reviewVocabularyId)!.lemma,
          "de",
        ) !== normalizeLemma(t.lemma, "de"))
    )
      throw new AppError("模型复习词映射错误，已拒绝保存", 502);
    if (
      mode === "german" &&
      t.partOfSpeech === "noun" &&
      (!["der", "die", "das"].includes(t.grammar.article) || !t.grammar.plural)
    )
      throw new AppError("德语名词缺少有效冠词或复数", 502);
    if (
      mode === "german" &&
      t.partOfSpeech === "verb" &&
      (!t.grammar.infinitive || !t.grammar.currentForm)
    )
      throw new AppError("德语动词缺少原形或当前形式", 502);
  }
  const fresh = Array.from(
    new Map(
      terms
        .filter((t) => !t.reviewVocabularyId)
        .map((t) => [
          normalizeLemma(t.lemma, mode === "tech" ? "en" : "de"),
          t,
        ]),
    ).values(),
  );
  const review = terms.filter((t) => t.reviewVocabularyId);
  const missing = targets
    .filter((r) => !review.some((t) => t.reviewVocabularyId === r.id))
    .map((t) => t.lemma);
  if (mode === "german") {
    const wanted = settings.reviewOnly ? 0 : settings.newWordCount;
    if (fresh.length !== wanted)
      throw new AppError(
        `实际覆盖 ${fresh.length} 个新词，与设置的 ${wanted} 个不一致，已拒绝保存。可重试或调整设置。`,
        502,
      );
    if (
      fresh.some((t) =>
        known.some(
          (k) =>
            normalizeLemma(k.lemma, "de") === normalizeLemma(t.lemma, "de"),
        ),
      )
    )
      throw new AppError("模型将已有词汇当作新词，已拒绝保存，请重试", 502);
    const requested = settings.requestedWords
      .split(/[,，;；\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (
      !settings.reviewOnly &&
      requested.some(
        (word) =>
          !fresh.some(
            (t) => normalizeLemma(t.lemma, "de") === normalizeLemma(word, "de"),
          ),
      )
    )
      throw new AppError(
        "指定学习词未全部覆盖，已拒绝保存，请检查词数与词典原形",
        502,
      );
  }
  return {
    newWords: fresh.map((t) => t.lemma),
    reviewWords: [...new Set(review.map((t) => t.lemma))],
    requestedNew:
      mode === "german"
        ? settings.reviewOnly
          ? 0
          : settings.newWordCount
        : fresh.length,
    requestedReview: targets.length,
    missing,
    ...(result.untranslated?.length
      ? { untranslated: result.untranslated }
      : {}),
  };
}
export function validateNewGerman(result: Generation) {
  const termIds = new Set(result.terms.map((t) => t.id));
  if (termIds.size !== result.terms.length)
    throw new AppError("模型词条 ID 重复", 502);
  const source = result.paragraphs
    .map((p, i) => {
      if (p.id !== `p${String(i + 1).padStart(4, "0")}` || !p.original?.trim())
        throw new AppError("德语全文或段落对应缺失", 502);
      if (parseSource(p.original).length !== 1)
        throw new AppError("德语原文段落必须逐段对应", 502);
      assertNoGeneratedMarkup(p.original);
      assertNoGeneratedMarkup(
        p.segments.map((segment) => segment.text).join(""),
      );
      if (p.segments.some((s) => s.type === "term" && !termIds.has(s.termId)))
        throw new AppError("未定义的德语词条", 502);
      return p.original;
    })
    .join("\n\n");
  if (parseSource(source).length !== result.paragraphs.length)
    throw new AppError("德语全文段落结构不一致", 502);
}
export function validateSourceSentences(result: Generation) {
  for (const paragraph of result.paragraphs)
    for (const segment of paragraph.segments)
      if (
        segment.type === "term" &&
        !sourceContainsSentence(paragraph.original ?? "", segment.sentence)
      )
        throw new AppError("词卡原句与对应原文段落不一致，已拒绝保存", 502);
}
function validateTechnicalProse(
  result: Generation,
  blocks: SourceBlock[],
  settings: Settings,
) {
  for (const [index, paragraph] of result.paragraphs.entries()) {
    const block = blocks[index];
    if (block.kind === "heading") continue;
    const source = block.masked.replace(/⟦PROTECTED_\d+_\d+⟧/g, "");
    const letters = (source.match(/[a-z]/gi) ?? []).length;
    if (letters < 16) continue;
    const distinct = new Set(
      paragraph.segments.flatMap((segment) =>
        segment.type === "term" ? [segment.termId] : [],
      ),
    );
    const maximum = settings.retention === "high" ? 3 : 2;
    if (letters <= 120 && distinct.size > maximum)
      throw new AppError(
        `模型把短段落拆成了过多零散词。该段最多保留 ${maximum} 个连续完整表达，其他内容请自然翻译成中文。`,
        502,
      );
    let translated = paragraph.segments
      .filter((segment) => segment.type === "text")
      .map((segment) => segment.text)
      .join("");
    for (const literal of Object.values(block.protected))
      translated = translated.replaceAll(literal, "");
    if (!/[\u3400-\u9fff]/.test(translated))
      throw new AppError(
        "模型没有将英文正文翻译成中文。请在普通 text 片段中完整表达原文意思，只保留少量有价值的英文表达。",
        502,
      );
  }
}

class RefusalRecoveryLimitError extends AppError {
  constructor() {
    super("已达到内容拒绝定位的额外请求上限", 429);
  }
}
