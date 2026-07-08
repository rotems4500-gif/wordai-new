import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// מנוע עימוד: מודד גבהים של בלוקים ברמה העליונה ומזריק spacer-widgets כך שכל
// בלוק שגולש מעבר לגבול עמוד נדחף לראש העמוד הבא. גבולות העמודים מתיישרים
// למכפלות של גובה-עמוד — כך שה-overlay הקיים (קווי עמוד + chrome כותרות) מדויק.
// אין פיצול DOM אמיתי; זה עימוד ויזואלי (approximation), אבל התוכן זז באמת.

export const paginationKey = new PluginKey('pagination');

const PX_PER_CM = 96 / 2.54;

const parseCssLength = (value, fallbackPx = 0) => {
  const raw = String(value || '').trim();
  if (!raw) return fallbackPx;
  const num = Number.parseFloat(raw);
  if (!Number.isFinite(num)) return fallbackPx;
  if (raw.endsWith('cm')) return num * PX_PER_CM;
  if (raw.endsWith('mm')) return num * PX_PER_CM / 10;
  if (raw.endsWith('pt')) return num * (96 / 72);
  return num; // px
};

// עמוד שהבלוק שייך אליו לפי מיקום במסמך (עבור שדות מספר-עמוד חיים)
export const getPageAtPos = (state, pos) => {
  const pluginState = paginationKey.getState(state);
  if (!pluginState?.blockPages?.length) return null;
  let page = 1;
  for (const entry of pluginState.blockPages) {
    if (entry.pos > pos) break;
    page = entry.page;
  }
  return page;
};

const buildDecorations = (doc, spacers) => DecorationSet.create(doc, spacers.map(({ pos, height }) => (
  Decoration.widget(pos, () => {
    const el = document.createElement('div');
    el.className = 'page-spacer';
    el.style.cssText = `height:${Math.max(0, Math.round(height))}px;pointer-events:none;user-select:none;`;
    el.setAttribute('contenteditable', 'false');
    return el;
  }, { side: -1, key: `sp-${pos}-${Math.round(height)}` })
)));

