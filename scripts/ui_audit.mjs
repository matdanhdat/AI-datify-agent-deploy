import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { JSDOM } from 'jsdom';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const VIEWPORTS = [
  { name: '1280x720 (HD)', width: 1280, height: 720 },
  { name: '1366x768 (Laptop Standard)', width: 1366, height: 768 },
  { name: '1920x1080 (FHD)', width: 1920, height: 1080 },
  { name: '1366x768 (Zoom 125%)', width: Math.round(1366 / 1.25), height: Math.round(768 / 1.25) },
];

const ROUTES = [
  { name: 'Trang chủ (Home)', path: '/' },
  { name: 'Nạp dữ liệu (Upload)', path: '/nap-du-lieu' },
  { name: 'Làm sạch & Cổng duyệt 1 (Clean)', path: '/lam-sach?forceState=cleaning_review&sample=1' },
  { name: 'Phân tích định lượng (Analyze)', path: '/phan-tich?forceState=clean_approved&sample=1' },
  { name: 'Báo cáo & Cổng duyệt 2 (Report)', path: '/bao-cao?forceState=report_approved&sample=1' },
  { name: 'Tiến trình Agent ILC (Progress)', path: '/tien-trinh?forceState=report_approved&sample=1' },
  { name: 'Lịch sử phiên (History)', path: '/lich-su?forceState=report_approved&sample=1' },
  { name: 'Cấu hình hệ thống (Config)', path: '/cau-hinh' },
  { name: 'Thư viện giao diện Pixel (UI Lib)', path: '/thu-vien-giao-dien' },
];

const FORBIDDEN_STRINGS = [
  'NaN',
  'undefined',
  '[object Object]',
  'null',
  'Cannot read property',
  'Cannot read properties',
  'is not a function',
  'ReferenceError',
  'TypeError',
  'Python',
  'Pixel Trading Agent',
  'TODO',
  'Lorem',
];

const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;

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

