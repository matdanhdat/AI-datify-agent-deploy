/**
 * Data cleaning orchestration service bridging UI, Web Worker, ArtifactStore, and Session State.
 * Implements Gate 1 atomic approval, proposals generation, before/after diff calculation,
 * reclean handling, and Worker Watchdog with 15s heartbeat timeout / 30s max limit.
 * Supports both Trading datasets (RawDataset) and Business datasets (BusinessTable).
 */

import { ArtifactStore } from '../core/artifacts';
import { AppError, ERROR_CODES } from '../core/errors';
import type { RawDataset } from '../core/dataset';
import type { BusinessTable } from '../core/businessTable';
import type {
  CleanArtifact,
  CleanProposal,
  Profile,
} from '../core/schemas';
import { calculateProfile } from '../core/cleaner/profile';
import { generateProposals } from '../core/cleaner/proposals';
import {
  runCleaningPipeline,
  type CleanPipelineResult,
} from '../core/cleaner/pipeline';
import { computeCanonicalCleanHash } from '../core/cleaner/canonicalHash';
import {
  calculateBusinessProfile,
  generateBusinessProposals,
  runBusinessCleanPipeline,
  computeBusinessCanonicalHash,
  type BusinessProfile,
  type BusinessCleanPipelineResult,
} from '../core/cleaner/businessCleaner';
import { dispatch } from './sessionService';
import { sessionStore } from './sessionStore';

export interface CleanServiceProgress {
  stage: string;
  percent: number;
  message: string;
}

export type AnyProfile = Profile | BusinessProfile;

/**
 * Runs a cleaning worker task with in-thread fallback for Node.js / unit tests.
 * Includes Watchdog timer: 15s inactivity limit (reset on progress), 30s hard ceiling limit.
 */
async function runCleanWorkerTask<T>(
  task: 'profile_and_proposals' | 'diff_pipeline' | 'commit_clean',
  dataset: RawDataset | BusinessTable,
  decisions?: Record<string, boolean>,
  options?: any,
  onProgress?: (progress: CleanServiceProgress) => void
): Promise<T> {
  if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
    return new Promise((resolve, reject) => {
      let worker: Worker | null = null;
      let settled = false;

      const INACTIVITY_TIMEOUT_MS = 15000;
      const HARD_TIMEOUT_MS = 30000;
      const startTime = Date.now();

      let inactivityTimer: any = null;
      let hardTimer: any = null;

      const cleanup = () => {
        settled = true;
        if (inactivityTimer) {
          clearTimeout(inactivityTimer);
          inactivityTimer = null;
        }
        if (hardTimer) {
          clearTimeout(hardTimer);
          hardTimer = null;
        }
        if (worker) {
          worker.terminate();
          worker = null;
        }
      };

      const resetInactivity = () => {
        if (settled) return;
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
          if (settled) return;
          const elapsed = Date.now() - startTime;
          cleanup();
          reject(
            new AppError(
              ERROR_CODES.WORKER_TIMEOUT,
              'Tác vụ làm sạch vượt quá thời gian cho phép (15 giây không phản hồi). Vui lòng thử lại hoặc sao chép chẩn đoán.',
              { task, elapsed_ms: elapsed, reason: 'inactivity' },
              504
            )
          );
        }, INACTIVITY_TIMEOUT_MS);
      };

      try {
        worker = new Worker(
          new URL('../workers/clean.worker.ts', import.meta.url),
          { type: 'module' }
        );
      } catch {
        // Fallback to in-thread calculation if worker creation fails
        runInThreadCleanTask<T>(task, dataset, decisions, options)
          .then(resolve)
          .catch(reject);
        return;
      }

      // Start timers
      resetInactivity();
      hardTimer = setTimeout(() => {
        if (settled) return;
        const elapsed = Date.now() - startTime;
        cleanup();
        reject(
          new AppError(
            ERROR_CODES.WORKER_TIMEOUT,
            'Tác vụ làm sạch vượt quá thời gian tối đa cho phép (30 giây). Vui lòng thử lại hoặc sao chép chẩn đoán.',
            { task, elapsed_ms: elapsed, reason: 'hard_limit' },
            504
          )
        );
      }, HARD_TIMEOUT_MS);

      worker.onmessage = (event) => {
        if (settled) return;
        const msg = event.data;
        if (msg.type === 'progress') {
          resetInactivity();
          if (onProgress) onProgress(msg.progress);
        } else if (msg.type === 'success') {
          cleanup();
          resolve(msg.data as T);
        } else if (msg.type === 'error') {
          cleanup();
          reject(
            new AppError(
              msg.code || ERROR_CODES.VALIDATION,
              msg.message_vi || 'Lỗi khi tính toán làm sạch dữ liệu.',
              msg.details || {},
              400
            )
          );
        }
      };

      worker.onerror = (err) => {
        if (settled) return;
        cleanup();
        reject(
          new AppError(
            ERROR_CODES.INTERNAL,
            `Lỗi worker: ${err.message || 'Lỗi không xác định'}`,
            {},
            500
          )
        );
      };

      worker.postMessage({ task, dataset, decisions, options });
    });
  }

  // Node.js test environment: execute in-thread
  return runInThreadCleanTask<T>(task, dataset, decisions, options);
}

