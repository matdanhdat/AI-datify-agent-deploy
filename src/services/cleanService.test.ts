import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ArtifactStore } from '../core/artifacts';
import { sessionStore } from './sessionStore';
import { createSession } from './sessionService';
import {
  getProfileAndProposals,
  computeCleanDiff,
  approveCleanGate,
  getActiveCleanArtifact,
} from './cleanService';
import { validateBytes } from '../core/validator';
import { ERROR_CODES } from '../core/errors';
import type { BusinessTable } from '../core/businessTable';

describe('CleanService Orchestration & Gate 1 (Trading & Business)', () => {
  const filePath = path.resolve(__dirname, '../../samples/business/du-lieu-test-ban-le.csv');
  const fileBytes = new Uint8Array(fs.readFileSync(filePath));

  let sessionId: string;
  let businessTable: BusinessTable;

  beforeEach(async () => {
    const session = createSession('business-test-session');
    sessionId = session.id;

    const valRes = await validateBytes('du-lieu-test-ban-le.csv', fileBytes);
    expect(valRes.ok).toBe(true);
    if (!valRes.ok) throw new Error('Validation failed');
    businessTable = valRes.businessTable!;

    ArtifactStore.put(sessionId, 'raw', businessTable);

    const record = sessionStore.getRecord(sessionId)!;
    record.state = 'uploaded';
    record.meta.dataset = valRes.meta;
    sessionStore.setRecord(record);
  });

  it('1. Computes business profile and proposals seamlessly', async () => {
    const res = await getProfileAndProposals(sessionId);
    expect(res.profile).toBeDefined();
    expect((res.profile as any).kind).toBe('business');
    expect(res.proposals).toHaveLength(5);

    // Profile must be cached in ArtifactStore
    const cachedProfile = ArtifactStore.get(sessionId, 'profile');
    expect(cachedProfile).toBeDefined();
  });

  it('2. Computes before/after clean diff for business table', async () => {
    const diff = await computeCleanDiff(sessionId, {
      remove_blank_rows: true,
      trim_whitespace: true,
      drop_exact_duplicates: true,
      fill_blank_dimension_label: true,
      sort_natural: true,
    });

    expect(diff.valid).toBe(true);
    expect(diff.totalBeforeRows).toBe(50);
    expect(diff.totalAfterRows).toBe(48);
    expect(diff.droppedCount).toBe(2);

    const bDiff = diff as any;
    expect(bDiff.statsAfter.orders).toBe(3342);
    expect(bDiff.statsAfter.revenue).toBe(1135530000);
    expect(bDiff.statsAfter.profit).toBe(531850000);
  });

  it('3. Approves Clean Gate 1 atomically for business table', async () => {
    // Generate proposals first to transition to cleaning_review
    await getProfileAndProposals(sessionId);

    const approval = await approveCleanGate(
      sessionId,
      'Ban Giám Khảo',
      {
        remove_blank_rows: true,
        trim_whitespace: true,
        drop_exact_duplicates: true,
        fill_blank_dimension_label: true,
        sort_natural: true,
      }
    );

    expect(approval.cleanArtifact).toBeDefined();
    expect(approval.cleanArtifact.kind).toBe('business');
    expect(approval.cleanArtifact.businessTable).toBeDefined();
    expect(approval.cleanArtifact.reviewer_name).toBe('Ban Giám Khảo');
    expect(approval.cleanArtifact.hash).toHaveLength(64);

    // Session state must be clean_approved
    const record = sessionStore.getRecord(sessionId);
    expect(record?.state).toBe('clean_approved');
    expect(record?.meta.clean_version).toBe(1);

    // Active artifact can be retrieved
    const active = getActiveCleanArtifact(sessionId);
    expect(active).toBeDefined();
    expect(active?.hash).toBe(approval.cleanArtifact.hash);
  });

  it('4. Rejects approval with empty reviewer name', async () => {
    await expect(
      approveCleanGate(sessionId, '   ', {})
    ).rejects.toThrow();
  });

  it('5. Verifies ERROR_CODES has WORKER_TIMEOUT defined', () => {
    expect(ERROR_CODES.WORKER_TIMEOUT).toBe('WORKER_TIMEOUT');
  });
});
