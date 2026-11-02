import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyFailure,
  describeRefusal,
  isAuthError,
  isNetworkError,
  withTimeout,
} from "@/lib/offline/errors";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("isNetworkError", () => {
  it("recognises the ways a phone with no signal fails", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new TypeError("Load failed"))).toBe(true); // iPhone
    expect(isNetworkError(new TypeError("NetworkError when attempting to fetch resource."))).toBe(true);
    expect(isNetworkError({ message: "TypeError: Failed to fetch", details: "", code: "" })).toBe(true);
    expect(isNetworkError({ name: "AbortError", message: "The user aborted a request." })).toBe(true);
    expect(isNetworkError({ name: "AuthRetryableFetchError", message: "x" })).toBe(true);
    expect(isNetworkError({ status: 0 })).toBe(true);
    expect(isNetworkError({ status: 503 })).toBe(true);
    expect(isNetworkError(Object.assign(new Error("Request timed out"), { name: "TimeoutError" }))).toBe(true);
  });

  it("does not mistake a refusal from the server for no signal", () => {
    expect(isNetworkError({ message: "new row violates row-level security policy", code: "42501", status: 403 })).toBe(false);
    expect(isNetworkError({ message: "duplicate key value violates unique constraint", code: "23505", status: 409 })).toBe(false);
    expect(isNetworkError({ message: "invalid input syntax for type uuid", code: "22P02", status: 400 })).toBe(false);
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });

  it("treats any failure as no-signal when the browser says it is offline", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isNetworkError({ message: "something odd" })).toBe(true);
  });
});

describe("isAuthError / classifyFailure", () => {
  it("recognises a sign-in that is no longer accepted", () => {
    expect(isAuthError({ status: 401, message: "JWT expired" })).toBe(true);
    expect(isAuthError({ code: "PGRST301", message: "JWT expired" })).toBe(true);
    expect(isAuthError({ message: "Invalid Refresh Token: Refresh Token Not Found" })).toBe(true);
    expect(isAuthError({ status: 403, code: "42501", message: "permission denied" })).toBe(false);
  });

  it("sorts every failure into: wait for signal, sign in again, or refused", () => {
    expect(classifyFailure(new TypeError("Failed to fetch"))).toBe("network");
    expect(classifyFailure({ status: 401, message: "JWT expired" })).toBe("auth");
    expect(classifyFailure({ status: 400, code: "22P02", message: "bad uuid" })).toBe("refused");
  });
});

describe("describeRefusal", () => {
  it("gives a readable reason and never dumps raw data", () => {
    expect(describeRefusal({ message: "new row violates check constraint" })).toBe("new row violates check constraint");
    expect(describeRefusal({ message: '{"hint":"x"}' })).toBe("The server did not accept this change.");
    expect(describeRefusal(null)).toBe("The server did not accept this change.");
    expect(describeRefusal({ message: "x".repeat(500) }).length).toBeLessThanOrEqual(160);
  });
});

describe("withTimeout", () => {
  it("returns the result if it arrives in time", async () => {
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7);
  });

  it("gives up with a timeout error, which counts as no signal", async () => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => undefined);
    const result = withTimeout(never, 5000);
    const assertion = expect(result).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(5001);
    await assertion;
    await vi.runAllTimersAsync();
    expect(isNetworkError(await result.catch((e) => e))).toBe(true);
  });

  it("passes failures through", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1000)).rejects.toThrow("boom");
  });
});
