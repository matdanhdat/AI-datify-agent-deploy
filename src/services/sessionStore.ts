import { useSyncExternalStore } from 'react';
import type { SessionRecord } from '../core/state';

type Listener = () => void;

class InMemorySessionStore {
  private sessions = new Map<string, SessionRecord>();
  private activeSessionId: string | null = null;
  private listeners = new Set<Listener>();

  constructor() {
    this.setupBeforeUnloadWarning();
  }

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): Map<string, SessionRecord> => {
    return this.sessions;
  };

  public getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  public setActiveSessionId(id: string | null) {
    if (this.activeSessionId !== id) {
      this.activeSessionId = id;
      this.notify();
    }
  }

  public getRecord(id: string): SessionRecord | undefined {
    return this.sessions.get(id);
  }

  public setRecord(record: SessionRecord) {
    this.sessions.set(record.id, record);
    this.notify();
  }

  public deleteRecord(id: string): boolean {
    const deleted = this.sessions.delete(id);
    if (this.activeSessionId === id) {
      // Pick another session or null
      const remaining = Array.from(this.sessions.keys());
      this.activeSessionId = remaining.length > 0 ? remaining[0] : null;
    }
    if (deleted) {
      this.notify();
    }
    return deleted;
  }

  public getAllRecords(): SessionRecord[] {
    return Array.from(this.sessions.values());
  }

  public clearAll() {
    this.sessions.clear();
    this.activeSessionId = null;
    this.notify();
  }

  private setupBeforeUnloadWarning() {
    if (typeof window === 'undefined') return;

    window.addEventListener('beforeunload', (e) => {
      if (!this.activeSessionId) return;
      const active = this.sessions.get(this.activeSessionId);
      // If session is beyond initial created state, warn about in-memory data loss
      if (active && active.state !== 'created') {
        e.preventDefault();
        e.returnValue = 'Dữ liệu giao dịch của phiên chỉ tồn tại trong tab này. Bạn có chắc chắn muốn rời đi?';
      }
    });
  }
}

export const sessionStore = new InMemorySessionStore();

/**
 * Hook to read the current active session ID reactively.
 */
export function useActiveSessionId(): string | null {
  return useSyncExternalStore(
    sessionStore.subscribe,
    () => sessionStore.getActiveSessionId(),
    () => null
  );
}

/**
 * Hook to read all sessions reactively.
 */
export function useAllSessionRecords(): SessionRecord[] {
  return useSyncExternalStore(
    sessionStore.subscribe,
    () => sessionStore.getAllRecords(),
    () => []
  );
}

