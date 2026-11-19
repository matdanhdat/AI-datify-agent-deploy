/**
 * Sample calculation Web Worker.
 * Prepares the off-main-thread compute pipeline for P2 (cleaning) and P4 (metrics).
 */

export interface CalcWorkerInput {
  type: 'sum' | 'stats';
  numbers: number[];
}

export interface CalcWorkerProgress {
  percent: number;
  message: string;
}

export interface CalcWorkerOutput {
  count: number;
  sum: number;
  mean: number;
  min: number;
  max: number;
}

self.onmessage = (e: MessageEvent<CalcWorkerInput>) => {
  const { numbers } = e.data;
  const count = numbers.length;

  if (count === 0) {
    self.postMessage({
      type: 'success',
      data: { count: 0, sum: 0, mean: 0, min: 0, max: 0 },
    });
    return;
  }

  let sum = 0;
  let min = numbers[0];
  let max = numbers[0];

  const batchSize = Math.max(1, Math.floor(count / 10));

  for (let i = 0; i < count; i++) {
    const val = numbers[i];
    sum += val;
    if (val < min) min = val;
    if (val > max) max = val;

    if (i % batchSize === 0 || i === count - 1) {
      const percent = Math.round(((i + 1) / count) * 100);
      self.postMessage({
        type: 'progress',
        progress: {
          percent,
          message: `Đang xử lý ${i + 1}/${count} phần tử...`,
        },
      });
    }
  }

  const mean = sum / count;

  self.postMessage({
    type: 'success',
    data: { count, sum, mean, min, max },
  });
};

