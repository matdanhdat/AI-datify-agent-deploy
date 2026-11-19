# HƯỚNG DẪN KIỂM CHỨNG CHỈ SỐ ĐỊNH LƯỢNG (P4)

Tài liệu này cung cấp toàn bộ công thức toán học, công thức Excel tương đương và số liệu đối chứng độc lập trên tập dữ liệu mẫu chuẩn `public/samples/file-mau-chuan.xlsx` (250 phiên giao dịch năm 2025 của 3 mã TMA, TMB, TMC) để hội đồng phản biện và người dùng có thể tự kiểm tra, đối chiếu.

---

## 1. Nguyên tắc Bất biến trong Tính toán Định lượng

1. **AI Tuyệt đối Không Tính Số**: Toàn bộ chỉ số và chuỗi dữ liệu biểu đồ được tính toán bằng TypeScript thuần túy chạy trong Web Worker của trình duyệt. Không có bất kỳ API AI nào được gọi để tạo số liệu.
2. **Chuẩn Mực Excel**: Mọi công thức được thiết kế để khớp chính xác với kết quả hàm dựng sẵn trong Microsoft Excel và Google Sheets (ví dụ hàm tính độ lệch chuẩn mẫu `STDEV.S`, trung bình `AVERAGE`, đếm `COUNT`, `COUNTIF`).
3. **Tính Ổn Định Số Học**: Sử dụng thuật toán Welford tính trung bình và phương sai mẫu một lượt (one-pass) để loại bỏ hoàn toàn hiện tượng triệt tiêu thảm họa (catastrophic cancellation) của số thực dấu phẩy động IEEE 754.
4. **Không Có NaN hay Silent Errors**: Khi dữ liệu không đủ số phiên tối thiểu, hệ thống hiển thị rõ trạng thái `"Chưa đủ dữ liệu"` kèm lý do giải thích bằng tiếng Việt.

---

## 2. Bảng Đối Chiếu 17 Chỉ Số Cổ Phiếu Độc Lập

Giả sử trong Excel:
- Cột A: Ngày giao dịch (`A2:A251`)
- Cột C: Giá đóng cửa (`C2:C251`)
- Cột D: Giá mở cửa (`D2:D251`)
- Cột E: Giá cao nhất (`E2:E251`)
- Cột F: Giá thấp nhất (`F2:F251`)
- Cột G: Khối lượng giao dịch (`G2:G251`)
- Cột H: Chuỗi lợi suất ngày tại dòng 3: `=C3/C2 - 1` kéo xuống đến `H251`

| STT | Mã định danh (`id`) | Tên chỉ số tiếng Việt | Đơn vị | Công thức Toán học | Công thức tương đương trong Excel | Số phiên tối thiểu |
|:---:|:---|:---|:---:|:---|:---|:---:|
| 1 | `sessions` | Số phiên giao dịch | `count` | $N = \sum 1$ | `=COUNT(C2:C251)` | 1 |
| 2 | `last_close` | Giá đóng cửa gần nhất | `currency` | $P_{\text{end}}$ | `=LOOKUP(2, 1/(C2:C251<>""), C2:C251)` | 2 |
| 3 | `period_return` | Lợi suất cả kỳ | `ratio` | $\frac{P_{\text{end}}}{P_{\text{start}}} - 1$ | `=(C251-C2)/C2` | 2 |
| 4 | `ann_vol` | Biến động (năm hóa) | `ratio` | $\sigma_{\text{sample}} \times \sqrt{252}$ | `=STDEV.S(H3:H251)*SQRT(252)` | 20 |
| 5 | `sharpe` | Chỉ số Sharpe | `number` | $\frac{\bar{r} - r_f}{\sigma_{\text{sample}}} \times \sqrt{252}$ ($r_f=0$) | `=(AVERAGE(H3:H251)/STDEV.S(H3:H251))*SQRT(252)` | 20 |
| 6 | `max_dd` | Sụt giảm tối đa | `ratio` | $\min_{t} \left( \frac{P_t}{\max_{1 \le i \le t} P_i} - 1 \right)$ | Cột phụ $J_t$: `=C_t/MAX($C$2:C_t)-1`, sau đó `=MIN(J2:J251)` | 2 |
| 7 | `win_rate` | Tỷ lệ phiên tăng | `ratio` | $\frac{\sum [r_t > 0]}{\sum [r_t \text{ hợp lệ}]}$ | `=COUNTIF(H3:H251, ">0")/COUNT(H3:H251)` | 10 |
| 8 | `avg_range` | Biên độ dao động TB | `ratio` | $\frac{1}{N} \sum \frac{\text{High}_t - \text{Low}_t}{\text{Close}_t}$ | `=AVERAGE((E2:E251-F2:F251)/C2:C251)` (Ctrl+Shift+Enter) | 5 |
| 9 | `avg_volume` | Khối lượng TB | `number` | $\frac{1}{N} \sum V_t$ | `=AVERAGE(G2:G251)` | 1 |
| 10 | `volume_spike_days` | Số phiên đột biến KL | `count` | $\sum [V_t > \bar{V}_{20} + 2 \times \sigma_{20}]$ | `=IF(G22>AVERAGE(G2:G21)+2*STDEV.S(G2:G21), 1, 0)` | 21 |
| 11 | `ma20` | Đường MA20 | `currency` | $\frac{1}{20} \sum_{i=0}^{19} P_{N-i}$ | `=AVERAGE(C232:C251)` | 20 |
| 12 | `ma50` | Đường MA50 | `currency` | $\frac{1}{50} \sum_{i=0}^{49} P_{N-i}$ | `=AVERAGE(C202:C251)` | 50 |
| 13 | `ma_state` | Vị thế MA20 / MA50 | `text` | $\text{So sánh } \text{MA20} \text{ và } \text{MA50}$ | `=IF(MA20>MA50, "MA20 trên MA50", "MA20 dưới MA50")` | 50 |
| 14 | `rsi14` | Chỉ số RSI (14) | `number` | $100 - \frac{100}{1 + \frac{\text{AvgGain}_{14}}{\text{AvgLoss}_{14}}}$ | Theo giải thuật làm mượt J. Welles Wilder | 15 |
| 15 | `best_day` | Phiên tăng mạnh nhất | `ratio` | $\max(r_t)$ | `=MAX(H3:H251)` | 2 |
| 16 | `worst_day` | Phiên giảm mạnh nhất | `ratio` | $\min(r_t)$ | `=MIN(H3:H251)` | 2 |
| 17 | `date_range` | Khoảng thời gian | `text` | $\text{MinDate} \text{ - } \text{MaxDate}$ | `=TEXT(MIN(A2:A251),"dd/mm/yyyy") & " - " & TEXT(MAX(A2:A251),"dd/mm/yyyy")` | 1 |

