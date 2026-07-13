// Deterministic canvas chart renderer for the SPSS studio's findings chapter.
// No chart library — draws directly on a <canvas>, exports a PNG data URL, and
// stitches the figures into chapter HTML. Browser APIs only (document.createElement).
// Hebrew RTL: category order runs right-to-left for bar charts; numeric axes stay LTR.

const CHART_WIDTH = 840;
const CHART_HEIGHT = 480;
const CHART_SCALE = 2;
const CHART_FONT_FAMILY = '"Segoe UI", Arial, sans-serif';

const COLOR_BAR_FILL = '#4472c4';
const COLOR_BAR_STROKE = '#35599e';
const COLOR_GRIDLINE = '#d9d9d9';
const COLOR_AXIS_LINE = '#8c8c8c';
const COLOR_AXIS_LABEL = '#666';
const COLOR_CATEGORY_LABEL = '#333';
const COLOR_TITLE = '#333';

const MAX_LABEL_CHARS_PER_LINE = 14;

const roundNiceMax = (value) => {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = 10 ** exponent;
  const fraction = value / magnitude;
  let niceFraction;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 2.5) niceFraction = 2.5;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;
  return niceFraction * magnitude;
};

// Wrap a label into up to 2 lines of ~MAX_LABEL_CHARS_PER_LINE chars, truncating the
// second line with an ellipsis if it still doesn't fit.
const wrapCategoryLabel = (rawLabel = '') => {
  const label = String(rawLabel || '').trim();
  if (label.length <= MAX_LABEL_CHARS_PER_LINE) return [label];

  const words = label.split(/\s+/);
  let line1 = '';
  let index = 0;
  while (index < words.length) {
    const candidate = line1 ? `${line1} ${words[index]}` : words[index];
    if (candidate.length > MAX_LABEL_CHARS_PER_LINE && line1) break;
    line1 = candidate;
    index += 1;
    if (candidate.length >= MAX_LABEL_CHARS_PER_LINE) break;
  }
  let line2 = words.slice(index).join(' ');
  if (!line2) {
    // Single unbreakable long word — hard-split it.
    line1 = label.slice(0, MAX_LABEL_CHARS_PER_LINE);
    line2 = label.slice(MAX_LABEL_CHARS_PER_LINE);
  }
  if (line2.length > MAX_LABEL_CHARS_PER_LINE) {
    line2 = `${line2.slice(0, MAX_LABEL_CHARS_PER_LINE - 1)}…`;
  }
  return [line1, line2];
};

const buildBarsFromDistribution = (distribution) => {
  if (distribution.kind === 'categorical') {
    const bars = distribution.valueCounts.map((entry) => ({
      label: entry.label || String(entry.value),
      count: entry.count,
    }));
    if (distribution.otherCount > 0) {
      bars.push({ label: 'אחר', count: distribution.otherCount });
    }
    return bars;
  }
  if (distribution.kind === 'histogram') {
    return distribution.bins.map((bin) => ({
      label: bin.start === bin.end ? String(bin.start) : `${bin.start}–${bin.end}`,
      count: bin.count,
    }));
  }
  return [];
};

const getColumnLabel = (column = {}) => (
  column.originalName || column.outputName || column.label || column.token || ''
);

/**
 * Render a single column's distribution as a PNG bar/histogram chart.
 * Returns { dataUrl, widthPx, heightPx } or null when there's nothing to draw.
 */