async function runInThreadCleanTask<T>(
  task: string,
  dataset: RawDataset | BusinessTable,
  decisions?: Record<string, boolean>,
  options?: any
): Promise<T> {
  // Business dataset branch
  if (dataset && (dataset as any).kind === 'business') {
    const bTable = dataset as BusinessTable;
    if (task === 'profile_and_proposals') {
      const profile = calculateBusinessProfile(bTable);
      const proposals = generateBusinessProposals(bTable, profile);
      return { profile, proposals } as T;
    }
    if (task === 'diff_pipeline') {
      const result = runBusinessCleanPipeline(bTable, decisions || {});
      return result as T;
    }
    if (task === 'commit_clean') {
      const result = runBusinessCleanPipeline(bTable, decisions || {});
      if (!result.valid) {
        throw new AppError(
          ERROR_CODES.VALIDATION,
          result.violations[0]?.message_vi || 'Không thể duyệt dữ liệu sạch do vi phạm ràng buộc sau làm sạch.',
          { violations: result.violations },
          400
        );
      }
      const hash = await computeBusinessCanonicalHash(result.cleanTable);
      return {
        cleanTable: result.cleanTable,
        cleanDataset: result.cleanTable,
        hash,
        pipelineResult: result,
      } as T;
    }
    throw new Error(`Tác vụ không xác định: ${task}`);
  }

  // Trading dataset branch
  const raw = dataset as RawDataset;
  if (task === 'profile_and_proposals') {
    const profile = calculateProfile(raw);
    const proposals = generateProposals(raw, profile);
    return { profile, proposals } as T;
  }
  if (task === 'diff_pipeline') {
    const result = runCleaningPipeline(raw, decisions || {}, options);
    return result as T;
  }
  if (task === 'commit_clean') {
    const result = runCleaningPipeline(raw, decisions || {}, options);
    if (!result.valid) {
      throw new AppError(
        ERROR_CODES.VALIDATION,
        'Không thể duyệt dữ liệu sạch do vi phạm ràng buộc sau làm sạch.',
        { violations: result.violations },
        400
      );
    }
    const hash = await computeCanonicalCleanHash(result.cleanDataset);
    return {
      cleanDataset: result.cleanDataset,
      outlierFlags: result.outlierFlags,
      hash,
      pipelineResult: result,
    } as T;
  }
  throw new Error(`Tác vụ không xác định: ${task}`);
}

/**
 * Retrieves or computes data profile and clean proposals.
 * Supports both Trading and Business datasets.
 * Automatically transitions session state from 'uploaded' to 'cleaning_review'.
 */
