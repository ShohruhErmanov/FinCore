import type { CSSProperties } from 'react';

export const CHART_COLORS = {
  grid: 'var(--chart-grid)',
  axis: 'var(--chart-axis)',
  plan: 'var(--chart-plan)',
  actual: 'var(--chart-actual)',
  actualSoft: 'var(--chart-actual-soft)',
  canvas: 'var(--chart-canvas)',
  raised: 'var(--chart-raised)',
  text: 'var(--chart-text)',
  success: 'var(--chart-success)',
  danger: 'var(--chart-danger)',
  warning: 'var(--chart-warning)',
} as const;

export const CHART_TOOLTIP_STYLE: CSSProperties = {
  background: CHART_COLORS.raised,
  color: CHART_COLORS.text,
  border: `1px solid ${CHART_COLORS.grid}`,
  borderRadius: 14,
  boxShadow: 'var(--neu-shadow-2)',
  padding: '10px 12px',
};