export const renderColumnDistributionChart = ({ column } = {}) => {
  const distribution = column?.distribution;
  if (!distribution || !distribution.kind) return null;

  const bars = buildBarsFromDistribution(distribution);
  if (!bars.length) return null;

  const canvas = document.createElement('canvas');
  canvas.width = CHART_WIDTH * CHART_SCALE;
  canvas.height = CHART_HEIGHT * CHART_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(CHART_SCALE, CHART_SCALE);
  if ('direction' in ctx) ctx.direction = 'rtl';

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);

  const margin = { top: 40, right: 30, bottom: 96, left: 70 };
  const plotWidth = CHART_WIDTH - margin.left - margin.right;
  const plotHeight = CHART_HEIGHT - margin.top - margin.bottom;
  const plotLeft = margin.left;
  const plotTop = margin.top;
  const plotBottom = margin.top + plotHeight;
  const plotRight = margin.left + plotWidth;

  const maxCount = Math.max(...bars.map((bar) => bar.count), 1);
  const yMax = roundNiceMax(maxCount * 1.15) || maxCount;
  const tickCount = 5;

  // Gridlines + y-axis tick labels (numeric, LTR, always on the left).
  ctx.font = '12px ' + CHART_FONT_FAMILY;
  ctx.fillStyle = COLOR_AXIS_LABEL;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let tick = 0; tick <= tickCount; tick += 1) {
    const value = (yMax / tickCount) * tick;
    const y = plotBottom - (value / yMax) * plotHeight;
    ctx.strokeStyle = COLOR_GRIDLINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
    ctx.fillText(String(Math.round(value * 10) / 10), plotLeft - 8, y);
  }

  // Axis lines.
  ctx.strokeStyle = COLOR_AXIS_LINE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(plotLeft, plotTop);
  ctx.lineTo(plotLeft, plotBottom);
  ctx.lineTo(plotRight, plotBottom);
  ctx.stroke();

  // Bars. Categorical: right-to-left order (first category at the right edge).
  // Histogram: contiguous, left-to-right (numeric axis stays LTR by convention).
  const barCount = bars.length;
  const gapRatio = distribution.kind === 'histogram' ? 0.04 : 0.25;
  const slotWidth = plotWidth / barCount;
  const barWidth = slotWidth * (1 - gapRatio);
  const barGapOffset = (slotWidth - barWidth) / 2;

  bars.forEach((bar, index) => {
    const displayIndex = distribution.kind === 'categorical' ? (barCount - 1 - index) : index;
    const slotX = plotLeft + displayIndex * slotWidth;
    const barX = slotX + barGapOffset;
    const barHeight = (bar.count / yMax) * plotHeight;
    const barY = plotBottom - barHeight;

    ctx.fillStyle = COLOR_BAR_FILL;
    ctx.strokeStyle = COLOR_BAR_STROKE;
    ctx.lineWidth = 1;
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.strokeRect(barX, barY, barWidth, barHeight);

    // Count label above the bar.
    ctx.font = '11px ' + CHART_FONT_FAMILY;
    ctx.fillStyle = COLOR_CATEGORY_LABEL;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(bar.count), barX + barWidth / 2, Math.max(barY - 6, 14));

    // Category label under the bar (wrapped to ≤2 lines). תוויות מספריות טהורות
    // (טווחי bins כמו "25–30") חייבות כיוון LTR — אחרת ה-bidi הופך אותן ל-"30–25".
    const lines = wrapCategoryLabel(bar.label);
    ctx.font = '13px ' + CHART_FONT_FAMILY;
    ctx.fillStyle = COLOR_CATEGORY_LABEL;
    lines.forEach((line, lineIndex) => {
      const isNumericLabel = /^[\d.,\s–—-]+$/.test(line);
      if (isNumericLabel && 'direction' in ctx) ctx.direction = 'ltr';
      ctx.fillText(line, barX + barWidth / 2, plotBottom + 18 + lineIndex * 15);
      if (isNumericLabel && 'direction' in ctx) ctx.direction = 'rtl';
    });
  });

  // X axis title (variable label).
  const columnLabel = getColumnLabel(column);
  ctx.font = 'bold 14px ' + CHART_FONT_FAMILY;
  ctx.fillStyle = COLOR_TITLE;
  ctx.textAlign = 'center';
  ctx.fillText(columnLabel, plotLeft + plotWidth / 2, CHART_HEIGHT - 12);

  // Y axis title ("שכיחות"), rotated, on the left.
  ctx.save();
  ctx.translate(18, plotTop + plotHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.font = 'bold 14px ' + CHART_FONT_FAMILY;
  ctx.fillStyle = COLOR_TITLE;
  ctx.textAlign = 'center';
  ctx.fillText('שכיחות', 0, 0);
  ctx.restore();

  return {
    dataUrl: canvas.toDataURL('image/png'),
    widthPx: CHART_WIDTH,
    heightPx: CHART_HEIGHT,
  };
};

