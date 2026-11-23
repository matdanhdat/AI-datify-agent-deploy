import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { exec, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

export function isDistStale(srcMtimeMs, distMtimeMs, distExists, srcExists = true) {
  if (!srcExists) return false;
  if (!distExists) return true;
  return srcMtimeMs > distMtimeMs;
}

export function determineBuildDecision({ srcExists, nodeModulesExists, distExists, isStale, skipAutoBuild = false }) {
  if (skipAutoBuild) return { action: 'skip', reason: 'skip_flag' };
  if (!nodeModulesExists && !distExists) return { action: 'error', reason: 'no_deps_no_dist' };
  if (!nodeModulesExists && distExists) return { action: 'serve_dist_no_build', reason: 'missing_node_modules' };
  if (!srcExists) return { action: 'serve_dist_no_build', reason: 'no_src' };
  if (isStale) return { action: 'build', reason: 'src_newer' };
  return { action: 'serve_dist_no_build', reason: 'up_to_date' };
}

export function handleBuildResult(buildExitCode, distExists) {
  if (buildExitCode !== 0) {
    if (distExists) {
      console.warn('[start_local] Auto-build thất bại, tiếp tục phục vụ bản build trước đó.');
      return 'serve_existing_dist';
    } else {
      console.error(`Build thất bại với mã lỗi ${buildExitCode} và không có bản dist nào để phục vụ.`);
      return 'exit';
    }
  }
  return 'ok';
}

export function getLatestMtime(targetPath) {
  if (!fs.existsSync(targetPath)) return 0;
  const stat = fs.statSync(targetPath);
  let maxMtime = stat.mtimeMs;
  if (stat.isDirectory()) {
    const files = fs.readdirSync(targetPath);
    for (const file of files) {
      const fullPath = path.join(targetPath, file);
      const subMtime = getLatestMtime(fullPath);
      if (subMtime > maxMtime) {
        maxMtime = subMtime;
      }
    }
  }
  return maxMtime;
}

function loadLocalEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (!process.env[key] && val) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

async function findAvailablePort(startPort = 8000) {
  let port = startPort;
  while (port < startPort + 50) {
    if (await checkPortAvailable(port)) {
      return port;
    }
    port++;
  }
  return startPort;
}

function openBrowser(url) {
  const start =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
      ? 'start'
      : 'xdg-open';
  exec(`${start} ${url}`).unref();
}

async function main() {
  loadLocalEnv();

  const k1 = process.env.GEMINI_API_KEY_1?.trim();
  const k2 = process.env.GEMINI_API_KEY_2?.trim();
  let keySlots = 0;
  if (k1) keySlots++;
  if (k2 && k2 !== k1) keySlots++;

  const aiMode = keySlots > 0 ? 'AI: Gemini truc tiep' : 'Che do du phong (Mau cau dinh san)';

  const VALID_LEVELS = ['minimal', 'low', 'medium', 'high'];
  const rawThinking = process.env.GEMINI_THINKING_LEVEL?.trim().toLowerCase();
  const rawThinkingReport = process.env.GEMINI_THINKING_LEVEL_REPORT?.trim().toLowerCase();

  let thinkingLvl = 'minimal';
  if (rawThinking) {
    if (VALID_LEVELS.includes(rawThinking)) {
      thinkingLvl = rawThinking;
    } else {
      console.warn(`[Canh bao] GEMINI_THINKING_LEVEL='${process.env.GEMINI_THINKING_LEVEL}' khong hop le (chi nhan: minimal, low, medium, high). Tu dong dung 'minimal'.`);
    }
  }

  let thinkingReportLvl = 'low';
  if (rawThinkingReport) {
    if (VALID_LEVELS.includes(rawThinkingReport)) {
      thinkingReportLvl = rawThinkingReport;
    } else {
      console.warn(`[Canh bao] GEMINI_THINKING_LEVEL_REPORT='${process.env.GEMINI_THINKING_LEVEL_REPORT}' khong hop le (chi nhan: minimal, low, medium, high). Tu dong dung 'low'.`);
    }
  }

  console.log('\n======================================================');
  console.log('  PIXEL TRADING AGENT (Trinh duyet + Vercel)');
  console.log('======================================================');
  console.log(`  So khoa Gemini da nap : ${keySlots} / 2 khoa (khong luu dia)`);
  console.log(`  Che do hoat dong      : ${aiMode}`);
  console.log(`  Muc suy nghi AI       : ${thinkingLvl} (bao cao: ${thinkingReportLvl})`);
  console.log('======================================================\n');

  // Verify dist build exists and is up to date
  const srcExists = fs.existsSync(path.resolve('src'));
  const nodeModulesExists = fs.existsSync(path.resolve('node_modules'));
  const distHtmlPath = path.resolve('dist', 'index.html');
  const distExists = fs.existsSync(distHtmlPath);
  const distMtimeMs = distExists ? fs.statSync(distHtmlPath).mtimeMs : 0;

  let srcMtimeMs = 0;
  if (srcExists) {
    const checkPaths = [
      path.resolve('src'),
      path.resolve('api'),
      path.resolve('index.html'),
    ];
    for (const p of checkPaths) {
      const m = getLatestMtime(p);
      if (m > srcMtimeMs) srcMtimeMs = m;
    }
  }

  // Prompt 2B: Kiểm tra quyết định build
  const stale = isDistStale(srcMtimeMs, distMtimeMs, distExists, srcExists);
  const decision = determineBuildDecision({
    srcExists,
    nodeModulesExists,
    distExists,
    isStale: stale,
    skipAutoBuild: process.env.SKIP_AUTO_BUILD === '1',
  });

  if (decision.action === 'error') {
    console.error('Thư mục node_modules và bản build dist đều không tồn tại. Vui lòng chạy npm install.');
    process.exit(1);
  } else if (!nodeModulesExists && distExists) {
    console.warn('[start_local] node_modules không tìm thấy, bỏ qua auto-build, phục vụ dist sẵn có.');
  }

  if (decision.action === 'build') {
    console.log('Mã nguồn mới hơn bản build. Đang build lại, khoảng 1 phút...');
    const buildExitCode = await new Promise((resolve) => {
      const buildProcess = spawn('npm', ['run', 'build'], { stdio: 'inherit', shell: true });
      buildProcess.on('exit', (code) => resolve(code ?? 0));
      buildProcess.on('error', (err) => {
        console.error('Lỗi khi thực thi npm run build:', err);
        resolve(1);
      });
    });

    const res = handleBuildResult(buildExitCode, distExists);
    if (res === 'exit') {
      process.exit(buildExitCode);
    }
  }

  const preferredPort = 8000;
  const targetPort = await findAvailablePort(preferredPort);

  if (targetPort !== preferredPort) {
    console.log(`[Thong bao] Cong ${preferredPort} dang ban. Da tu dong chuyen sang cong: ${targetPort}`);
  }

  const previewServer = await preview({
    preview: {
      port: targetPort,
      host: '0.0.0.0',
    },
  });

  const localUrl = `http://localhost:${targetPort}`;
  console.log(`[Xong] May chu da san sang tai: ${localUrl}`);
  console.log('  (Nhan Ctrl+C de dung may chu)\n');

  // Auto-open browser
  setTimeout(() => {
    openBrowser(localUrl);
  }, 500);
}

const currentFilePath = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === currentFilePath;

if (isDirectRun) {
  main().catch((err) => {
    console.error('Loi khi khoi chay ung dung:', err);
    process.exit(1);
  });
}

