import { z } from "zod";
import { AppError } from "./app-error";
import {
  browserData,
  localArticle,
  localWords,
  localReviewWords,
  saveLocalVersion,
} from "./browser-store";
import {
  generateTranslated,
  validatedModel,
  validateNewGerman,
  validateSourceSentences,
  validateTargets,
} from "./generation-engine";
import {
  GenerationRetryBudget,
  compactVocabularyContext,
} from "./generation-limits";
import {
  browserCompletion,
  browserGenerationModel,
  modelEndpoint,
  readBrowserAi,
} from "./browser-ai";
import { settingsSchema, type Generation, type Settings } from "./schemas";
import {
  gradeInputSchema,
  materialInputSchema,
  materialResultSchema,
  practiceAiGradeSchema,
} from "./practice-schemas";
import {
  gradeInstructions,
  materialInstructions,
} from "../../workbench/server/ai.mjs";
import { sampleVocabulary } from "./sample-storage";

const active = new Set<string>();
export async function recoverLocalArticle(id: string) {
  const article = await localArticle(id);
  if (article.generationStartedAt && !active.has(id)) {
    const locks = await navigator.locks?.query();
    if (!locks?.held?.some((l) => l.name === `wordweave-generate:${id}`))
      return browserData(true, (data) => {
        const a = data.articles[id];
        a.generationStartedAt = null;
        a.generationProgress = null;
        a.generationError =
          "上次生成已中断，原文和已有版本保留。请点击设置重新生成。";
        return a;
      });
  }
  return article;
}
export async function generateLocalArticle(
  id: string,
  input: Settings,
  externalSignal?: AbortSignal,
) {
  const settings = settingsSchema.parse(input);
  const work = async () => {
    if (active.has(id))
      throw new AppError("这篇文章正在生成，请勿重复提交。", 409);
    active.add(id);
    const signal = externalSignal
      ? AbortSignal.any([externalSignal, AbortSignal.timeout(240000)])
      : AbortSignal.timeout(240000);
    try {
      const a = await localArticle(id),
        startedAt = new Date().toISOString();
      const config = readBrowserAi(),
        call = browserGenerationModel(config);
      modelEndpoint(config);
      const progress = async (value: {
        stage: string;
        completed: number;
        total: number;
        message?: string;
      }) => {
        await browserData(true, (data) => {
          const article = data.articles[id];
          if (!article) throw new AppError("文章已删除。", 404);
          article.generationStartedAt = startedAt;
          article.generationError = null;
          article.generationProgress = {
            ...value,
            startedAt,
            updatedAt: new Date().toISOString(),
          };
        });
      };
      await progress({
        stage: "preparing",
        completed: 0,
        total: 0,
        message: "使用自己的 API，原文保留在这个浏览器",
      });
      const known = [
          ...(await localWords()),
          ...sampleVocabulary().filter((w) => w.user),
        ],
        targets = a.mode === "german" ? await localReviewWords() : [];
      if (a.mode === "german" && settings.reviewOnly && !targets.length)
        throw new AppError("还没有待复习词，请先收藏几个想学的德语词。");
      const context = {
        settings,
        reviewTargets: targets,
        existingVocabulary: known
          .filter((w) => w.language === a.language)
          .map((w) => ({ ...w, status: w.user?.status ?? "NEW" })),
        sourceIsUntrusted: true,
      };
      const validate = (result: Generation) => {
        if (a.mode === "german")
          result.terms = result.terms.map((t) => ({
            ...t,
            lemma:
              t.partOfSpeech === "noun"
                ? t.lemma.replace(/^(der|die|das)\s+/i, "")
                : t.lemma,
          }));
        if (!a.sourceText) validateNewGerman(result);
        validateTargets(
          result,
          settings,
          a.mode,
          targets,
          known.filter((w) => w.language === a.language),
        );
        validateSourceSentences(result);
        return result;
      };
      const retryBudget = new GenerationRetryBudget(2);
      const result = a.sourceText
        ? await generateTranslated(
            a.sourceBlocks,
            settings,
            a.mode,
            context,
            signal,
            { onProgress: progress, retryBudget, validate, callModel: call },
          )
        : await validatedModel(
            "创作以中文为主、嵌入德语词的连贯生活短文。同一段的 original 必须是自然的完整德语，难度按 settings.level。id 从 p0001 连续递增。时长 3-5 分钟写约650-1000字中文、8-14段；5-8分钟约1100-1600字。新词数严格等于 settings.newWordCount，reviewOnly 时为0，合理使用 reviewTargets 并标记 reviewVocabularyId。已有词不得算新词，指定学习词必须覆盖。term.sentence 逐字引用所在段 original 中的完整句子。保留冠词、格、变位的实际语法。不要添加 HTML、代码、图片、链接。",
            compactVocabularyContext(context),
            validate,
            retryBudget,
            signal,
            () =>
              progress({
                stage: "translating",
                completed: 0,
                total: 1,
                message: "正在校验并修正短文",
              }),
            undefined,
            call,
          );
      signal.throwIfAborted();
      const coverage = validateTargets(
        result,
        settings,
        a.mode,
        targets,
        known.filter((w) => w.language === a.language),
      );
      const saved = await saveLocalVersion(id, result, settings, coverage);
      window.dispatchEvent(new Event("wordweave:vocabulary"));
      return saved;
    } catch (error) {
      const message =
        error instanceof AppError
          ? error.message
          : "生成结果未通过校验，输入和已有版本保留。可以重试。";
      await browserData(true, (data) => {
        if (data.articles[id]) {
          data.articles[id].generationStartedAt = null;
          data.articles[id].generationProgress = null;
          data.articles[id].generationError = message;
        }
      });
      throw new AppError(
        message,
        error instanceof AppError ? error.status : 502,
      );
    } finally {
      active.delete(id);
    }
  };
  if (navigator.locks)
    return navigator.locks.request(
      `wordweave-generate:${id}`,
      { ifAvailable: true },
      (lock) => {
        if (!lock) throw new AppError("另一个页面正在生成这篇文章。", 409);
        return work();
      },
    );
  return work();
}