const CHARTABLE_ROLES = new Set(['likert', 'categorical', 'categorical-code', 'continuous']);

const buildStatsLine = (distribution) => {
  if (distribution.kind === 'categorical') {
    const top3 = [...distribution.valueCounts]
      .sort((left, right) => right.count - left.count)
      .slice(0, 3)
      .map((entry) => `${entry.label || entry.value}: n=${entry.count}`)
      .join('; ');
    return `${top3}; N=${distribution.n}`;
  }
  if (distribution.kind === 'histogram') {
    const bins = distribution.bins;
    const topBin = bins.reduce((best, bin) => (bin.count > (best?.count ?? -1) ? bin : best), null);
    const rangeMin = bins[0]?.start;
    const rangeMax = bins[bins.length - 1]?.end;
    const topRange = topBin ? `${topBin.start}–${topBin.end}` : '—';
    const topCount = topBin ? topBin.count : 0;
    return `טווח ${rangeMin}–${rangeMax}, שיא בטווח ${topRange} (n=${topCount}), N=${distribution.n}`;
  }
  return `N=${distribution.n}`;
};

const buildCaption = (figureNumber, kindHebrew, label, distribution) => {
  let caption = `תרשים ${figureNumber}: ${kindHebrew} של ${label} (N=${distribution.n})`;
  if (Array.isArray(distribution.excludedSuspectedMissing) && distribution.excludedSuspectedMissing.length) {
    const codes = distribution.excludedSuspectedMissing.map((entry) => entry.code).join(', ');
    caption += ` (לא כולל קוד חוסר ${codes})`;
  }
  return caption;
};

const buildFigureHtml = ({ token, kindHebrew, label, caption, dataUrl }) => `<figure data-spss-figure="${token}" style="text-align:center;margin:16px 0;">
  <img src="${dataUrl}" alt="${kindHebrew} של ${label}" style="max-width:420px;width:100%;" />
  <figcaption style="font-size:0.9em;color:#444;">${caption}</figcaption>
</figure>`;

/**
 * Build chartable figures (image + caption + stats line) for every eligible column
 * in a completed SPSS analysis, capped at options.maxFigures. Returns
 * { figures, skipped } where skipped lists the names of columns that were bumped
 * past the cap.
 */
export const buildChapterFigures = (analysis, options = {}) => {
  const maxFigures = Number.isFinite(options.maxFigures) ? options.maxFigures : 12;
  const priorityText = String(options.priorityText || '');

  const columns = Array.isArray(analysis?.columns) ? analysis.columns : [];
  const eligible = columns.filter((column) => (
    column?.distribution
    && column.distribution.kind
    && CHARTABLE_ROLES.has(column.analysisRole)
    && column.distribution.n >= 3
  ));

  const isPrioritized = (column) => {
    if (!priorityText) return false;
    const label = getColumnLabel(column);
    return Boolean(label) && priorityText.includes(label);
  };

  const ordered = [...eligible].sort((left, right) => {
    const leftPriority = isPrioritized(left) ? 1 : 0;
    const rightPriority = isPrioritized(right) ? 1 : 0;
    return rightPriority - leftPriority;
  });

  const selected = ordered.slice(0, maxFigures);
  const skipped = ordered.slice(maxFigures).map((column) => getColumnLabel(column));

  const figures = selected.map((column, index) => {
    const rendered = renderColumnDistributionChart({ column });
    if (!rendered) return null;

    const figureNumber = index + 1;
    const label = getColumnLabel(column);
    const kindHebrew = column.distribution.kind === 'histogram' ? 'היסטוגרמה' : 'דיאגרמת מקלות';
    const statsLine = buildStatsLine(column.distribution);
    const caption = buildCaption(figureNumber, kindHebrew, label, column.distribution);
    const html = buildFigureHtml({
      token: column.token,
      kindHebrew,
      label,
      caption,
      dataUrl: rendered.dataUrl,
    });

    return {
      token: column.token,
      columnName: label,
      label,
      figureNumber,
      kindHebrew,
      statsLine,
      caption,
      html,
    };
  }).filter(Boolean);

  return { figures, skipped };
};

