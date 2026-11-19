"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Mic2, Play, Square, Volume2 } from "lucide-react";

export function PracticePlayer({
  source,
  language,
  speed,
  onSpeed,
  speaking,
}: {
  source: string;
  language: string;
  speed: number;
  onSpeed: (speed: number) => void;
  speaking: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const voices = useRef<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const update = () => {
      voices.current = synth.getVoices();
    };
    update();
    synth.addEventListener("voiceschanged", update);
    return () => {
      synth.removeEventListener("voiceschanged", update);
      if (utterance.current) {
        utterance.current.onend = null;
        utterance.current.onerror = null;
        synth.cancel();
      }
    };
  }, []);
  function play() {
    if (!("speechSynthesis" in window)) {
      setError("当前浏览器没有语音朗读功能，请使用支持语音的 Chrome 或 Edge。");
      return;
    }
    const synth = window.speechSynthesis;
    if (playing) {
      synth.cancel();
      setPlaying(false);
      return;
    }
    const voice = [...synth.getVoices(), ...voices.current].find((v) =>
      v.lang.toLowerCase().startsWith(language),
    );
    if (!voice) {
      setError(
        `没有可用的${language === "de" ? "德语" : "英语"}语音。请在设备语言设置中安装对应语音包后重试。`,
      );
      return;
    }
    synth.cancel();
    setError("");
    const speech = new SpeechSynthesisUtterance(source);
    speech.lang = voice.lang;
    speech.voice = voice;
    speech.rate = speed;
    speech.onend = () => setPlaying(false);
    speech.onerror = (event) => {
      setPlaying(false);
      if (!["canceled", "interrupted"].includes(event.error))
        setError("播放失败，请检查设备声音和语音设置后重试。");
    };
    utterance.current = speech;
    setPlaying(true);
    synth.speak(speech);
  }
  return (
    <div className="practice-audio">
      <div className={`practice-player ${playing ? "is-playing" : ""}`}>
        <button
          type="button"
          className="play-main"
          onClick={play}
          aria-label={
            playing ? "停止播放" : speaking ? "听示范朗读" : "播放这一段"
          }
        >
          <span className="play-disc">
            {playing ? (
              <Square size={22} fill="currentColor" />
            ) : (
              <Play size={25} fill="currentColor" />
            )}
          </span>
          <span>
            <strong>
              {playing ? "停止播放" : speaking ? "听示范朗读" : "播放这一段"}
            </strong>
            <small>
              {playing
                ? "正在朗读，跟着节奏听"
                : speaking
                  ? "听节奏，再自己说一次"
                  : "先听一遍，试着抓住重点"}
            </small>
          </span>
        </button>
        <div className="audio-wave" aria-hidden="true">
          {Array.from({ length: 15 }, (_, i) => (
            <i key={i} style={{ height: `${12 + ((i * 17) % 34)}px` }} />
          ))}
        </div>
        <label className="play-speed">
          语速
          <select
            aria-label="朗读语速"
            value={speed}
            onChange={(e) => {
              if (playing) {
                window.speechSynthesis.cancel();
                setPlaying(false);
              }
              onSpeed(Number(e.target.value));
            }}
          >
            <option value={0.65}>慢速</option>
            <option value={0.9}>正常</option>
            <option value={1.1}>稍快</option>
          </select>
        </label>
      </div>
      <p className="audio-caption">
        <Volume2 size={13} /> 浏览器{language === "de" ? "德语" : "英语"}语音 ·
        可重复播放
      </p>
      {error && (
        <p className="practice-notice error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Record locally for listening back; never send microphone audio to an API. */
export function PracticeRecorder() {
  const [recording, setRecording] = useState(false);
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  async function toggle() {
    if (pending.current) return;
    if (recorder.current?.state === "recording") {
      recorder.current.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window)) {
      setMessage(
        "当前浏览器无法录音。请使用 HTTPS 或本机地址，并允许麦克风访问。",
      );
      return;
    }
    pending.current = true;
    setMessage("");
    try {
      const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        audio.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = audio;
      const media = new MediaRecorder(audio);
      recorder.current = media;
      const chunks: BlobPart[] = [];
      media.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      const timeout = setTimeout(() => {
        if (media.state === "recording") media.stop();
      }, 180000);
      media.onstop = () => {
        clearTimeout(timeout);
        audio.getTracks().forEach((t) => t.stop());
        if (mounted.current) {
          setRecording(false);
          setUrl(
            URL.createObjectURL(new Blob(chunks, { type: media.mimeType })),
          );
        }
      };
      media.onerror = () => {
        audio.getTracks().forEach((t) => t.stop());
        if (mounted.current) {
          setRecording(false);
          setMessage("录音中断，请检查麦克风权限后重试。");
        }
      };
      media.start();
      setRecording(true);
    } catch {
      stream.current?.getTracks().forEach((t) => t.stop());
      if (mounted.current)
        setMessage("未能打开麦克风，请允许本站使用麦克风后重试。");
    } finally {
      pending.current = false;
    }
  }
  return (
    <div className="practice-recorder">
      <div>
        <button
          type="button"
          className={`button ${recording ? "recording" : ""}`}
          onClick={() => void toggle()}
        >
          {recording ? <Square size={17} /> : <Mic2 size={18} />}
          {recording ? "停止录音" : url ? "重新录一遍" : "录下我的回答"}
        </button>
        <span>
          {recording
            ? "录音中 · 最长 3 分钟"
            : "说完回听，发现停顿和卡住的地方"}
        </span>
      </div>
      {url && (
        <div className="recording-playback">
          <audio src={url} controls />
          <a href={url} download="wordweave-speaking">
            保存录音 <Download size={14} />
          </a>
        </div>
      )}
      <small>
        录音只留在当前页面，离开前可下载。不上传，不自动转写或评分。
      </small>
      {message && (
        <p role="alert" className="practice-notice error">
          {message}
        </p>
      )}
    </div>
  );
}
