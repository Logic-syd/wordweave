/** Explicit local persistence adapter. These application paths never leave the browser. */
import { AppError } from "./app-error";
import {
  createLocalArticle,
  deleteLocalArticle,
  localArticle,
  localPracticeState,
  localWords,
  saveLocalPractice,
  saveLocalPracticeWord,
  saveLocalProgress,
  updateLocalWord,
} from "./browser-store";
import { generateLocalArticle, localPracticeAi } from "./browser-generation";
import { practiceWordSchema, studyWriteSchema } from "./practice-schemas";
import { settingsSchema } from "./schemas";
export async function browserApi(
  path: string,
  body?: unknown,
  method = "POST",
  signal?: AbortSignal,
  requestKey = crypto.randomUUID(),
): Promise<unknown> {
  if (body === undefined && method === "POST") method = "GET";
  if (path === "/api/practice")
    return method === "GET"
      ? localPracticeState()
      : {
          saved: true,
          value: await saveLocalPractice(studyWriteSchema.parse(body)),
        };
  if (path.startsWith("/api/practice/ai/"))
    return localPracticeAi(path.split("/").pop()!, body);
  if (path === "/api/vocabulary")
    return method === "GET"
      ? localWords()
      : saveLocalPracticeWord(practiceWordSchema.parse(body));
  if (path.startsWith("/api/vocabulary/"))
    return updateLocalWord(decodeURIComponent(path.split("/").pop()!), body);
  if (path === "/api/articles" && method === "POST")
    return createLocalArticle(body, requestKey);
  const match =
    /^\/api\/articles\/(local-article-[\w-]+)(?:\/(progress|generate))?$/.exec(
      path,
    );
  if (match) {
    const [, id, action] = match;
    if (action === "generate")
      return {
        versionId: (
          await generateLocalArticle(id, settingsSchema.parse(body), signal)
        ).version!.id,
      };
    if (action === "progress") return saveLocalProgress(id, body);
    if (method === "DELETE") {
      await deleteLocalArticle(id);
      return { deleted: true };
    }
    return localArticle(id);
  }
  throw new AppError("本地操作不存在。", 404);
}
export async function browserFetch(path: string, options: RequestInit = {}) {
  try {
    const data = await browserApi(
      path,
      typeof options.body === "string" ? JSON.parse(options.body) : undefined,
      options.method ?? "GET",
      options.signal ?? undefined,
      new Headers(options.headers).get("Idempotency-Key") ?? undefined,
    );
    return Response.json(data ?? { ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "本地操作失败" },
      { status: error instanceof AppError ? error.status : 400 },
    );
  }
}
