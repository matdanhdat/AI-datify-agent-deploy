import { execSync } from 'node:child_process';

console.log('======================================================');
console.log('  💥 KHỞI ĐỘNG KIỂM THỬ HỖN LOẠN & BỀN BỈ (CHAOS TEST) ');
console.log('======================================================\n');

try {
  console.log('[1/2] Thực thi bộ bài kiểm thử chống lỗi biên và tấn công dữ liệu...');
  execSync('npx vitest run src/tests/chaos.test.ts', { stdio: 'inherit' });
  console.log('\n✓ Hệ thống vượt qua 100% các ca kiểm thử hỗn loạn:');
  console.log('  - Từ chối tệp 0 byte và tệp rác nhị phân an toàn.');
  console.log('  - Từ chối tệp thiếu cấu trúc cột bắt buộc.');
  console.log('  - Đảm bảo tính lũy đạo (idempotence) khi người dùng click dồn dập.');
  console.log('  - Vận hành phân tích và kiểm định 100% độc lập khi mất mạng (offline).');

  console.log('\n======================================================');
  console.log('  🎉 KẾT LUẬN: ĐỘ BỀN VÀ KHẢ NĂNG CHỊU LỖI ĐẠT CHUẨN!   ');
  console.log('======================================================');
} catch (err) {
  console.error('\n✕ Phát hiện lỗi trong kiểm thử hỗn loạn!');
  process.exit(1);
}