---

## 3. Số Liệu Đối Chứng Thực Tế trên File Mẫu Chuẩn (`file-mau-chuan.xlsx`)

Dưới đây là kết quả kiểm chứng độc lập trên 250 phiên giao dịch của cả 3 mã cổ phiếu:

| Chỉ số | TMA | TMB | TMC | Ý nghĩa thực tế |
|:---|:---:|:---:|:---:|:---|
| **Số phiên** | 250 | 250 | 250 | Đủ 250 phiên giao dịch cả năm |
| **Giá cuối kỳ** | 70,37 đ | 62,22 đ | 31,73 đ | Giá chốt phiên ngày 31/12/2025 |
| **Lợi suất cả kỳ** | **+34,65%** | **-27,59%** | **+32,87%** | TMA & TMC tăng trưởng mạnh; TMB giảm sâu |
| **Biến động năm hóa** | 23,01% | 23,96% | 23,27% | Mức dao động quanh 23% năm |
| **Chỉ số Sharpe** | **1,42** | **-1,24** | **1,35** | TMA & TMC sinh lời vượt trội trên rủi ro; TMB âm |
| **Sụt giảm tối đa (MDD)**| -12,72% | **-36,45%** | -10,79% | TMB chịu rủi ro rút vốn sâu nhất |
| **Tỷ lệ phiên tăng** | 52,21% | 44,18% | 51,00% | TMA có trên một nửa số ngày tăng giá |
| **Biên độ dao động TB** | 2,71% | 2,78% | 2,76% | Chênh lệch giá cao/thấp bình quân mỗi phiên |
| **Khối lượng TB** | 858.245 CP | 864.306 CP | 848.769 CP | Thanh khoản khớp lệnh bình quân mỗi ngày |
| **Đột biến khối lượng** | 4 phiên | 1 phiên | 8 phiên | Số ngày KL vượt 2 độ lệch chuẩn 20 phiên trước |
| **Đường MA20** | 69,58 đ | 64,75 đ | 31,74 đ | Mức giá bình quân 20 phiên cuối năm |
| **Đường MA50** | 68,44 đ | 64,56 đ | 31,54 đ | Mức giá bình quân 50 phiên cuối năm |
| **Vị thế MA** | MA20 trên MA50 | MA20 trên MA50 | MA20 trên MA50 | Xu hướng ngắn hạn nằm trên trung hạn |
| **Chỉ số RSI (14)** | 56,88 | 40,30 | 51,30 | Cả 3 mã đều nằm trong vùng trung tính (30-70) |
| **Phiên tăng mạnh nhất** | +2,97% | +2,85% | +3,05% | Mức trần tăng trong ngày |
| **Phiên giảm mạnh nhất** | -2,58% | -2,66% | -2,87% | Mức giảm sâu nhất trong ngày |

---

## 4. Cách Chạy Kiểm Chứng Độc Lập Bằng Một Lệnh

Người dùng hoặc thành viên hội đồng có thể chạy script độc lập để tự động tính toán lại từ đầu và so sánh:

```bash
npm run verify:metrics
```

Lệnh trên đọc file CSV gốc, áp dụng công thức thuần túy, và in bảng đối chiếu kiểm định trong 1 giây mà không cần mở trình duyệt.

