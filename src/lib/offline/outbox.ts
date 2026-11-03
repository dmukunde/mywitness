import { classifyFailure, describeRefusal } from "@/lib/offline/errors";
import { keys } from "@/lib/offline/snapshot";
import type { KeyValueStore } from "@/lib/offline/store";

/**
 * The list of changes made on the phone that have not reached the server yet.
 *
 * Every change is written here (and to the phone's storage) BEFORE anything is
 * sent, so signal can come and go without losing it. Changes are sent in the
 * order they were made. If there is no signal the change simply waits. If the
 * server refuses it, it is kept and marked "failed" so the person can retry or
 * discard it. It never disappears silently.
 */

export type OutboxTable = "ministry_sessions" | "people" | "areas";

export interface OutboxOp {
  id: string;
  table: OutboxTable;
  kind: "insert" | "update" | "delete";
  /** The record this change is about. */
  rowId: string;
  /** The columns to send to the server (insert or update). */
  payload?: Record<string, unknown>;
  /** For an insert: the whole record as the app shows it, so it can be seen before it is sent. */
  row?: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  status: "pending" | "failed";
  /** Why the server refused it, in words the person can read. */
  error?: string;
}

export function createOp(
  input: Pick<OutboxOp, "table" | "kind" | "rowId" | "payload" | "row">,
  now: Date = new Date(),
  id: string = crypto.randomUUID()
): OutboxOp {
  return { ...input, id, createdAt: now.toISOString(), attempts: 0, status: "pending" };
}

/**
 * The records to show: the server's rows with the changes still waiting laid on
 * top, so the person sees their own latest changes straight away. Changes the
 * server has refused ("failed") are not shown.
 */
export function applyOps<T extends { id: string }>(
  rows: T[],
  ops: OutboxOp[],
  table: OutboxTable
): T[] {
  let result = rows;
  for (const op of ops) {
    if (op.table !== table || op.status !== "pending") continue;
    if (op.kind === "insert") {
      if (!result.some((r) => r.id === op.rowId) && op.row) {
        result = [op.row as unknown as T, ...result];
      }
    } else if (op.kind === "update") {
      result = result.map((r) => (r.id === op.rowId ? { ...r, ...op.payload } : r));
    } else {
      result = result.filter((r) => r.id !== op.rowId);
    }
  }
  return result;
}

/** Sends one change to the server. Throws if it could not be sent. */
export type SendFn = (op: OutboxOp) => Promise<void>;

export interface FlushResult {
  sent: number;
  pending: number;
  failed: number;
  /** Why sending stopped early: no signal, or the sign-in is no longer accepted. */
  stoppedBy: "network" | "auth" | null;
}

export class Outbox {
  private ops: OutboxOp[] = [];
  private flushing: Promise<FlushResult> | null = null;
  private writing: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();

  constructor(
    private readonly store: KeyValueStore,
    private readonly userId: string
  ) {}

  /** Reads whatever was left from last time (for example when the app was closed with changes waiting). */
  async load(): Promise<OutboxOp[]> {
    const saved = await this.store.get<OutboxOp[]>(keys.outbox(this.userId));
    this.ops = Array.isArray(saved) ? saved.filter((o) => o && typeof o.id === "string") : [];
    this.notify();
    return this.all();
  }

  all(): OutboxOp[] {
    return this.ops.map((o) => ({ ...o }));
  }

  get pendingCount(): number {
    return this.ops.filter((o) => o.status === "pending").length;
  }

  failed(): OutboxOp[] {
    return this.ops.filter((o) => o.status === "failed").map((o) => ({ ...o }));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  /** Writes the current list to the phone, one write at a time, always the latest list. */
  private persist(): Promise<void> {
    this.writing = this.writing
      .catch(() => undefined)
      .then(() => this.store.set(keys.outbox(this.userId), this.ops.map((o) => ({ ...o }))));
    return this.writing;
  }

  /** Adds a change and does not return until it is safely stored on the phone. */
  async enqueue(op: OutboxOp): Promise<OutboxOp> {
    this.ops = [...this.ops, op];
    this.notify();
    await this.persist();
    return op;
  }

  /**
   * Adds several changes that belong together (for example a new area and the
   * new person in it) as one step: they are stored together, so the app can't
   * be closed between them, and they are sent in this order.
   */
  async enqueueAll(ops: OutboxOp[]): Promise<void> {
    this.ops = [...this.ops, ...ops];
    this.notify();
    await this.persist();
  }

  /** Tries to send everything waiting, in order. Only one run at a time. */
  flush(send: SendFn): Promise<FlushResult> {
    if (this.flushing) return this.flushing;
    this.flushing = this.runFlush(send).finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async runFlush(send: SendFn): Promise<FlushResult> {
    let sent = 0;
    let stoppedBy: FlushResult["stoppedBy"] = null;
    const tried = new Set<string>();
    const refusedRows = new Set<string>();

    for (;;) {
      const op = this.ops.find((o) => o.status === "pending" && !tried.has(o.id));
      if (!op) break;
      tried.add(op.id);

      // Don't send a change to a record whose earlier change was refused.
      if (refusedRows.has(op.rowId)) {
        op.status = "failed";
        op.error = "An earlier change to this entry could not be saved.";
        await this.persist();
        this.notify();
        continue;
      }

      try {
        await send(op);
        this.ops = this.ops.filter((o) => o.id !== op.id);
        sent++;
        await this.persist();
        this.notify();
      } catch (err) {
        const kind = classifyFailure(err);
        if (kind === "network" || kind === "auth") {
          stoppedBy = kind;
          break;
        }
        op.status = "failed";
        op.attempts += 1;
        op.error = describeRefusal(err);
        refusedRows.add(op.rowId);
        await this.persist();
        this.notify();
      }
    }

    return {
      sent,
      pending: this.pendingCount,
      failed: this.ops.filter((o) => o.status === "failed").length,
      stoppedBy,
    };
  }

  /** Puts refused changes back in the queue to be tried again. */
  async retryFailed(): Promise<void> {
    for (const op of this.ops) {
      if (op.status === "failed") {
        op.status = "pending";
        op.error = undefined;
      }
    }
    this.notify();
    await this.persist();
  }

  /** Gives up on one change for good (used to take back a change the server refused straight away). */
  async discardOp(id: string): Promise<void> {
    this.ops = this.ops.filter((o) => o.id !== id);
    this.notify();
    await this.persist();
  }

  /** Gives up on the refused changes for good. */
  async discardFailed(): Promise<void> {
    this.ops = this.ops.filter((o) => o.status !== "failed");
    this.notify();
    await this.persist();
  }
}
