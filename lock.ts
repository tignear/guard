import { Snowflake } from "discord.js";
type PromiseResolveFunction = (value: unknown) => void;
interface LockContextWriting {
  ty: "writing"
  promise: Promise<unknown>,
  resolve: PromiseResolveFunction
}
interface LockContextReading {
  ty: "reading"
  cnt: number,
  promise: Promise<unknown>
  resolve: PromiseResolveFunction
}
type LockContext = LockContextWriting | LockContextReading;
export class RWLock {
  private state = new Map<string, LockContext>();
  constructor() {

  }
  private freeReadLock(channelId: Snowflake) {
    const ctx = this.state.get(channelId);
    if (ctx?.ty !== "reading") {
      throw Error("illegal state");
    }
    --ctx.cnt;
    if (ctx.cnt === 0) {
      ctx.resolve(undefined);
      this.state.delete(channelId);
    }
  }

  private freeWriteLock(channelId: Snowflake) {
    const ctx = this.state.get(channelId);
    if (ctx?.ty !== "writing") {
      throw Error("illegal state");
    }
    ctx.resolve(undefined);
    this.state.delete(channelId);
  }

  async tryReadLock<T>(channelId: Snowflake, transaction: () => Promise<T>): Promise<T | null> {
    const ctx = this.state.get(channelId);
    if (ctx == null) {
      let resolve: (value: unknown) => void;
      const promise = new Promise(res => {
        resolve = res;
      });
      this.state.set(channelId, {
        cnt: 1,
        promise,
        resolve: resolve!,
        ty: "reading"
      });
    } else if (ctx.ty === "reading") {
      ++ctx.cnt;
    } else {
      return null;
    }
    try {
      const result = await transaction();
      return result;
    } finally {
      this.freeReadLock(channelId);
    }
  }

  async tryWriteLock<T>(channelId: Snowflake, transaction: () => Promise<T>): Promise<T | null> {
    const ctx = this.state.get(channelId);
    if (ctx == null) {
      let resolve: (value: unknown) => void;
      const promise = new Promise(res => {
        resolve = res;
      });
      this.state.set(channelId, {
        promise,
        resolve: resolve!,
        ty: "writing"
      });
    } else {
      return null;
    }
    try {
      const result = await transaction();
      return result;
    } finally {
      this.freeWriteLock(channelId);
    }
  }

  async waitReadLock<T>(channelId: Snowflake, transaction: () => Promise<T>): Promise<T> {
    while (true) {
      const ctx = this.state.get(channelId);
      if (ctx == null) {
        let resolve: (value: unknown) => void;
        const promise = new Promise(res => {
          resolve = res;
        });
        this.state.set(channelId, {
          cnt: 1,
          promise,
          resolve: resolve!,
          ty: "reading"
        });
      } else if (ctx.ty === "reading") {
        ++ctx.cnt;
        break;
      } else {
        await ctx.promise;
      }
    }

    try {
      const result = await transaction();
      return result;
    } finally {
      this.freeReadLock(channelId);
    }
  }

  async waitWriteLock<T>(channelId: Snowflake, transaction: () => Promise<T>): Promise<T> {
    while (true) {
      const ctx = this.state.get(channelId);
      if (ctx == null) {
        let resolve: (value: unknown) => void;
        const promise = new Promise(res => {
          resolve = res;
        });
        this.state.set(channelId, {
          promise,
          resolve: resolve!,
          ty: "writing"
        });
        break;
      } else if (ctx.ty === "reading") {
        await ctx.promise;
      }
    }

    try {
      const result = await transaction();
      return result;
    } finally {
      this.freeWriteLock(channelId);
    }
  }
}