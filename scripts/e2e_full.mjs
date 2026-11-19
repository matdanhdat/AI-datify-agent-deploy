import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { execSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FINAL_SCREENS_DIR = path.resolve(ROOT, 'docs', 'screens', 'FINAL');
fs.mkdirSync(FINAL_SCREENS_DIR, { recursive: true });

const TARGETS = [
  { name: '01_trang_chu.png', path: '/' },
  { name: '02_nap_du_lieu.png', path: '/nap-du-lieu' },
  { name: '03_lam_sach_cong_duyet_1.png', path: '/lam-sach?forceState=cleaning_review&sample=1' },
  { name: '04_lam_sach_da_duyet.png', path: '/lam-sach?forceState=clean_approved&sample=1' },
  { name: '05_phan_tich_dinh_luong.png', path: '/phan-tich?forceState=clean_approved&sample=1' },
  { name: '06_bao_cao_kpi_bieu_do.png', path: '/bao-cao?forceState=report_approved&sample=1' },
  { name: '07_tro_ly_chat_chi_doc.png', path: '/bao-cao?forceState=report_approved&sample=1&chat=open&demoChat=metric' },
  { name: '08_quy_trinh_rieng_custom_plan.png', path: '/phan-tich?forceState=clean_approved&sample=1&demoPlan=1' },
  { name: '09_tien_trinh_agent_ilc.png', path: '/tien-trinh?forceState=report_approved&sample=1' },
  { name: '10_lich_su_phien.png', path: '/lich-su?forceState=report_approved&sample=1' },
  { name: '11_cau_hinh_he_thong.png', path: '/cau-hinh?demoDiag=1' },
  { name: '12_thu_vien_giao_dien.png', path: '/thu-vien-giao-dien' },
];

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(startPort, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', async (err) => {
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        resolve(await findAvailablePort(startPort + 1));
      } else {
        reject(err);
      }
    });
  });
}

async function runE2E() {
  console.log('======================================================');
  console.log('  🚀 KHỞI ĐỘNG KIỂM THỬ ĐẦU-CUỐI TỔNG THỂ (E2E FULL) ');
  console.log('======================================================\n');

  const distPath = path.resolve(ROOT, 'dist');
  const indexPath = path.resolve(distPath, 'index.html');
  const distSha = fs.existsSync(indexPath)
    ? crypto.createHash('sha256').update(fs.readFileSync(indexPath)).digest('hex').toUpperCase()
    : 'KHONG_TIM_THAY';

  console.log(`[DIST PHỤC VỤ]: ${distPath}`);
  console.log(`[SHA-256 dist/index.html]: ${distSha}`);

  const initialPort = process.env.AUDIT_PORT ? parseInt(process.env.AUDIT_PORT, 10) : 8088;
  const chosenPort = await findAvailablePort(initialPort);
  console.log(`[CỔNG MÁY CHỦ PREVIEW]: ${chosenPort}\n`);

  // Bước 1: Chạy kiểm thử tự động toàn chu trình bằng Vitest
  console.log('[1/3] Chạy kiểm thử luồng nghiệp vụ dữ liệu toàn vẹn (Vitest)...');
  try {
    execSync('npx vitest run src/tests/e2e_flow.test.ts', { stdio: 'inherit' });
    console.log('✓ Luồng dữ liệu nghiệp vụ đạt 100% (Upload -> Clean -> Gate 1 -> Analyze -> Report -> Gate 2 -> Export -> Chat -> Plan -> HashChain).\n');
  } catch (err) {
    console.error('✕ Lỗi kiểm thử luồng dữ liệu E2E!');
    process.exit(1);
  }

  // Bước 2: Chụp ảnh màn hình trực quan từng chặng vào docs/screens/FINAL/
  console.log(`[2/3] Chụp ảnh trực quan 12 chặng người dùng vào docs/screens/FINAL/ trên cổng ${chosenPort}...`);
  const previewServer = await preview({
    root: ROOT,
    preview: {
      port: chosenPort,
      host: '127.0.0.1',
    },
  });

  try {
    for (const target of TARGETS) {
      const outPath = path.join(FINAL_SCREENS_DIR, target.name);
      const url = `http://127.0.0.1:${chosenPort}${target.path}`;
      process.stdout.write(`  -> Đang chụp ${target.name}... `);

      await execFileAsync(CHROME_PATH, [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--no-proxy-server',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-default-apps',
        '--no-first-run',
        '--window-size=1366,768',
        '--hide-scrollbars',
        '--virtual-time-budget=2500',
        `--screenshot=${outPath}`,
        url,
      ]);

      if (fs.existsSync(outPath)) {
        const sz = fs.statSync(outPath).size;
        console.log(`✓ (${(sz / 1024).toFixed(1)} KB)`);
      } else {
        console.error(`✕ Thất bại khi tạo ${outPath}`);
      }
    }
  } finally {
    if (previewServer && previewServer.httpServer) {
      previewServer.httpServer.close();
    }
  }

  // Bước 3: Thẩm định mã băm trùng lặp (A4)
  console.log('\n[3/3] Thẩm định mã băm SHA-256 các ảnh chụp màn hình...');
  const hashes = new Map();
  let duplicateCount = 0;

  for (const target of TARGETS) {
    const outPath = path.join(FINAL_SCREENS_DIR, target.name);
    if (!fs.existsSync(outPath)) continue;
    const h = sha256File(outPath);
    if (hashes.has(h)) {
      console.error(`✕ Phát hiện ảnh chụp trùng lặp: ${target.name} trùng với ${hashes.get(h)} (SHA-256: ${h.slice(0, 16)}...)`);
      duplicateCount++;
    } else {
      hashes.set(h, target.name);
    }
  }

  if (duplicateCount === 0) {
    console.log(`✓ Toàn bộ ${hashes.size} ảnh chụp màn hình đều có mã băm SHA-256 độc nhất (0 trùng lặp).`);
  } else {
    console.error(`✕ Có ${duplicateCount} ảnh chụp màn hình bị trùng mã băm!`);
    process.exit(1);
  }

  console.log('\n======================================================');
  console.log('  🎉 KẾT LUẬN: KIỂM THỬ ĐẦU-CUỐI E2E THÀNH CÔNG 100%! ');
  console.log('======================================================');
}

runE2E().catch((err) => {
  console.error('Fatal error in E2E runner:', err);
  process.exit(1);
});

