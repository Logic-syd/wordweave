import {
  freshBrowserData,
  openDatabase,
  type BrowserData,
} from "./browser-store";
import {
  practiceMaterialSchema,
  type PracticeMaterial,
} from "./practice-schemas";

export const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
export function validateAudio(file: Pick<File, "name" | "size" | "type">) {
  if (!/\.(mp3|wav|m4a|ogg|webm|aac|flac)$/i.test(file.name))
    throw new Error(
      "请选择 MP3、WAV、M4A、OGG、WebM、AAC 或 FLAC 音频。 / Choose a supported audio file.",
    );
  if (!file.size || file.size > MAX_AUDIO_BYTES)
    throw new Error(
      "音频不能为空，最大 20 MB。 / Audio must be non-empty and at most 20 MB.",
    );
  if (
    file.type &&
    !file.type.startsWith("audio/") &&
    ![
      "video/mp4",
      "video/webm",
      "application/ogg",
      "application/octet-stream",
    ].includes(file.type)
  )
    throw new Error("这个文件不是音频。 / This file is not audio.");
}
/** Store the blob and material atomically. No audio is uploaded or put in JSON exports. */
export async function saveAudioMaterial(value: PracticeMaterial, file: File) {
  validateAudio(file);
  const material = practiceMaterialSchema.parse(value);
  if (!material.audio) throw new Error("Missing audio metadata");
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("data", "readwrite"),
      store = tx.objectStore("data");
    const request = store.get("learning");
    let failure: Error | undefined;
    request.onsuccess = () => {
      const data: BrowserData = request.result ?? freshBrowserData();
      if (
        data.practice.materials.length >= 200 &&
        !data.practice.materials.some((m) => m.id === material.id)
      ) {
        failure = new Error(
          "材料已达 200 份，请先整理。 / Your library has 200 materials.",
        );
        tx.abort();
        return;
      }
      data.practice.materials = [
        material,
        ...data.practice.materials.filter((m) => m.id !== material.id),
      ];
      store.put(
        file.slice(0, file.size, file.type),
        `audio:${material.audio!.id}`,
      );
      store.put(data, "learning");
    };
    tx.oncomplete = () => {
      window.dispatchEvent(new Event("wordweave:local-data"));
      resolve();
    };
    tx.onabort = tx.onerror = () =>
      reject(
        failure ??
          new Error(
            "音频保存失败，请检查浏览器存储空间。文件未上传。 / Could not save audio. Check browser storage space. Nothing was uploaded.",
          ),
      );
  });
}
export async function readAudio(id: string): Promise<Blob> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("data", "readonly")
      .objectStore("data")
      .get(`audio:${id}`);
    request.onsuccess = () =>
      request.result instanceof Blob
        ? resolve(request.result)
        : reject(
            new Error(
              "找不到本机音频，请重新导入。 / Audio is missing from this browser. Import it again.",
            ),
          );
    request.onerror = () =>
      reject(new Error("无法读取音频 / Unable to load audio"));
  });
}
