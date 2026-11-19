import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  PingInputSchema,
  PingOutputSchema,
  ExplainCleaningInputSchema,
  ExplainCleaningOutputSchema,
  WriteReportInputSchema,
  WriteReportOutputSchema,
  ChatExplainInputSchema,
  ChatExplainOutputSchema,
  PlanCustomInputSchema,
  PlanCustomOutputSchema,
  type ExplainCleaningInput,
  type WriteReportInput,
  type ChatExplainInput,
  type PlanCustomInput,
} from '../../src/core/aiTaskSchemas';
import { buildPingPayload } from '../../src/services/aiClient';
import {
  pingTask,
  explainCleaningTask,
  writeReportTask,
  chatExplainTask,
  planCustomTask,
} from './tasks';
import { handleAi } from './handler';

describe('P6 Audit: Payload and Schema Validation Across All 5 AI Tasks', () => {
  const originalEnv = { ...process.env };
  const FAKE_KEY = 'MOCK_GEMINI_AUDIT_KEY_ABC123';

  beforeEach(() => {
    process.env.GEMINI_API_KEY_1 = FAKE_KEY;
    delete process.env.GEMINI_API_KEY_2;
    process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';
    delete process.env.GEMINI_MODEL_FALLBACK;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  // Verify sample files exist
  it('Sample files exist on disk for realistic test data', () => {
    const csvPath = path.resolve('public/samples/file-mau-chuan.csv');
    const xlsxPath = path.resolve('public/samples/file-co-loi-lam-sach.xlsx');
    expect(fs.existsSync(csvPath)).toBe(true);
    expect(fs.existsSync(xlsxPath)).toBe(true);

    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    expect(csvContent.length).toBeGreaterThan(100);
  });

  // =========================================================================
  // Task 1: ping
  // =========================================================================
  describe('Task 1: ping', () => {
    it('accepts canonical client payload built via buildPingPayload()', () => {
      const payload = buildPingPayload();
      const parseRes = PingInputSchema.safeParse(payload.input);
      expect(parseRes.success).toBe(true);

      const taskPrompt = pingTask.buildPrompt(parseRes.data!);
      expect(typeof taskPrompt).toBe('string');
      expect(taskPrompt).toContain('Ping test at timestamp');
    });

    it('accepts empty input object', () => {
      const parseRes = PingInputSchema.safeParse({});
      expect(parseRes.success).toBe(true);
    });

    it('validates canonical output schema', () => {
      const sampleOutput = {
        pong: true,
        message: 'Xin chào! Cổng AI Datify AI Agent đã sẵn sàng hoạt động.',
        timestamp: Date.now(),
      };
      const res = PingOutputSchema.safeParse(sampleOutput);
      expect(res.success).toBe(true);
    });
  });

  // =========================================================================
  // Task 2: explain_cleaning
  // =========================================================================
  describe('Task 2: explain_cleaning', () => {
    const validCleaningPayload: ExplainCleaningInput = {
      total_rows: 750,
      total_symbols: 3,
      date_from: '2025-01-02',
      date_to: '2025-12-31',
      proposals: [
        {
          id: 'prop_exact_dup_1',
          op: 'drop_exact_duplicates',
          rows_affected: 4,
          affected_symbols: ['TMA'],
          severity: 'info',
          default_enabled: true,
        },
        {
          id: 'prop_fill_vol_2',
          op: 'fill_missing_volume_zero',
          rows_affected: 2,
          affected_symbols: ['TMB'],
          severity: 'info',
          default_enabled: true,
        },
        {
          id: 'prop_outliers_3',
          op: 'flag_outliers',
          rows_affected: 1,
          affected_symbols: ['TMC'],
          severity: 'warn',
          default_enabled: true,
        },
      ],
    };

    it('accepts realistic cleaning proposal payload', () => {
      const parseRes = ExplainCleaningInputSchema.safeParse(validCleaningPayload);
      expect(parseRes.success).toBe(true);

      const prompt = explainCleaningTask.buildPrompt(parseRes.data!);
      expect(prompt).toContain('drop_exact_duplicates');
      expect(prompt).toContain('fill_missing_volume_zero');
      expect(prompt).toContain('flag_outliers');
    });

    it('rejects invalid cleaning op or empty proposals', () => {
      const invalidPayload = {
        ...validCleaningPayload,
        proposals: [
          {
            ...validCleaningPayload.proposals[0],
            op: 'non_existent_cleaning_operation',
          },
        ],
      };
      const parseRes = ExplainCleaningInputSchema.safeParse(invalidPayload);
      expect(parseRes.success).toBe(false);
    });

    it('validates canonical output schema', () => {
      const sampleOutput = {
        explanations: [
          {
            id: 'prop_exact_dup_1',
            why_vi: 'Loại bỏ các dòng dữ liệu trùng lặp hoàn toàn để tránh tính trùng khối lượng.',
            risk_vi: 'Không có rủi ro vì dữ liệu giống hệt nhau.',
          },
        ],
      };
      const res = ExplainCleaningOutputSchema.safeParse(sampleOutput);
      expect(res.success).toBe(true);
    });
  });

  // =========================================================================
  // Task 3: write_report
  // =========================================================================
  describe('Task 3: write_report', () => {
    const validReportPayload: WriteReportInput = {
      config: {
        symbols: ['TMA', 'TMB'],
        date_from: '2025-01-02',
        date_to: '2025-12-31',
        sessions: 250,
      },
      metrics: [
        {
          key: 'm:period_return:TMA',
          id: 'period_return',
          label_vi: 'Lợi suất cả kỳ',
          symbol: 'TMA',
          unit: 'ratio',
          value: 0.154,
          display: '15,40%',
          polarity: 'positive',
        },
        {
          key: 'm:max_drawdown:TMA',
          id: 'max_drawdown',
          label_vi: 'Mức sụt giảm tối đa',
          symbol: 'TMA',
          unit: 'ratio',
          value: -0.082,
          display: '-8,20%',
          polarity: 'negative',
        },
      ],
      insufficient: [
        {
          key: 'm:sharpe_ratio:TMB',
          label_vi: 'Tỷ số Sharpe',
          reason_vi: 'Chưa đủ phiên để tính toán độ biến động lịch sử',
        },
      ],
      charts: [
        {
          key: 'chart:price_history',
          title_vi: 'Lịch sử giá đóng cửa',
          symbols: ['TMA', 'TMB'],
          summary_vi: 'TMA có xu hướng tăng từ 24.5 lên 28.3, TMB đi ngang.',
        },
      ],
      assumptions: {
        trading_days: 252,
        risk_free_rate: 0.045,
        ma_windows: [20, 50],
        rsi_window: 14,
        volume_spike_rule: 'volume > mean20 + 2*std20',
      },
      data_notes: {
        raw_rows: 500,
        clean_rows: 500,
        dropped_rows: 0,
        operations_enabled: 6,
        flagged_outliers: 0,
        warnings_count: 0,
      },
      only_section: 'overview',
      style: 'detailed',
    };

    it('accepts realistic write_report payload from narrator', () => {
      const parseRes = WriteReportInputSchema.safeParse(validReportPayload);
      expect(parseRes.success).toBe(true);

      const prompt = writeReportTask.buildPrompt(parseRes.data!);
      expect(prompt).toContain('TMA');
      expect(prompt).toContain('15,40%');
      expect(prompt).toContain('overview');
    });

    it('rejects payload missing required metrics array', () => {
      const invalid = { ...validReportPayload, metrics: undefined };
      const res = WriteReportInputSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it('validates canonical output schema', () => {
      const sampleOutput = {
        sections: [
          {
            id: 'overview',
            paragraphs: [
              {
                text: 'Trong kỳ khảo sát từ ngày 02/01/2025 đến 31/12/2025, mã TMA đạt lợi suất 15,40%.',
                evidence: ['m:period_return:TMA = 15,40%'],
              },
            ],
          },
        ],
      };
      const res = WriteReportOutputSchema.safeParse(sampleOutput);
      expect(res.success).toBe(true);
    });
  });

  // =========================================================================
  // Task 4: chat_explain
  // =========================================================================
  describe('Task 4: chat_explain', () => {
    it('accepts chat payload with user and assistant history', () => {
      const chatPayload: ChatExplainInput = {
        question: 'Chỉ số RSI 14 của mã TMA phản ánh điều gì?',
        page: '/bao-cao',
        state: 'analyzed',
        history: [
          {
            sender: 'user',
            text: 'Xin chào trợ lý',
          },
          {
            sender: 'assistant', // Note: client sends 'assistant', must be supported!
            text: 'Chào bạn, tôi là Trợ lý phân tích Datify AI Agent.',
          },
          {
            sender: 'ai',
            text: 'Tôi có thể hỗ trợ giải thích các chỉ số kỹ thuật.',
          },
        ],
        context: {
          data_summary: {
            filename: 'file-mau-chuan.csv',
            rows: 750,
            symbols: ['TMA', 'TMB', 'TMC'],
            date_from: '2025-01-02',
            date_to: '2025-12-31',
          },
        },
      };

      const parseRes = ChatExplainInputSchema.safeParse(chatPayload);
      expect(parseRes.success).toBe(true);

      const prompt = chatExplainTask.buildPrompt(parseRes.data!);
      expect(prompt).toContain('Chỉ số RSI 14 của mã TMA phản ánh điều gì?');
      expect(prompt).toContain('Trợ lý: Chào bạn');
    });

    it('rejects unauthorized sender role', () => {
      const invalidPayload = {
        question: 'Câu hỏi kiểm tra?',
        history: [
          {
            sender: 'unauthorized_role',
            text: 'Tin nhắn sai',
          },
        ],
      };
      const res = ChatExplainInputSchema.safeParse(invalidPayload);
      expect(res.success).toBe(false);
    });

    it('validates canonical output schema', () => {
      const sampleOutput = {
        intent: 'explain_metric',
        answer_vi: 'Chỉ số RSI 14 đo lường quán tính biến động giá trong 14 phiên gần nhất.',
        evidence: ['rsi_14 = 58.4'],
        suggestions: ['Xem thêm chỉ số MACD', 'Kiểm tra khối lượng giao dịch'],
      };
      const res = ChatExplainOutputSchema.safeParse(sampleOutput);
      expect(res.success).toBe(true);
    });
  });

  // =========================================================================
  // Task 5: plan_custom
  // =========================================================================
  describe('Task 5: plan_custom', () => {
    it('accepts plan_custom payload with both date_from/date_to and date_range', () => {
      const planPayload: PlanCustomInput = {
        request: 'Xếp hạng top 3 mã có biến động giá lớn nhất trong quý 1',
        data_profile: {
          symbols: ['TMA', 'TMB', 'TMC'],
          date_from: '2025-01-02',
          date_to: '2025-03-31',
          date_range: { from: '2025-01-02', to: '2025-03-31' },
          bar_count: 180,
          columns: ['open', 'high', 'low', 'close', 'volume'],
        },
      };

      const parseRes = PlanCustomInputSchema.safeParse(planPayload);
      expect(parseRes.success).toBe(true);

      const prompt = planCustomTask.buildPrompt(parseRes.data!);
      expect(prompt).toContain('Xếp hạng top 3 mã');
      expect(prompt).toContain('TMA, TMB, TMC');
      expect(prompt).toContain('2025-01-02');
    });

    it('accepts plan_custom payload when only date_range is provided', () => {
      const legacyPayload = {
        request: 'Tính tương quan giữa TMA và TMB',
        data_profile: {
          symbols: ['TMA', 'TMB'],
          date_range: { from: '2025-01-02', to: '2025-12-31' },
          bar_count: 500,
          columns: ['open', 'high', 'low', 'close', 'volume'],
        },
      };

      const parseRes = PlanCustomInputSchema.safeParse(legacyPayload);
      expect(parseRes.success).toBe(true);
      expect(parseRes.data!.data_profile.date_from).toBe('2025-01-02');
      expect(parseRes.data!.data_profile.date_to).toBe('2025-12-31');
    });

    it('validates canonical output schema', () => {
      const sampleOutput = {
        feasible: true,
        title_vi: 'Kế hoạch tính mức biến động và xếp hạng top mã',
        steps: [
          {
            op: 'rolling_volatility',
            params: { window: 20 },
          },
          {
            op: 'rank_top_n',
            params: { n: 3 },
          },
        ],
      };
      const res = PlanCustomOutputSchema.safeParse(sampleOutput);
      expect(res.success).toBe(true);
    });
  });

  // =========================================================================
  // End-to-End Handler Integration: All 5 Tasks Return 200 With Mocked AI
  // =========================================================================
  describe('Full Gateway Handler Integration (handleAi) for all 5 tasks', () => {
    it('executes handleAi successfully for all 5 tasks without schema errors', async () => {
      // Mock upstream Gemini response for any task
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input: any, init?: any) => {
        const bodyStr = typeof init?.body === 'string' ? init.body : '';
        const bodyObj = bodyStr ? JSON.parse(bodyStr) : {};
        const promptText: string = bodyObj.contents?.[0]?.parts?.[0]?.text || '';

        let responseContent = '{}';
        if (promptText.includes('Ping test')) {
          responseContent = JSON.stringify({
            pong: true,
            message: 'Xin chào từ cổng AI Datify AI Agent!',
            timestamp: Date.now(),
          });
        } else if (promptText.includes('drop_exact_duplicates')) {
          responseContent = JSON.stringify({
            explanations: [
              {
                id: 'prop_exact_dup_1',
                why_vi: 'Loại bỏ dòng trùng lặp hoàn toàn',
                risk_vi: 'Không có rủi ro',
              },
            ],
          });
        } else if (promptText.includes('write_report') || promptText.includes('Lợi suất cả kỳ')) {
          responseContent = JSON.stringify({
            sections: [
              {
                id: 'overview',
                paragraphs: [
                  {
                    text: 'Thị trường có xu hướng tích cực.',
                    evidence: ['m:period_return:TMA = 15,40%'],
                  },
                ],
              },
            ],
          });
        } else if (promptText.includes('Chỉ số RSI 14')) {
          responseContent = JSON.stringify({
            intent: 'explain_metric',
            answer_vi: 'RSI 14 đo quán tính giá.',
            evidence: ['rsi_14'],
          });
        } else if (promptText.includes('Xếp hạng top 3 mã')) {
          responseContent = JSON.stringify({
            feasible: true,
            title_vi: 'Kế hoạch xếp hạng top mã',
            steps: [
              {
                op: 'rank_top_n',
                params: { n: 3 },
              },
            ],
          });
        }

        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: responseContent }],
                  role: 'model',
                },
                finishReason: 'STOP',
              },
            ],
            usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 80, totalTokenCount: 230 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      });

      const tasksToTest = [
        { task: 'ping', input: buildPingPayload().input },
        {
          task: 'explain_cleaning',
          input: {
            total_rows: 500,
            total_symbols: 1,
            date_from: '2025-01-02',
            date_to: '2025-12-31',
            proposals: [
              {
                id: 'prop_exact_dup_1',
                op: 'drop_exact_duplicates',
                rows_affected: 2,
                affected_symbols: ['TMA'],
                severity: 'info',
                default_enabled: true,
              },
            ],
          },
        },
        {
          task: 'write_report',
          input: {
            config: { symbols: ['TMA'], date_from: '2025-01-02', date_to: '2025-12-31', sessions: 250 },
            metrics: [
              {
                key: 'm:period_return:TMA',
                id: 'period_return',
                label_vi: 'Lợi suất cả kỳ',
                symbol: 'TMA',
                unit: 'ratio',
                value: 0.154,
                display: '15,40%',
                polarity: 'positive',
              },
            ],
            insufficient: [],
            charts: [],
            assumptions: {
              trading_days: 252,
              risk_free_rate: 0,
              ma_windows: [20, 50],
              rsi_window: 14,
              volume_spike_rule: 'volume > mean20 + 2*std20',
            },
            data_notes: {
              raw_rows: 250,
              clean_rows: 250,
              dropped_rows: 0,
              operations_enabled: 6,
              flagged_outliers: 0,
              warnings_count: 0,
            },
            only_section: 'overview',
            style: 'concise',
          },
        },
        {
          task: 'chat_explain',
          input: {
            question: 'Chỉ số RSI 14 của mã TMA phản ánh điều gì?',
            page: '/bao-cao',
            state: 'analyzed',
            history: [{ sender: 'assistant', text: 'Xin chào bạn' }],
            context: {},
          },
        },
        {
          task: 'plan_custom',
          input: {
            request: 'Xếp hạng top 3 mã',
            data_profile: {
              symbols: ['TMA'],
              date_from: '2025-01-02',
              date_to: '2025-12-31',
              bar_count: 250,
              columns: ['open', 'high', 'low', 'close', 'volume'],
            },
          },
        },
      ];

      for (const item of tasksToTest) {
        const req = new Request('http://localhost:8000/api/ai', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: 'http://localhost:8000',
            'Sec-Fetch-Site': 'same-origin',
          },
          body: JSON.stringify(item),
        });

        const res = await handleAi(req);
        const data = await res.json();
        expect(res.status, `Task ${item.task} failed with status ${res.status}: ${JSON.stringify(data)}`).toBe(200);
        expect(data.ok).toBe(true);
        expect(data.task).toBe(item.task);
        expect(data.data).toBeDefined();
      }
    });
  });
});
