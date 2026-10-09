import { useRef, useCallback, useState } from 'react'
import { exportPNG, exportSVG, exportCSV, slug } from './exporter'

/**
 * Shared export plumbing for a view: a ref for the chart's <svg>, the print-style
 * switch, and PNG / SVG / CSV handlers that all use the same title and note.
 */
export function useChartExport({ title, subtitle, note, filename, rows, columns }) {
  const svgRef = useRef(null)
  const [printMode, setPrintMode] = useState(false)
  const base = slug(filename || title || 'chart')
  const opts = () => ({ svgEl: svgRef.current, title, subtitle, note, printMode })
  const onPNG = useCallback(() => svgRef.current && exportPNG(opts(), `${base}.png`), [title, subtitle, note, printMode, base]) // eslint-disable-line react-hooks/exhaustive-deps
  const onSVG = useCallback(() => svgRef.current && exportSVG(opts(), `${base}.svg`), [title, subtitle, note, printMode, base]) // eslint-disable-line react-hooks/exhaustive-deps
  const onCSV = useCallback(() => rows && exportCSV(typeof rows === 'function' ? rows() : rows, `${base}.csv`, columns), [rows, base, columns])
  return { svgRef, printMode, setPrintMode, onPNG, onSVG, onCSV }
}

export const capFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** Full question text for display. AB labels (battery and round files) are complete titles. */
export function questionText(entry) {
  if (!entry) return ''
  return capFirst(entry.q || '')
}
