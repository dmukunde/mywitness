"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { formatDurationFromMs } from "@/lib/utils";

export type RecorderStatus =
  | "idle"
  | "recording"
  | "paused"
  | "uploading"
  | "transcribing"
  | "extracting"
  | "complete"
  | "failed";

interface UseVoiceRecorderOptions {
  onComplete?: (blob: Blob) => void;
}

export function useVoiceRecorder({ onComplete }: UseVoiceRecorderOptions = {}) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const accumulatedRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const tick = useCallback(() => {
    setDurationMs(accumulatedRef.current + (Date.now() - startedAtRef.current));
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    startedAtRef.current = Date.now();
    timerRef.current = window.setInterval(tick, 200);
  }, [tick]);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const start = useCallback(async () => {
    try {
      setError(null);
      chunksRef.current = [];
      accumulatedRef.current = 0;
      setDurationMs(0);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : undefined;

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        clearTimer();
        stopTracks();
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        onComplete?.(blob);
      };

      recorder.start(1000);
      setStatus("recording");
      startTimer();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Microphone permission is required to record."
      );
      setStatus("failed");
    }
  }, [onComplete, startTimer]);

  const pause = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.pause();
    accumulatedRef.current += Date.now() - startedAtRef.current;
    clearTimer();
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    recorder.resume();
    setStatus("recording");
    startTimer();
  }, [startTimer]);

  const cancel = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    clearTimer();
    stopTracks();
    chunksRef.current = [];
    accumulatedRef.current = 0;
    setDurationMs(0);
    setStatus("idle");
  }, []);

  const finish = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    if (recorder.state === "paused") {
      accumulatedRef.current += 0;
    } else {
      accumulatedRef.current += Date.now() - startedAtRef.current;
    }
    clearTimer();
    setDurationMs(accumulatedRef.current);
    recorder.stop();
    setStatus("uploading");
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
      stopTracks();
    };
  }, []);

  return {
    status,
    setStatus,
    durationMs,
    durationLabel: formatDurationFromMs(durationMs),
    error,
    setError,
    start,
    pause,
    resume,
    cancel,
    finish,
    maxSupportedMs: 10 * 60 * 1000,
  };
}
