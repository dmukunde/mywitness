"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { formatDurationFromMs } from "@/lib/utils";
import {
  VOICE_NOTE_BITS_PER_SECOND,
  VOICE_NOTE_MAX_SECONDS,
} from "@/lib/ai/limits";

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
  /** Called with the finished recording and how long it ran, in milliseconds. */
  onComplete?: (blob: Blob, durationMs: number) => void;
}

const MAX_MS = VOICE_NOTE_MAX_SECONDS * 1000;

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
  // Lets the timer end the recording at the limit without a circular dependency.
  const finishRef = useRef<() => void>(() => undefined);

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const tick = useCallback(() => {
    const total = accumulatedRef.current + (Date.now() - startedAtRef.current);
    setDurationMs(Math.min(total, MAX_MS));
    // A voice note stops by itself at the limit and is processed as normal.
    if (total >= MAX_MS) finishRef.current();
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

      // A modest, speech-quality bitrate keeps even a full-length note small
      // enough to upload, whichever phone it was recorded on.
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: VOICE_NOTE_BITS_PER_SECOND,
      });
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
        onComplete?.(blob, accumulatedRef.current);
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
    if (recorder.state !== "paused") {
      accumulatedRef.current += Date.now() - startedAtRef.current;
    }
    clearTimer();
    setDurationMs(Math.min(accumulatedRef.current, MAX_MS));
    recorder.stop();
    setStatus("uploading");
  }, []);

  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

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
    maxSupportedMs: MAX_MS,
  };
}