async function runUiAudit() {
  console.log('======================================================');
  console.log('  🖥️  BẮT ĐẦU KIỂM TOÁN GIAO DIỆN (UI AUDIT)          ');
  console.log('======================================================\n');

  if (!fs.existsSync(CHROME_PATH)) {
    console.error(`✕ Không tìm thấy Chrome tại: ${CHROME_PATH}`);
    process.exit(1);
  }

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

  console.log(`[1/3] Khởi động Vite Preview Server trên cổng ${chosenPort}...`);
  const previewServer = await preview({
    root: ROOT,
    preview: {
      port: chosenPort,
      host: '127.0.0.1',
    },
  });

  const auditResults = [];
  let totalErrors = 0;

  try {
    console.log('[2/3] Duyệt các Viewport và Routes bằng Chrome Headless...\n');

    for (const vp of VIEWPORTS) {
      console.log(`--- Kiểm tra Viewport: ${vp.name} ---`);
      for (const route of ROUTES) {
        const url = `http://127.0.0.1:${chosenPort}${route.path}`;
        const routeErrors = [];

        try {
          const { stdout, stderr } = await execFileAsync(CHROME_PATH, [
            '--headless=new',
            '--no-sandbox',
            '--disable-gpu',
            '--no-proxy-server',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-sync',
            '--disable-default-apps',
            '--no-first-run',
            `--window-size=${vp.width},${vp.height}`,
            '--virtual-time-budget=2000',
            '--dump-dom',
            url,
          ], { maxBuffer: 10 * 1024 * 1024 });

          // Kiểm tra chuỗi rác / crash trong DOM
          for (const forbidden of FORBIDDEN_STRINGS) {
            // Loại trừ các vị trí hợp lệ nếu có (ví dụ giải thích text)
            // Tuy nhiên trong DOM render chuẩn không được có raw "NaN", "undefined" dạng văn bản trôi nổi
            const regex = new RegExp(`\\b${forbidden.replace('[', '\\[').replace(']', '\\]')}\\b`, 'g');
            const matches = stdout.match(regex);
            if (matches && matches.length > 0) {
              // Bỏ qua nếu xuất hiện bên trong script tag hay code block demo hợp lệ
              // Kiểm tra xem có nằm trong thẻ hiển thị người dùng không
              const textContent = stdout.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                                        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
              const visibleMatches = textContent.match(regex);
              if (visibleMatches && visibleMatches.length > 0) {
                routeErrors.push(`Phát hiện chuỗi bất thường "${forbidden}" hiển thị trên trang (${visibleMatches.length} lần)`);
              }
            }
          }

          // Kiểm tra cấu trúc DOM qua JSDOM
          const dom = new JSDOM(stdout);
          const doc = dom.window.document;

          // (a) Kiểm tra Topbar buttons: đúng 1 "Phiên mới", tối đa 1 "Xóa sạch"
          const header = doc.querySelector('header');
          if (header) {
            const buttons = Array.from(header.querySelectorAll('button'));
            const newBtns = buttons.filter(b => /phiên mới/i.test(b.textContent || ''));
            if (newBtns.length !== 1) {
              routeErrors.push(`Topbar có ${newBtns.length} nút 'Phiên mới' (yêu cầu đúng 1 nút)`);
            }
            const clearBtns = buttons.filter(b => /xóa sạch/i.test(b.textContent || ''));
            if (clearBtns.length > 1) {
              routeErrors.push(`Topbar có ${clearBtns.length} nút 'Xóa sạch' (tối đa 1 nút)`);
            }
          }

          // (b) Kiểm tra text-shadow: quy tắc toàn dự án không dùng text-shadow cho chữ < 40px
          const styledElements = doc.querySelectorAll('*[style*="text-shadow"]');
          styledElements.forEach(el => {
            const styleAttr = el.getAttribute('style') || '';
            const match = styleAttr.match(/text-shadow\s*:\s*([^;]+)/i);
            if (match && match[1].trim() !== 'none') {
              let cur = el;
              let fs = '';
              while (cur && cur !== doc.body) {
                const s = cur.getAttribute('style') || '';
                const fsMatch = s.match(/font-size\s*:\s*([^;]+)/i);
                if (fsMatch) {
                  fs = fsMatch[1].trim();
                  break;
                }
                cur = cur.parentElement;
              }
              const isLarge = fs.includes('clamp') || (parseInt(fs, 10) >= 40);
              if (!isLarge) {
                routeErrors.push(`Phần tử <${el.tagName.toLowerCase()}> có text-shadow nhưng font-size (${fs || 'chưa đặt'}) < 40px`);
              }
            }
          });

          // (c) Kiểm tra Emoji trong văn bản hiển thị
          const cloneBody = doc.body ? doc.body.cloneNode(true) : null;
          if (cloneBody) {
            cloneBody.querySelectorAll('script, style, svg').forEach(n => n.remove());
            const visibleText = cloneBody.textContent || '';
            const emojiMatch = visibleText.match(EMOJI_REGEX);
            if (emojiMatch) {
              routeErrors.push(`Phát hiện emoji '${emojiMatch[0]}' trong văn bản hiển thị`);
            }
          }

          // (d) [D1d] Kiểm tra Hero illustration: SVG phải phủ kín container
          if (route.path === '/') {
            const heroSvg = doc.querySelector('.home-container svg[viewBox="0 0 320 180"]');
            if (heroSvg) {
              const par = heroSvg.getAttribute('preserveAspectRatio');
              if (par !== 'xMidYMid slice') {
                routeErrors.push(`Hero SVG chưa đặt preserveAspectRatio="xMidYMid slice" (hiện tại: ${par})`);
              }
            }

            // (e) [D1d] Kiểm tra khẩu hiệu Hero: line-height >= 1.15, padding-top >= 6px
            const sloganH1 = doc.querySelector('.home-container h1');
            if (sloganH1) {
              const style = sloganH1.getAttribute('style') || '';
              const lhMatch = style.match(/line-height\s*:\s*([^;]+)/i);
              const ptMatch = style.match(/padding-top\s*:\s*([^;]+)/i);
              const lhVal = lhMatch ? parseFloat(lhMatch[1]) : 1;
              const ptVal = ptMatch ? parseInt(ptMatch[1], 10) : 0;
              if (lhVal < 1.15) {
                routeErrors.push(`Khẩu hiệu Hero có line-height (${lhVal}) < 1.15 (nguy cơ bóp méo dấu thanh)`);
              }
              if (ptVal < 6) {
                routeErrors.push(`Khẩu hiệu Hero có padding-top (${ptVal}px) < 6px (nguy cơ cắt dấu chữ in hoa)`);
              }
            }
          }

          // (f) [D1d] Kiểm tra khoảng đệm cuối trang tránh nút chat che: main padding-bottom >= 96px
          const mainTag = doc.querySelector('main');
          if (mainTag) {
            const style = mainTag.getAttribute('style') || '';
            const pbMatch = style.match(/padding-bottom\s*:\s*([^;]+)/i);
            const pbVal = pbMatch ? pbMatch[1] : '';
            const hasSufficientPb = pbVal.includes('110px') || pbVal.includes('96px') || parseInt(pbVal, 10) >= 96;
            if (!hasSufficientPb) {
              routeErrors.push(`Vùng <main> chưa chừa đủ khoảng đệm padding-bottom >= 96px (hiện tại: ${pbVal || 'chưa đặt'})`);
            }
          }

          // (g) [D1d] Kiểm tra các lớp trang trí: data-decor phải có pointer-events: none
          const decorElements = doc.querySelectorAll('[data-decor]');
          decorElements.forEach(el => {
            const style = el.getAttribute('style') || '';
            if (!style.includes('pointer-events: none')) {
              routeErrors.push(`Lớp trang trí <${el.tagName.toLowerCase()} data-decor> chưa có pointer-events: none`);
            }
          });

          // (h) [U3] Kiểm tra lỗi phông pixel (Faux-bold): cấm font-weight bold/600/700/800 trên phần tử dùng font-pixel
          const pixelFontElements = doc.querySelectorAll('.font-pixel, [style*="--font-pixel"]');
          pixelFontElements.forEach(el => {
            const style = el.getAttribute('style') || '';
            const fwMatch = style.match(/font-weight\s*:\s*([^;]+)/i);
            if (fwMatch) {
              const fw = fwMatch[1].trim();
              if (fw === 'bold' || fw === '600' || fw === '700' || fw === '800' || fw === '900') {
                routeErrors.push(`Phần tử font-pixel <${el.tagName.toLowerCase()}> có font-weight: ${fw} (gây lỗi faux-bold trên VT323)`);
              }
            }
          });

          // (i) [U3] Kiểm tra text-stroke trên văn bản
          const strokeElements = doc.querySelectorAll('*[style*="text-stroke"]');
          strokeElements.forEach(el => {
            const style = el.getAttribute('style') || '';
            const match = style.match(/text-stroke\s*:\s*([^;]+)/i);
            if (match && match[1].trim() !== '0px' && match[1].trim() !== '0px transparent' && match[1].trim() !== 'none') {
              routeErrors.push(`Phần tử <${el.tagName.toLowerCase()}> có text-stroke: ${match[1]}`);
            }
          });

          // Kiểm tra lỗi JavaScript trong console
          if (stderr) {
            const lines = stderr.split('\n');
            for (const line of lines) {
              if (line.includes('Uncaught') || line.includes('SyntaxError') || line.includes('TypeError')) {
                routeErrors.push(`Lỗi Console/JS: ${line.trim()}`);
              }
            }
          }

          if (routeErrors.length === 0) {
            console.log(`  ✓ [${vp.width}x${vp.height}] ${route.name}: ĐẠT CHUẨN (0 lỗi render, 0 chuỗi rác)`);
            auditResults.push({
              viewport: vp.name,
              route: route.name,
              path: route.path,
              status: 'PASS',
              errors: [],
            });
          } else {
            console.error(`  ✕ [${vp.width}x${vp.height}] ${route.name}: THẤT BẠI!`);
            for (const err of routeErrors) {
              console.error(`    - ${err}`);
            }
            totalErrors += routeErrors.length;
            auditResults.push({
              viewport: vp.name,
              route: route.name,
              path: route.path,
              status: 'FAIL',
              errors: routeErrors,
            });
          }
        } catch (err) {
          console.error(`  ✕ Lỗi khi truy cập ${url}:`, err.message);
          totalErrors++;
          auditResults.push({
            viewport: vp.name,
            route: route.name,
            path: route.path,
            status: 'ERROR',
            errors: [err.message],
          });
        }
      }
      console.log('');
    }

    console.log('[3/3] Xuất báo cáo kiểm toán giao diện...');
    const reportPath = path.join(ROOT, 'docs', 'UI_AUDIT_REPORT.md');
    let reportMd = `# BÁO CÁO KIỂM TOÁN GIAO DIỆN (UI AUDIT REPORT)\n\n`;
    reportMd += `- Ngày thực hiện: ${new Date().toISOString()}\n`;
    reportMd += `- Trình duyệt: Google Chrome (Headless Chromium v130+)\n`;
    reportMd += `- Tổng số lượt kiểm tra: ${auditResults.length} (${VIEWPORTS.length} viewports x ${ROUTES.length} routes)\n`;
    reportMd += `- Tổng số lỗi phát hiện: ${totalErrors}\n`;
    reportMd += `- Trạng thái: ${totalErrors === 0 ? '**100% ĐẠT CHUẨN (ALL PASS)**' : '**CÓ LỖI CẦN XỬ LÝ**'}\n\n`;

    reportMd += `## Chi tiết kết quả theo Viewport & Tuyến đường (Routes)\n\n`;
    reportMd += `| Viewport | Tuyến đường | Đường dẫn | Trạng thái | Ghi chú |\n`;
    reportMd += `|---|---|---|:---:|---|\n`;
    for (const r of auditResults) {
      reportMd += `| ${r.viewport} | ${r.route} | \`${r.path}\` | ${r.status === 'PASS' ? '✅ PASS' : '❌ FAIL'} | ${r.errors.length > 0 ? r.errors.join('; ') : 'Giao diện pixel nguyên vẹn, 0 lỗi render'} |\n`;
    }

    fs.writeFileSync(reportPath, reportMd, 'utf8');
    console.log(`✓ Đã lưu báo cáo tại: ${reportPath}`);

    if (totalErrors > 0) {
      console.error(`\n✕ UI Audit thất bại với ${totalErrors} lỗi!`);
      process.exit(1);
    } else {
      console.log('\n======================================================');
      console.log('  🎉 KẾT LUẬN: KIỂM TOÁN GIAO DIỆN HOÀN TOÀN ĐẠT CHUẨN! ');
      console.log('======================================================');
    }
  } finally {
    if (previewServer && previewServer.httpServer) {
      previewServer.httpServer.close();
    }
  }
}

runUiAudit().catch((err) => {
  console.error('Fatal error in UI Audit:', err);
  process.exit(1);
});