export const Pagination = Extension.create({
  name: 'pagination',

  addProseMirrorPlugins() {
    let rafId = 0;
    let lastSignature = '';

    return [
      new Plugin({
        key: paginationKey,

        state: {
          init: () => ({ decos: DecorationSet.empty, pageCount: 1, blockPages: [] }),
          apply(tr, prev, _old, newState) {
            const meta = tr.getMeta(paginationKey);
            if (meta) {
              return {
                decos: buildDecorations(newState.doc, meta.spacers),
                pageCount: meta.pageCount,
                blockPages: meta.blockPages,
              };
            }
            if (!tr.docChanged) return prev;
            return { ...prev, decos: prev.decos.map(tr.mapping, newState.doc) };
          },
        },

        props: {
          decorations(state) {
            return paginationKey.getState(state)?.decos || DecorationSet.empty;
          },
        },

        view(view) {
          const measure = () => {
            const dom = view.dom;
            if (!dom || !dom.isConnected) return;

            const isPrint = (dom.dataset.viewMode || 'print') === 'print';
            if (!isPrint) {
              if (lastSignature !== 'off') {
                lastSignature = 'off';
                view.dispatch(view.state.tr
                  .setMeta(paginationKey, { spacers: [], pageCount: 1, blockPages: [] })
                  .setMeta('addToHistory', false)
                  .setMeta('trackChangeSkip', true));
                window.dispatchEvent(new CustomEvent('wordflow:pagination', { detail: { pageCount: 1 } }));
              }
              return;
            }

            const computed = window.getComputedStyle(dom);
            const pageHeight = parseCssLength(
              dom.style.getPropertyValue('--wordai-page-min-height') || computed.getPropertyValue('--wordai-page-min-height'),
              29.7 * PX_PER_CM,
            );
            const padTop = parseCssLength(computed.paddingTop, 2.54 * PX_PER_CM);
            const padBottom = parseCssLength(computed.paddingBottom, 2.54 * PX_PER_CM);
            const contentPerPage = Math.max(120, pageHeight - padTop - padBottom);

            const pageOuter = pageHeight;

            // מיקומים טבעיים אמיתיים מה-DOM (כולל margin-collapse), בקיזוז spacers קיימים.
            const naturalTops = new Map(); // element → absolute top ללא spacers
            {
              let spacerAccum = 0;
              for (const child of dom.children) {
                if (child.classList?.contains('page-spacer')) {
                  spacerAccum += child.offsetHeight;
                  continue;
                }
                naturalTops.set(child, child.offsetTop - spacerAccum);
              }
            }

            const doc = view.state.doc;
            const blocks = [];
            doc.forEach((node, offset) => {
              let el = null;
              try { el = view.nodeDOM(offset); } catch { el = null; }
              if (!(el instanceof HTMLElement) || !naturalTops.has(el)) return;
              blocks.push({
                pos: offset,
                top: naturalTops.get(el),
                height: el.offsetHeight,
                isBreak: node.type.name === 'pageBreak',
              });
            });

            // סימולציה על מיקומים אבסולוטיים: absTop = טבעי + סך ה-spacers שנוספו עד כה
            const spacers = [];
            const blockPages = [];
            let shift = 0;
            let page = 0;
            let pendingBreak = false;

            blocks.forEach((block) => {
              let absTop = block.top + shift;
              const pageStartContent = page * pageOuter + padTop;
              const pageEndContent = (page + 1) * pageOuter - padBottom;
              const fitsOnFreshPage = block.height <= contentPerPage;

              const pushToNextPage = () => {
                page += 1;
                const target = page * pageOuter + padTop;
                const spacerHeight = target - absTop;
                if (spacerHeight > 1) {
                  spacers.push({ pos: block.pos, height: spacerHeight });
                  shift += spacerHeight;
                  absTop = target;
                }
              };

              if (pendingBreak) {
                pendingBreak = false;
                pushToNextPage();
              } else if (absTop + block.height > pageEndContent && fitsOnFreshPage && absTop > pageStartContent + 2) {
                pushToNextPage();
              }

              blockPages.push({ pos: block.pos, page: page + 1 });

              if (block.isBreak) {
                pendingBreak = true;
                return;
              }
              // בלוק ארוך מעמוד שלם זולג הלאה — מקדמים את מונה העמוד לפי תחתיתו
              while (absTop + block.height > (page + 1) * pageOuter - padBottom && block.height > contentPerPage) {
                page += 1;
                if (page > 5000) break;
              }
            });

            const lastBlock = blocks[blocks.length - 1];
            const contentBottom = lastBlock ? lastBlock.top + shift + lastBlock.height : 0;
            const pageCount = Math.max(page + 1, Math.max(1, Math.ceil((contentBottom + padBottom) / pageOuter)));

            // עיגול לדליים של 3px כדי למנוע תנודות מדידה אינסופיות
            const signature = JSON.stringify([pageCount, spacers.map((s) => [s.pos, Math.round(s.height / 3)])]);
            if (signature === lastSignature) return;
            lastSignature = signature;

            view.dispatch(view.state.tr
              .setMeta(paginationKey, { spacers, pageCount, blockPages })
              .setMeta('addToHistory', false)
              .setMeta('trackChangeSkip', true));
            window.dispatchEvent(new CustomEvent('wordflow:pagination', { detail: { pageCount } }));
          };

          const schedule = () => {
            if (rafId) window.cancelAnimationFrame(rafId);
            rafId = window.requestAnimationFrame(() => {
              rafId = 0;
              try { measure(); } catch { /* מדידה נכשלה רגעית — ניסיון הבא ב-update */ }
            });
          };

          schedule();
          // תמונות שנטענות באיחור / שינויי רוחב משנים גבהים
          const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
          resizeObserver?.observe(view.dom);

          return {
            update: schedule,
            destroy() {
              if (rafId) window.cancelAnimationFrame(rafId);
              resizeObserver?.disconnect();
            },
          };
        },
      }),
    ];
  },
});

export default Pagination;
