import { AppError } from "./app-error";
/** Public BYOK pages never call these endpoints; legacy owner AI is opt-in. */
export function assertServerAiEnabled() {
  if (process.env.SERVER_AI_ENABLED !== "true")
    throw new AppError(
      "网站代付 AI 已关闭。请在「我的 API」填写自己的 Key，由浏览器直接调用。",
      403,
    );
}
