import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const PATCH_DIR = path.resolve(ROOT, 'docs', 'screens', 'P2', 'patch');
const MAIN_DIR = path.resolve(ROOT, 'docs', 'screens', 'P2');

fs.mkdirSync(PATCH_DIR, { recursive: true });
fs.mkdirSync(MAIN_DIR, { recursive: true });

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const PATCH_TARGETS = [
  { name: '01_state_created.png', path: '/?forceState=created' },
  { name: '02_state_uploaded.png', path: '/?forceState=uploaded' },
  { name: '03_state_cleaning_review.png', path: '/?forceState=cleaning_review' },
  { name: '04_state_clean_approved.png', path: '/?forceState=clean_approved' },
  { name: '05_state_analyzed.png', path: '/?forceState=analyzed' },
  { name: '06_state_report_approved.png', path: '/?forceState=report_approved' },
  { name: '07_confirm_dialog.png', path: '/nap-du-lieu?showConfirm=true' },
  { name: '08_locked_step_modal.png', path: '/lam-sach?forceState=created' },
  { name: '09_unlocked_clean_page.png', path: '/lam-sach?forceState=uploaded' },
  { name: '10_unlocked_analyze_page.png', path: '/phan-tich?forceState=clean_approved' },
  { name: '11_unlocked_report_page.png', path: '/bao-cao?forceState=analyzed' },
  { name: '12_chat_dock_open.png', path: '/?chat=1' },
  { name: '13_keyboard_focus_ring.png', path: '/nap-du-lieu?focusDropzone=true' },
];

const MAIN_TARGETS = [
  { name: '01_upload_success.png', path: '/nap-du-lieu?testCase=TC28_file_utf8_bom.csv' },
  { name: '02_upload_with_warnings.png', path: '/nap-du-lieu?testCase=TC23_cot_la_nhung_van_du_cot_chuan.csv&showWarnings=true' },
  { name: '03_reject_empty.png', path: '/nap-du-lieu?testCase=TC01_file_rong.csv' },
  { name: '04_reject_ext.png', path: '/nap-du-lieu?testCase=TC02_duoi_sai.txt' },
  { name: '05_reject_zip_bomb.png', path: '/nap-du-lieu?testCase=TC03_zip_bomb.xlsx' },
  { name: '06_reject_fake_png.png', path: '/nap-du-lieu?testCase=TC04_file_fake_png.xlsx' },
  { name: '07_reject_fake_pdf.png', path: '/nap-du-lieu?testCase=TC05_file_fake_pdf.csv' },
  { name: '08_reject_no_header.png', path: '/nap-du-lieu?testCase=TC09_khong_tim_thay_header.csv' },
  { name: '09_reject_missing_col.png', path: '/nap-du-lieu?testCase=TC07_csv_thieu_cot_bat_buoc.csv' },
  { name: '10_reject_dup_col.png', path: '/nap-du-lieu?testCase=TC08_trung_lap_cot.xlsx' },
  { name: '11_reject_bad_symbol.png', path: '/nap-du-lieu?testCase=TC10_ma_sai_dinh_dang.csv' },
  { name: '12_reject_neg_price.png', path: '/nap-du-lieu?testCase=TC11_gia_am.csv' },
  { name: '13_reject_neg_vol.png', path: '/nap-du-lieu?testCase=TC12_khoi_luong_am.xlsx' },
  { name: '14_reject_ohlc_inconsistent.png', path: '/nap-du-lieu?testCase=TC13_ohlc_khong_hop_ly.csv' },
  { name: '15_reject_bad_date.png', path: '/nap-du-lieu?testCase=TC14_ngay_sai_dinh_dang.csv' },
  { name: '16_reject_future_date.png', path: '/nap-du-lieu?testCase=TC15_ngay_tuong_lai.xlsx' },
  { name: '17_reject_conflict_dup.png', path: '/nap-du-lieu?testCase=TC16_trung_lap_xung_dot.csv' },
  { name: '18_reject_mixed_decimal.png', path: '/nap-du-lieu?testCase=TC17_hon_hop_dau_thap_phan.csv' },
  { name: '19_reject_too_many_rows.png', path: '/nap-du-lieu?testCase=TC19_vuot_qua_so_dong_toi_da.csv' },
  { name: '20_reject_too_many_symbols.png', path: '/nap-du-lieu?testCase=TC20_vuot_qua_so_ma_toi_da.csv' },
  { name: '21_reject_insufficient_sessions.png', path: '/nap-du-lieu?testCase=TC21_khong_du_so_phien.csv' },
  { name: '22_reject_truncated_50plus.png', path: '/nap-du-lieu?testCase=TC10_ma_sai_dinh_dang.csv' },
  { name: '23_reupload_confirm_dialog.png', path: '/nap-du-lieu?showConfirm=true' },
  { name: '24_dropzone_dragover.png', path: '/nap-du-lieu?dragOver=true' },
];

async function captureBatch(targets, targetDir) {
  for (const target of targets) {
    const outPath = path.join(targetDir, target.name);
    const url = `http://127.0.0.1:8000${target.path}`;
    console.log(`[capture] Capturing ${target.name} from ${url}...`);

    try {
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
        '--virtual-time-budget=3500',
        `--screenshot=${outPath}`,
        url,
      ]);

      if (fs.existsSync(outPath)) {
        const stats = fs.statSync(outPath);
        console.log(`  -> Saved ${target.name} (${(stats.size / 1024).toFixed(1)} KB)`);
      } else {
        console.error(`  -> Failed to create ${outPath}`);
      }
    } catch (err) {
      console.error(`  -> Error capturing ${target.name}:`, err.message);
    }
  }
}

async function main() {
  console.log('[capture] Starting Vite preview server on port 8000...');
  const previewServer = await preview({
    root: ROOT,
    preview: {
      port: 8000,
      host: '127.0.0.1',
    },
  });

  console.log('[capture] Preview server listening. Beginning capture batches...');

  try {
    console.log('\n--- BATCH 1: Patch Screenshots (docs/screens/P2/patch/) ---');
    await captureBatch(PATCH_TARGETS, PATCH_DIR);

    console.log('\n--- BATCH 2: Main P2 Screenshots (docs/screens/P2/) ---');
    await captureBatch(MAIN_TARGETS, MAIN_DIR);

    console.log('\n[capture] All P2 screenshots captured successfully!');
  } finally {
    console.log('[capture] Closing preview server...');
    previewServer.httpServer.close();
  }
}

main().catch((err) => {
  console.error('[capture] Error in main:', err);
  process.exit(1);
});

