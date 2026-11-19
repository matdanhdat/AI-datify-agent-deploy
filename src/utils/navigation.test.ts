import { describe, expect, it } from 'vitest';
import {
  getCurrentStepPath,
  getLockExplanation,
  getStateBadgeVariant,
  getStateLabelVi,
  getStepPath,
  PAGE_TITLES,
} from './navigation';


describe('Navigation & State Machine Helpers', () => {
  it('maps all 6 session states to accurate Vietnamese labels', () => {
    expect(getStateLabelVi('created')).toBe('Phiên mới');
    expect(getStateLabelVi('uploaded')).toBe('Đã nạp dữ liệu');
    expect(getStateLabelVi('cleaning_review')).toBe('Chờ duyệt dữ liệu');
    expect(getStateLabelVi('clean_approved')).toBe('Đã duyệt dữ liệu');
    expect(getStateLabelVi('analyzed')).toBe('Chờ duyệt báo cáo');
    expect(getStateLabelVi('report_approved')).toBe('Báo cáo đã duyệt');
  });

  it('maps session states to appropriate badge variants', () => {
    expect(getStateBadgeVariant('created')).toBe('neutral');
    expect(getStateBadgeVariant('uploaded')).toBe('info');
    expect(getStateBadgeVariant('cleaning_review')).toBe('warn');
    expect(getStateBadgeVariant('clean_approved')).toBe('success');
    expect(getStateBadgeVariant('analyzed')).toBe('warn');
    expect(getStateBadgeVariant('report_approved')).toBe('success');
  });

  it('resolves step keys to the correct route paths', () => {
    expect(getStepPath('upload')).toBe('/nap-du-lieu');
    expect(getStepPath('clean')).toBe('/lam-sach');
    expect(getStepPath('review')).toBe('/lam-sach');
    expect(getStepPath('analyze')).toBe('/phan-tich');
    expect(getStepPath('report')).toBe('/bao-cao');
  });

  it('determines the current step path for navigation redirects based on state', () => {
    expect(getCurrentStepPath('created')).toBe('/nap-du-lieu');
    expect(getCurrentStepPath('uploaded')).toBe('/lam-sach');
    expect(getCurrentStepPath('cleaning_review')).toBe('/lam-sach');
    expect(getCurrentStepPath('clean_approved')).toBe('/phan-tich');
    expect(getCurrentStepPath('analyzed')).toBe('/bao-cao');
    expect(getCurrentStepPath('report_approved')).toBe('/bao-cao');
  });

  it('generates clear and specific lock explanations for gated routes', () => {
    // Clean page locked at created state
    const cleanExp = getLockExplanation('clean', 'created');
    expect(cleanExp.pageTitle).toBe('Làm sạch & Phê duyệt');
    expect(cleanExp.actionPath).toBe('/nap-du-lieu');
    expect(cleanExp.message).toContain('nạp tệp dữ liệu giao dịch');

    // Analyze page locked at uploaded state
    const analyzeExpUploaded = getLockExplanation('analyze', 'uploaded');
    expect(analyzeExpUploaded.pageTitle).toBe('Phân tích & Biểu đồ');
    expect(analyzeExpUploaded.actionPath).toBe('/nap-du-lieu');

    // Analyze page locked at cleaning_review state
    const analyzeExpReview = getLockExplanation('analyze', 'cleaning_review');
    expect(analyzeExpReview.actionPath).toBe('/lam-sach');
    expect(analyzeExpReview.message).toContain('Cổng duyệt 1');

    // Report page locked at cleaning_review state
    const reportExpReview = getLockExplanation('report', 'cleaning_review');
    expect(reportExpReview.actionPath).toBe('/lam-sach');
    expect(reportExpReview.message).toContain('Cổng 1');

    // Report page locked at clean_approved state (needs quantitative analysis)
    const reportExpCleanApproved = getLockExplanation('report', 'clean_approved');
    expect(reportExpCleanApproved.actionPath).toBe('/phan-tich');
    expect(reportExpCleanApproved.message).toContain('tính toán các chỉ số định lượng');
  });

  it('contains consistent Vietnamese page titles', () => {
    expect(PAGE_TITLES.home).toBe('Trang chủ');
    expect(PAGE_TITLES.upload).toBe('Nạp dữ liệu');
    expect(PAGE_TITLES.clean).toBe('Làm sạch & Phê duyệt');
    expect(PAGE_TITLES.analyze).toBe('Phân tích & Biểu đồ');
    expect(PAGE_TITLES.report).toBe('Báo cáo & Nhận định');
  });
});
