/**
 * In-memory Artifact Store for heavy session artifacts.
 * Heavy artifacts (raw CSV rows, cleaned tables, quantitative analysis, reports)
 * are stored here instead of polluting the lightweight Session entity.
 */

type SessionArtifacts = Map<string, unknown>;

class InMemoryArtifactStore {
  private sessions = new Map<string, SessionArtifacts>();

  private getSessionMap(sessionId: string): SessionArtifacts {
    let map = this.sessions.get(sessionId);
    if (!map) {
      map = new Map<string, unknown>();
      this.sessions.set(sessionId, map);
    }
    return map;
  }

  public put(sessionId: string, key: string, data: unknown): void {
    const map = this.getSessionMap(sessionId);
    map.set(key, data);

    // Keep only the two latest clean versions (e.g. clean_v1, clean_v2) to conserve memory
    if (key.startsWith('clean_v')) {
      const cleanKeys = Array.from(map.keys())
        .filter((k) => /^clean_v\d+$/.test(k))
        .sort((a, b) => {
          const numA = parseInt(a.replace('clean_v', ''), 10);
          const numB = parseInt(b.replace('clean_v', ''), 10);
          return numA - numB;
        });

      while (cleanKeys.length > 2) {
        const oldest = cleanKeys.shift();
        if (oldest) {
          map.delete(oldest);
        }
      }
    }
  }

  public get<T = unknown>(sessionId: string, key: string): T | undefined {
    const map = this.sessions.get(sessionId);
    return map ? (map.get(key) as T) : undefined;
  }

  public has(sessionId: string, key: string): boolean {
    const map = this.sessions.get(sessionId);
    return map ? map.has(key) : false;
  }

  public delete(sessionId: string, key: string): boolean {
    const map = this.sessions.get(sessionId);
    return map ? map.delete(key) : false;
  }

  public deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * Cleans downstream artifacts when reverting or updating an earlier stage.
   * - 'upload_ok': New file replaces raw; clears clean_*, analysis, report, custom_*
   * - 'reclean': Re-initiating cleaning; preserves clean_v* history, clears analysis, report, custom_*
   * - 'report_edited': Minor edit to approved report; does not clear artifacts
   */
  public clearAfter(
    sessionId: string,
    stage: 'upload_ok' | 'reclean' | 'report_edited'
  ): void {
    const map = this.sessions.get(sessionId);
    if (!map) return;

    if (stage === 'upload_ok') {
      for (const key of Array.from(map.keys())) {
        if (
          key === 'profile' ||
          key === 'proposals' ||
          key === 'decisions' ||
          key.startsWith('clean') ||
          key === 'analysis' ||
          key === 'report' ||
          key.startsWith('custom_')
        ) {
          map.delete(key);
        }
      }
    } else if (stage === 'reclean') {
      // reclean preserves profile, proposals, decisions, and clean_v* history
      map.delete('analysis');
      map.delete('report');
      for (const key of Array.from(map.keys())) {
        if (key.startsWith('custom_')) {
          map.delete(key);
        }
      }
    }
  }

  public clearAll(): void {
    this.sessions.clear();
  }
}

export const ArtifactStore = new InMemoryArtifactStore();