export async function getProfileAndProposals(
  sessionId: string,
  onProgress?: (progress: CleanServiceProgress) => void
): Promise<{ profile: AnyProfile; proposals: CleanProposal[]; savedDecisions?: Record<string, boolean> }> {
  const raw = ArtifactStore.get<RawDataset | BusinessTable>(sessionId, 'raw');
  if (!raw) {
    throw new AppError(
      ERROR_CODES.NOT_FOUND,
      'Không tìm thấy tập dữ liệu thô trong phiên. Vui lòng nạp lại tệp.',
      { sessionId },
      404
    );
  }

  // Check if profile and proposals are already cached in ArtifactStore
  let profile = ArtifactStore.get<AnyProfile>(sessionId, 'profile');
  let proposals = ArtifactStore.get<CleanProposal[]>(sessionId, 'proposals');
  const savedDecisions = ArtifactStore.get<Record<string, boolean>>(sessionId, 'decisions');

  if (!profile || !proposals) {
    const computed = await runCleanWorkerTask<{ profile: AnyProfile; proposals: CleanProposal[] }>(
      'profile_and_proposals',
      raw,
      undefined,
      undefined,
      onProgress
    );
    profile = computed.profile;
    proposals = computed.proposals;

    ArtifactStore.put(sessionId, 'profile', profile);
    ArtifactStore.put(sessionId, 'proposals', proposals);
  }

  // Transition to cleaning_review if currently uploaded
  const sessionRecord = sessionStore.getRecord(sessionId);
  if (sessionRecord && sessionRecord.state === 'uploaded') {
    const rowCount = (profile as any).total_rows ?? (profile as any).totalRows ?? 0;
    dispatch(
      sessionId,
      'proposals_ready',
      'system',
      `Tạo ${proposals.length} đề xuất làm sạch cho tập dữ liệu (${rowCount} dòng).`
    );
  }

  return { profile, proposals, savedDecisions };
}

/**
 * Computes before/after diff for the given toggled decisions.
 */
export async function computeCleanDiff(
  sessionId: string,
  decisions: Record<string, boolean>,
  options?: { min_sessions?: number; strict_mode?: boolean }
): Promise<CleanPipelineResult | BusinessCleanPipelineResult> {
  const raw = ArtifactStore.get<RawDataset | BusinessTable>(sessionId, 'raw');
  if (!raw) {
    throw new AppError(
      ERROR_CODES.NOT_FOUND,
      'Không tìm thấy tập dữ liệu thô trong phiên.',
      { sessionId },
      404
    );
  }

  return runCleanWorkerTask<CleanPipelineResult | BusinessCleanPipelineResult>(
    'diff_pipeline',
    raw,
    decisions,
    options
  );
}

/**
 * Commits approved clean dataset to ArtifactStore (Gate 1 atomic commit).
 * Computes canonical SHA-256, verifies post-clean constraints, increments clean_version,
 * transitions to clean_approved, and appends clean_approved audit log.
 */