const feedbackCache = new Map<string, unknown>();
const pending = new Set<string>();
export async function localPracticeAi(action: string, body: unknown) {
  const input = (
      action === "grade" ? gradeInputSchema : materialInputSchema
    ).parse(body),
    config = readBrowserAi();
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify([action, config, input])),
  );
  const key = Array.from(new Uint8Array(bytes), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
  if (feedbackCache.has(key)) return feedbackCache.get(key);
  if (pending.has(key)) throw new AppError("这份内容正在处理，请稍候。", 409);
  pending.add(key);
  try {
    const schema =
      action === "grade" ? practiceAiGradeSchema : materialResultSchema;
    const payload =
      "paragraphs" in input
        ? {
            ...input,
            paragraphs: input.paragraphs.map((text, index) => ({
              text,
              index,
            })),
          }
        : input;
    const result = schema.parse(
      await browserCompletion(
        (action === "grade" ? gradeInstructions : materialInstructions) +
          "\nReturn only JSON matching this schema: " +
          JSON.stringify(z.toJSONSchema(schema)),
        payload,
        undefined,
        config,
      ),
    );
    if (
      "paragraphs" in result &&
      "paragraphs" in input &&
      (result.paragraphs.length !== input.paragraphs.length ||
        result.paragraphs.some((p, i) => p.index !== i))
    )
      throw new AppError("生成的段落对应关系有误，原文保留，可重试。", 502);
    const final = action === "grade" ? { ...result, method: "ai" } : result;
    if (feedbackCache.size >= 100)
      feedbackCache.delete(feedbackCache.keys().next().value!);
    feedbackCache.set(key, final);
    return final;
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      throw new AppError("模型回复格式不正确，原文和答案已保留，请重试。", 502);
    throw error;
  } finally {
    pending.delete(key);
  }
}