const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const FIGURE_MARKER_PATTERN = (key) => new RegExp(`(<p[^>]*>\\s*)?\\[\\[FIG:\\s*${escapeRegExp(key)}\\s*\\]\\](\\s*<\\/p>)?`, 'g');
const ANY_FIGURE_MARKER_PATTERN = /(<p[^>]*>\s*)?\[\[FIG:[^\]]*\]\](\s*<\/p>)?|\[\[FIG:[^\]]*/g;
const INFERENTIAL_HEADING_PATTERN = /מתאמ|קשר|השער|היפותז/;
const HEADING_TAG_PATTERN = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi;

/**
 * Replace [[FIG:<token>]] markers in chapter HTML with their rendered figure HTML
 * (tolerating a wrapping <p>...</p>). Figures whose marker never appeared are
 * appended under a "תרשימי התפלגות" heading, inserted before the first inferential
 * section heading if one exists, else at the end. Pure string/regex — no DOM.
 */
export const applyFigureMarkersToHtml = (html, figures = []) => {
  let result = String(html || '');
  let replacedCount = 0;
  const appended = [];

  figures.forEach((figure) => {
    // המרקר עשוי להופיע עם ה-token (VAR_n) או — אחרי restoreColumnTokens — עם השם
    // המקורי של המשתנה. מנסים את שניהם.
    const keys = [...new Set([figure.token, figure.columnName].filter(Boolean))];
    let replaced = false;
    keys.forEach((key) => {
      const pattern = FIGURE_MARKER_PATTERN(key);
      if (pattern.test(result)) {
        pattern.lastIndex = 0;
        result = result.replace(pattern, () => {
          if (replaced) return '';
          replaced = true;
          replacedCount += 1;
          return figure.html;
        });
      }
    });
    if (!replaced) appended.push(figure);
  });

  let appendedCount = 0;
  if (appended.length) {
    const appendedHtml = `<h3>תרשימי התפלגות</h3>\n${appended.map((figure) => figure.html).join('\n')}`;
    appendedCount = appended.length;

    let insertIndex = -1;
    HEADING_TAG_PATTERN.lastIndex = 0;
    let match = HEADING_TAG_PATTERN.exec(result);
    while (match) {
      const headingText = match[1].replace(/<[^>]*>/g, '');
      if (INFERENTIAL_HEADING_PATTERN.test(headingText)) {
        insertIndex = match.index;
        break;
      }
      match = HEADING_TAG_PATTERN.exec(result);
    }

    if (insertIndex >= 0) {
      result = `${result.slice(0, insertIndex)}${appendedHtml}\n${result.slice(insertIndex)}`;
    } else {
      result = `${result}\n${appendedHtml}`;
    }
  }

  // Strip any leftover markers (unknown tokens, or partial fragments left by a paste seam).
  result = result.replace(ANY_FIGURE_MARKER_PATTERN, '');
  // Clean up now-empty paragraphs left behind by a stripped marker.
  result = result.replace(/<p[^>]*>\s*<\/p>/g, '');

  return { html: result, replacedCount, appendedCount };
};