export async function approveCleanGate(
  sessionId: string,
  reviewerName: string,
  decisions: Record<string, boolean>,
  options?: { min_sessions?: number; strict_mode?: boolean }
): Promise<{ cleanArtifact: CleanArtifact; result: CleanPipelineResult | BusinessCleanPipelineResult }> {
  const trimmedName = reviewerName.trim();
  if (!trimmedName) {
    throw new AppError(
      ERROR_CODES.VALIDATION,
      'Vui lòng nhập tên người duyệt trước khi phê duyệt dữ liệu sạch.',
      {},
      400
    );
  }

  const raw = ArtifactStore.get<RawDataset | BusinessTable>(sessionId, 'raw');
  if (!raw) {
    throw new AppError(
      ERROR_CODES.NOT_FOUND,
      'Không tìm thấy tập dữ liệu thô để phê duyệt.',
      { sessionId },
      404
    );
  }

  const record = sessionStore.getRecord(sessionId);
  if (!record) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Phiên không tồn tại.', { sessionId }, 404);
  }

  // Business dataset branch
  if ((raw as any).kind === 'business') {
    const outcome = await runCleanWorkerTask<{
      cleanTable: BusinessTable;
      hash: string;
      pipelineResult: BusinessCleanPipelineResult;
    }>('commit_clean', raw, decisions, options);

    if (!outcome.pipelineResult.valid) {
      throw new AppError(
        ERROR_CODES.VALIDATION,
        outcome.pipelineResult.violations[0]?.message_vi || 'Dữ liệu vi phạm ràng buộc sau làm sạch.',
        { violations: outcome.pipelineResult.violations },
        400
      );
    }

    const currentVersion = (record.meta.clean_version as number) || 0;
    const nextVersion = currentVersion + 1;
    const now = new Date().toISOString();

    const cleanArtifact: CleanArtifact = {
      businessTable: outcome.cleanTable,
      kind: 'business',
      decisions: { ...decisions },
      hash: outcome.hash,
      approved_at: now,
      reviewer_name: trimmedName,
    };

    ArtifactStore.put(sessionId, `clean_v${nextVersion}`, cleanArtifact);
    ArtifactStore.put(sessionId, 'clean', cleanArtifact);
    ArtifactStore.put(sessionId, 'decisions', { ...decisions });

    sessionStore.setRecord({
      ...record,
      meta: {
        ...record.meta,
        clean_version: nextVersion,
        reviewer_name: trimmedName,
      },
    });

    const activeOps = Object.entries(decisions)
      .filter(([_, enabled]) => enabled)
      .map(([k]) => k)
      .join(', ');

    const auditDetail = `Người duyệt: ${trimmedName} | Thao tác kinh doanh bật: [${activeOps || 'none'}] | Số dòng: ${outcome.pipelineResult.totalBeforeRows} → ${outcome.pipelineResult.totalAfterRows} (bỏ ${outcome.pipelineResult.droppedCount})`;

    dispatch(sessionId, 'clean_approved', 'user', auditDetail, outcome.hash);

    return { cleanArtifact, result: outcome.pipelineResult };
  }

  // Trading dataset branch
  const outcome = await runCleanWorkerTask<{
    cleanDataset: RawDataset;
    outlierFlags: Uint8Array;
    hash: string;
    pipelineResult: CleanPipelineResult;
  }>('commit_clean', raw as RawDataset, decisions, options);

  if (!outcome.pipelineResult.valid) {
    throw new AppError(
      ERROR_CODES.VALIDATION,
      outcome.pipelineResult.violations[0]?.message_vi || 'Dữ liệu vi phạm ràng buộc sau làm sạch.',
      { violations: outcome.pipelineResult.violations },
      400
    );
  }

  const currentVersion = (record.meta.clean_version as number) || 0;
  const nextVersion = currentVersion + 1;
  const now = new Date().toISOString();

  const cleanArtifact: CleanArtifact = {
    dataset: outcome.cleanDataset,
    kind: 'trading',
    outlier_flags: outcome.outlierFlags,
    decisions: { ...decisions },
    hash: outcome.hash,
    approved_at: now,
    reviewer_name: trimmedName,
  };

  ArtifactStore.put(sessionId, `clean_v${nextVersion}`, cleanArtifact);
  ArtifactStore.put(sessionId, 'clean', cleanArtifact);
  ArtifactStore.put(sessionId, 'decisions', { ...decisions });

  sessionStore.setRecord({
    ...record,
    meta: {
      ...record.meta,
      clean_version: nextVersion,
      reviewer_name: trimmedName,
    },
  });

  const activeOps = Object.entries(decisions)
    .filter(([_, enabled]) => enabled)
    .map(([k]) => k)
    .join(', ');

  const auditDetail = `Người duyệt: ${trimmedName} | Thao tác bật: [${activeOps || 'none'}] | Số dòng: ${outcome.pipelineResult.totalBeforeRows} → ${outcome.pipelineResult.totalAfterRows} (bỏ ${outcome.pipelineResult.droppedCount})`;

  dispatch(sessionId, 'clean_approved', 'user', auditDetail, outcome.hash);

  return { cleanArtifact, result: outcome.pipelineResult };
}

/**
 * Retrieves the active clean artifact for a session.
 */
export function getActiveCleanArtifact(
  sessionId: string,
  version?: number
): CleanArtifact | undefined {
  const record = sessionStore.getRecord(sessionId);
  if (!record) return undefined;

  const targetVersion = version ?? (record.meta.clean_version as number);
  if (!targetVersion) return undefined;

  return ArtifactStore.get<CleanArtifact>(sessionId, `clean_v${targetVersion}`);
}

/**
 * Triggers reclean flow (resets downstream analysis/report, preserves clean history and decisions).
 */
export function requestReclean(sessionId: string): void {
  dispatch(
    sessionId,
    'reclean',
    'user',
    'Yêu cầu làm sạch lại dữ liệu (giữ lịch sử phiên bản sạch, xóa kết quả phân tích phía sau).'
  );
}
