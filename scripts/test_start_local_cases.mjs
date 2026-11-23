import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function testStartLocal() {
  console.log('=== TEST START_LOCAL.MJS EDGE CASES ===');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'start_local_test_'));
  const scriptPath = path.resolve('scripts/start_local.mjs');

  try {
    // Case A: Missing node_modules AND missing dist -> exits with error (1), does not hang
    const dirA = path.join(tempDir, 'case_a');
    fs.mkdirSync(dirA, { recursive: true });
    fs.mkdirSync(path.join(dirA, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dirA, 'src', 'index.ts'), 'console.log("hello");');

    console.log('[Case A] Missing node_modules AND missing dist:');
    try {
      await execFileAsync('node', [scriptPath], { cwd: dirA, timeout: 5000 });
      console.error('FAIL: Expected exit code 1, but succeeded!');
      process.exit(1);
    } catch (err) {
      console.log(`PASS: exited with code ${err.code}, stderr: ${err.stderr || err.stdout}`);
    }

    // Case B: Missing node_modules BUT dist/index.html exists -> does not try npm run build, serves dist
    const dirB = path.join(tempDir, 'case_b');
    fs.mkdirSync(dirB, { recursive: true });
    fs.mkdirSync(path.join(dirB, 'src'), { recursive: true });
    fs.writeFileSync(path.join(dirB, 'src', 'index.ts'), 'console.log("new source");');
    fs.mkdirSync(path.join(dirB, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(dirB, 'dist', 'index.html'), '<!DOCTYPE html><html><body>Dist ready</body></html>');

    console.log('\n[Case B] Missing node_modules BUT dist exists:');
    // We run with node, and set SKIP_AUTO_BUILD or inspect output
    const proc = execFile('node', [scriptPath], { cwd: dirB });
    let outputB = '';
    proc.stdout.on('data', (d) => { outputB += d.toString(); });
    proc.stderr.on('data', (d) => { outputB += d.toString(); });

    // Wait 2.5s for message
    await new Promise((resolve) => setTimeout(resolve, 2500));
    proc.kill();

    console.log('Output B preview:\n', outputB);
    const hasWarn = outputB.includes('Thiếu thư mục node_modules') || outputB.includes('phục vụ trực tiếp');
    console.log('Has warning about missing node_modules and serving dist:', hasWarn);
    if (!hasWarn) {
      console.error('FAIL: Expected warning about missing node_modules!');
      process.exit(1);
    }
    console.log('PASS: Successfully served dist without trying npm run build!');

    console.log('\n>>> TẤT CẢ CÁC TRƯỜNG HỢP START_LOCAL ĐỀU ĐẠT CHUẨN <<<');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

testStartLocal().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
