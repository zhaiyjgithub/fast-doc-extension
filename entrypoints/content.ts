export default defineContentScript({
  matches: ['*://*/*'],
  allFrames: true,
  main() {
    type ExtractPageData = {
      url: string;
      title: string;
      text: string;
    };

    type ExtractPageResponse =
      | { ok: true; data: ExtractPageData }
      | { ok: false; error: string };

    type ExtractDemographicsData = {
      profileId: string;
      selectorMatched: string;
      demographicsText: string;
      sourceUrl?: string;
      sourcePath?: string;
      signalSummary?: {
        score: number;
        matched: string[];
        missing: string[];
      };
      textPreview?: string;
    };

    type ExtractDemographicsResponse =
      | { ok: true; data: ExtractDemographicsData }
      | { ok: false; error: string };

    type SyncChiefComplaintPayload = {
      chiefComplaintText: string;
      presentIllnessText: string;
      autoSave?: boolean;
    };

    type SyncChiefComplaintResponse =
      | {
          ok: true;
          strategy?: string;
          sourceUrl?: string;
          sourcePath?: string;
          note?: string;
          diagnostics?: unknown;
        }
      | { ok: false; error: string };

    type RuntimeMessage = {
      type?: string;
      payload?: SyncChiefComplaintPayload & { debug?: boolean; requestId?: string };
    };

    type SearchTarget = {
      doc: Document;
      path: string;
      sourceUrl: string;
    };

    const MAX_TEXT_LENGTH = 20_000;
    let lastDemographicsSourceUrl: string | null = null;
    let lastDemographicsSourcePath: string | null = null;

    function isElementNode(value: unknown): value is HTMLElement {
      if (value == null || typeof value !== 'object') return false;
      const node = value as { nodeType?: unknown; tagName?: unknown };
      return node.nodeType === 1 && typeof node.tagName === 'string';
    }

    function logContentDebug(message: RuntimeMessage, stage: string, details?: unknown): void {
      if (!message.payload?.debug) {
        return;
      }
      const requestId = message.payload.requestId ?? 'n/a';
      const prefix = `[FastDoc][content][${requestId}]`;
      if (details === undefined) {
        console.log(`${prefix} ${stage}`);
      } else {
        console.log(`${prefix} ${stage}`, details);
      }
    }

    function extractActivePage(): ExtractPageResponse {
      try {
        const text = (document.body?.innerText ?? '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, MAX_TEXT_LENGTH);

        return {
          ok: true,
          data: {
            url: window.location.href,
            title: document.title,
            text,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to extract active page';
        return { ok: false, error: message };
      }
    }

    function escapeRegExp(value: string): string {
      return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    type EmrDomProfile = {
      id: string;
      hostPatterns: RegExp[];
      selectors: {
        demographicsRoot: string[];
        chiefComplaint: string[];
        presentIllness: string[];
      };
    };

    // Add new EMR profiles here (host + selectors) instead of editing extraction logic.
    const EMR_DOM_PROFILES: EmrDomProfile[] = [
      {
        id: 'eclinic',
        hostPatterns: [/./],
        selectors: {
          demographicsRoot: ['#PatientDemographics'],
          chiefComplaint: [
            '#div_chiefComplaint_view',
            '#div_chiefcomplaint_view',
            '#div_chiefcomplaint #div_chiefComplaint_view',
          ],
          presentIllness: [
            '#div_presentIllness_view',
            '#div_presentillness_view',
            '#div_chiefcomplaint #div_presentIllness_view',
          ],
        },
      },
    ];

    function getActiveEmrProfile(hostname: string): EmrDomProfile {
      const matched = EMR_DOM_PROFILES.find((profile) =>
        profile.hostPatterns.some((pattern) => pattern.test(hostname)),
      );
      return matched ?? EMR_DOM_PROFILES[0];
    }

    function queryFirstElement(selectors: string[]): HTMLElement | null {
      for (const selector of selectors) {
        const node = document.querySelector(selector);
        if (node instanceof HTMLElement) {
          return node;
        }
      }
      return null;
    }

    function queryFirstElementInDoc(doc: Document, selectors: string[]): HTMLElement | null {
      for (const selector of selectors) {
        const node = doc.querySelector(selector);
        if (node instanceof HTMLElement) {
          return node;
        }
      }
      return null;
    }

    function collectSameOriginDocs(rootDoc: Document, rootPath: string): SearchTarget[] {
      const targets: SearchTarget[] = [];
      const rootUrl = rootDoc.location?.href ?? window.location.href;
      targets.push({ doc: rootDoc, path: rootPath, sourceUrl: rootUrl });

      const frames = rootDoc.querySelectorAll('iframe, frame');
      frames.forEach((frameEl, idx) => {
        try {
          const frame = frameEl as HTMLIFrameElement;
          const childDoc = frame.contentDocument;
          if (childDoc != null) {
            const tag = frameEl.tagName.toLowerCase();
            const name = frame.getAttribute('name') ?? frame.getAttribute('id') ?? `${idx}`;
            const childPath = `${rootPath}>${tag}[${name}]`;
            targets.push(...collectSameOriginDocs(childDoc, childPath));
          }
        } catch {
          // Cross-origin frame; ignore and continue.
        }
      });

      return targets;
    }

    function collectSameOriginDocsFromWindowTree(rootWindow: Window, rootPath: string): SearchTarget[] {
      const targets: SearchTarget[] = [];

      try {
        const rootDoc = rootWindow.document;
        const rootUrl = rootWindow.location?.href ?? rootDoc.location?.href ?? window.location.href;
        targets.push({ doc: rootDoc, path: rootPath, sourceUrl: rootUrl });
      } catch {
        return targets;
      }

      for (let idx = 0; idx < rootWindow.frames.length; idx += 1) {
        try {
          const childWindow = rootWindow.frames[idx];
          const childPath = `${rootPath}>win-frame[${idx}]`;
          targets.push(...collectSameOriginDocsFromWindowTree(childWindow, childPath));
        } catch {
          // Cross-origin frame; ignore and continue.
        }
      }

      return targets;
    }

    function mergeSearchTargets(...groups: SearchTarget[][]): SearchTarget[] {
      const merged: SearchTarget[] = [];
      const seen = new Set<string>();

      for (const group of groups) {
        for (const target of group) {
          const key = `${target.sourceUrl}::${target.path}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(target);
        }
      }

      return merged;
    }

    function extractEmrDemographics(message: RuntimeMessage): ExtractDemographicsResponse {
      try {
        type FeatureSignal = {
          key: string;
          pattern: RegExp;
        };

        function hasDemographicsMarker(doc: Document): boolean {
          if (doc.getElementById('PatientDemographics') != null) return true;
          if (doc.querySelector('#div_patientinfo, #patientinfo') != null) return true;
          const bodyText = doc.body?.innerText ?? '';
          return /patient demographics/i.test(bodyText);
        }

        const FEATURE_SIGNALS: FeatureSignal[] = [
          { key: 'name', pattern: /\bName\s*:\s*/i },
          { key: 'dob', pattern: /\bDOB\s*:\s*\d{1,2}\/\d{1,2}\/\d{4}\b/i },
          { key: 'age', pattern: /\bAge\s*:\s*\d+\s*y?\b/i },
          { key: 'gender', pattern: /\bGender\s*:\s*(Male|Female|Other)\b/i },
          { key: 'patientId', pattern: /\bPatient\s*ID\s*:\s*\d+\b/i },
          { key: 'address', pattern: /\bAddress\s*:\s*/i },
          { key: 'phone', pattern: /\bPhone\s*:\s*/i },
          { key: 'email', pattern: /\bEmail\s*:\s*[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/i },
        ];

        function evaluateFeatureSignals(doc: Document): {
          score: number;
          matched: string[];
          missing: string[];
          normalizedText: string;
        } {
          const normalizedText = (doc.body?.innerText ?? '').replace(/\s+/g, ' ').trim();
          const matched: string[] = [];
          const missing: string[] = [];

          for (const signal of FEATURE_SIGNALS) {
            if (signal.pattern.test(normalizedText)) {
              matched.push(signal.key);
            } else {
              missing.push(signal.key);
            }
          }

          return {
            score: matched.length,
            matched,
            missing,
            normalizedText,
          };
        }

        function getDemographicsSectionText(doc: Document): { text: string; selector: string } | null {
          function normalizeText(value: string): string {
            return value.replace(/\s+/g, ' ').trim();
          }

          function sliceDemographicsWindow(value: string): string {
            const normalized = normalizeText(value);
            if (!normalized) return '';

            const startLabel = 'Patient Demographics';
            const endLabel = 'Chief Complaint';
            const startIdx = normalized.toLowerCase().indexOf(startLabel.toLowerCase());
            const endIdx = normalized.toLowerCase().indexOf(endLabel.toLowerCase());

            if (startIdx >= 0 && endIdx > startIdx) {
              return normalized.slice(startIdx, endIdx).trim();
            }
            if (startIdx >= 0) {
              return normalized.slice(startIdx).trim();
            }
            return normalized;
          }

          const sectionById = doc.querySelector('#PatientDemographics');
          if (sectionById instanceof HTMLElement) {
            const text = sliceDemographicsWindow(sectionById.innerText);
            if (text) return { text, selector: '#PatientDemographics' };
          }

          const sectionByContainer = doc.querySelector('#div_patientinfo');
          if (sectionByContainer instanceof HTMLElement) {
            const text = sliceDemographicsWindow(sectionByContainer.innerText);
            if (text) return { text, selector: '#div_patientinfo' };
          }

          const titleCell = Array.from(doc.querySelectorAll('td, b, span')).find((node) =>
            /patient demographics/i.test(node.textContent ?? ''),
          );
          if (titleCell instanceof HTMLElement) {
            const closestBlock =
              titleCell.closest('#table_patientinfo, #div_patientinfo, table, tr, td, div');
            if (closestBlock instanceof HTMLElement) {
              const text = sliceDemographicsWindow(closestBlock.innerText);
              if (text) return { text, selector: 'closest(patient-demographics-title)' };
            }
          }

          // Last resort: split full document text between known section labels.
          const fallbackWindow = sliceDemographicsWindow(doc.body?.innerText ?? '');
          if (fallbackWindow) {
            return { text: fallbackWindow, selector: 'document-body-window' };
          }

          return null;
        }

        const targets = collectSameOriginDocs(document, 'top');
        const scoredTargets = targets.map((target) => {
          const signal = evaluateFeatureSignals(target.doc);
          const demographicsSection = getDemographicsSectionText(target.doc);
          return { target, signal, demographicsSection };
        });

        const officeVisitWithSection =
          scoredTargets.find(
            ({ target, demographicsSection }) =>
              /\/eClinic\/officevisit_Spec\.aspx/i.test(target.sourceUrl) &&
              demographicsSection != null,
          ) ?? null;

        const bestSectionBySignal =
          [...scoredTargets]
            .filter(({ demographicsSection }) => demographicsSection != null)
            .sort((left, right) => right.signal.score - left.signal.score)[0] ?? null;

        const markerMatchedWithSection =
          scoredTargets.find(
            ({ target, demographicsSection }) =>
              demographicsSection != null && hasDemographicsMarker(target.doc),
          ) ?? null;

        const highestSignalTarget =
          [...scoredTargets].sort((left, right) => right.signal.score - left.signal.score)[0] ?? null;
        const matchedWithSection = officeVisitWithSection ?? bestSectionBySignal ?? markerMatchedWithSection;
        const fallbackTarget = highestSignalTarget ?? scoredTargets[0] ?? null;
        if (!fallbackTarget) {
          return { ok: false, error: 'No accessible document/frame found' };
        }

        const selected = matchedWithSection ?? fallbackTarget;
        const fullPageHtml = selected.target.doc.documentElement?.outerHTML ?? '';
        if (!fullPageHtml) {
          return { ok: false, error: 'Could not read HTML from selected document/frame' };
        }
        const textPreview = selected.signal.normalizedText.slice(0, 800);
        const demographicsSection = selected.demographicsSection;
        const demographicsText = demographicsSection?.text ?? selected.signal.normalizedText;
        const demographicsSelector = demographicsSection?.selector ?? 'fallback:document-body-text';

        logContentDebug(message, 'html captured from document/frame', {
          htmlLength: fullPageHtml.length,
          sourceUrl: selected.target.sourceUrl,
          sourcePath: selected.target.path,
          totalDocsScanned: targets.length,
          officeVisitFrameDetected: officeVisitWithSection != null,
          markerMatched: markerMatchedWithSection != null,
          signalScore: selected.signal.score,
          matchedSignals: selected.signal.matched,
          missingSignals: selected.signal.missing,
          textPreview,
          demographicsSelector,
          demographicsTextLength: demographicsText.length,
          usedFallbackText: demographicsSection == null,
        });

        lastDemographicsSourceUrl = selected.target.sourceUrl;
        lastDemographicsSourcePath = selected.target.path;

        return {
          ok: true,
          data: {
            profileId: 'full-page',
            selectorMatched: demographicsSelector,
            demographicsText,
            sourceUrl: selected.target.sourceUrl,
            sourcePath: selected.target.path,
            signalSummary: {
              score: selected.signal.score,
              matched: selected.signal.matched,
              missing: selected.signal.missing,
            },
            textPreview,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to extract EMR demographics';
        return { ok: false, error: message };
      }
    }

    function dispatchInputEvents(target: HTMLElement): void {
      const view = target.ownerDocument?.defaultView;
      const eventCtor = view?.Event ?? Event;
      const keyboardCtor = view?.KeyboardEvent ?? KeyboardEvent;
      target.dispatchEvent(new eventCtor('input', { bubbles: true }));
      target.dispatchEvent(new eventCtor('change', { bubbles: true }));
      target.dispatchEvent(new keyboardCtor('keydown', { bubbles: true, key: 'a' }));
      target.dispatchEvent(new keyboardCtor('keyup', { bubbles: true, key: 'a' }));
      target.dispatchEvent(new eventCtor('blur', { bubbles: true }));
    }

    function setMultilineContent(target: HTMLElement, text: string): void {
      const normalized = text.replace(/\r\n/g, '\n').trim();
      target.textContent = normalized;
      dispatchInputEvents(target);
    }

    function closeGlobalTemplatePopup(doc: Document): void {
      const templatePopup = doc.getElementById('divGlobalTemplate');
      if (isElementNode(templatePopup)) {
        templatePopup.style.visibility = 'hidden';
        templatePopup.style.display = 'none';
      }
    }

    function markChiefComplaintModified(editorDoc: Document): void {
      const windowsToTry: Window[] = [];
      const editorWin = editorDoc.defaultView;
      if (editorWin) {
        windowsToTry.push(editorWin);
        try {
          if (editorWin.parent && editorWin.parent !== editorWin) windowsToTry.push(editorWin.parent);
        } catch {
          // ignore
        }
        try {
          if (editorWin.top && editorWin.top !== editorWin) windowsToTry.push(editorWin.top);
        } catch {
          // ignore
        }
      }

      for (const win of windowsToTry) {
        const stateWin = win as Window & {
          SetMenuModified?: (menuIndex: unknown, flagA: unknown, flagB: unknown) => unknown;
          Menu_ChiefComplaint?: unknown;
          chiefComplaint?: { modified?: unknown; loadAlready?: unknown };
        };
        try {
          if (typeof stateWin.SetMenuModified === 'function' && stateWin.Menu_ChiefComplaint != null) {
            stateWin.SetMenuModified(stateWin.Menu_ChiefComplaint, 0, 1);
          }
        } catch {
          // ignore
        }
        try {
          if (stateWin.chiefComplaint) {
            stateWin.chiefComplaint.modified = 1;
            stateWin.chiefComplaint.loadAlready = 1;
          }
        } catch {
          // ignore
        }
      }
    }

    function getWorkareaTokenFromPath(path: string): string | null {
      const matched = path.match(/workarea\d+/i);
      return matched?.[0]?.toLowerCase() ?? null;
    }

    function invokeInlineHandlerInPageContext(target: Element, inlineHandler: string): boolean {
      const doc = target.ownerDocument;
      if (!doc || !inlineHandler.trim()) {
        return false;
      }
      const host = doc.documentElement ?? doc.body;
      if (!host) {
        return false;
      }

      const marker = `fastdoc-save-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      target.setAttribute('data-fastdoc-save-marker', marker);
      const script = doc.createElement('script');
      script.textContent = `(() => {
  try {
    const el = document.querySelector('[data-fastdoc-save-marker="${marker}"]');
    if (!el) return;
    const code = el.getAttribute('onclick');
    if (!code) return;
    (new Function(code)).call(el);
  } catch (_) {
    // ignore
  }
})();`;
      try {
        host.appendChild(script);
        return true;
      } catch {
        return false;
      } finally {
        script.remove();
        target.removeAttribute('data-fastdoc-save-marker');
      }
    }

    function syncEmrChiefComplaintInCurrentDoc(
      payload: SyncChiefComplaintPayload | undefined,
      message?: RuntimeMessage,
    ): SyncChiefComplaintResponse {
      try {
        if (!payload) {
          return { ok: false, error: 'Missing sync payload' };
        }

        const doc = document;
        const demographics = doc.getElementById('PatientDemographics');
        const complaintSection = doc.getElementById('div_chiefcomplaint');

        // Hard-path for eClinic: same frame as demographics, update chief complaint view directly.
        let chiefView = doc.getElementById('div_chiefComplaint_view');
        if (!(chiefView instanceof HTMLElement) && complaintSection instanceof HTMLElement) {
          const innerContainer = complaintSection.querySelector('div');
          if (innerContainer instanceof HTMLElement) {
            const created = doc.createElement('div');
            created.id = 'div_chiefComplaint_view';
            innerContainer.appendChild(created);
            chiefView = created;
          }
        }
        if (!(chiefView instanceof HTMLElement) && complaintSection instanceof HTMLElement) {
          const created = doc.createElement('div');
          created.id = 'div_chiefComplaint_view';
          complaintSection.appendChild(created);
          chiefView = created;
        }

        let hpiView = doc.getElementById('div_presentIllness_view');
        if (!(hpiView instanceof HTMLElement) && complaintSection instanceof HTMLElement) {
          const historyLabel = Array.from(
            complaintSection.querySelectorAll('b, span, td, div'),
          ).find((node) => /history\s*of\s*present\s*illness/i.test(node.textContent ?? ''));
          if (historyLabel instanceof HTMLElement) {
            const created = doc.createElement('div');
            created.id = 'div_presentIllness_view';
            historyLabel.insertAdjacentElement('afterend', created);
            hpiView = created;
          }
        }

        if (!(chiefView instanceof HTMLElement)) {
          return {
            ok: false,
            error: `Chief complaint target not found in officevisit frame. url=${window.location.href}; hasDemographics=${demographics instanceof HTMLElement}; hasComplaintSection=${complaintSection instanceof HTMLElement}`,
          };
        }

        setMultilineContent(chiefView, payload.chiefComplaintText ?? '');
        if (hpiView instanceof HTMLElement && (payload.presentIllnessText ?? '').trim().length > 0) {
          setMultilineContent(hpiView, payload.presentIllnessText ?? '');
        }

        logContentDebug(message ?? { type: 'FD_SYNC_EMR_CHIEF_COMPLAINT', payload }, 'chief complaint synced in officevisit frame', {
          sourceUrl: window.location.href,
          hasDemographics: demographics instanceof HTMLElement,
          hasComplaintSection: complaintSection instanceof HTMLElement,
          chiefLength: (payload.chiefComplaintText ?? '').length,
          hpiLength: (payload.presentIllnessText ?? '').length,
        });
        return {
          ok: true,
          strategy: 'officevisit-current-doc',
          sourceUrl: window.location.href,
        };
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : 'Failed to sync EMR chief complaint in current doc';
        return { ok: false, error: messageText };
      }
    }

    async function syncEmrChiefComplaint(
      payload: SyncChiefComplaintPayload | undefined,
    ): Promise<SyncChiefComplaintResponse | null> {
      try {
        if (!payload) {
          return { ok: false, error: 'Missing sync payload' };
        }

        const profile = getActiveEmrProfile(window.location.hostname);
        const rootWindow = window.top ?? window;
        const initialTargets = mergeSearchTargets(
          collectSameOriginDocs(document, 'top-dom'),
          collectSameOriginDocsFromWindowTree(rootWindow, 'top-window'),
        );

        type SaveProbe = {
          sourceUrl: string;
          path: string;
          availableFns: string[];
          inlineOnclickFns: string[];
          saveNodes: string[];
        };

        const parseOnclickFns = (code: string): string[] => {
          const names = new Set<string>();
          const regex = /([A-Za-z_$][\w$]*)\s*\(/g;
          let match: RegExpExecArray | null = regex.exec(code);
          while (match != null) {
            names.add(match[1]);
            match = regex.exec(code);
          }
          return Array.from(names);
        };

        const collectSaveProbes = (targets: SearchTarget[]): SaveProbe[] => {
          const rankTarget = (target: SearchTarget): number => {
            const signal = `${target.sourceUrl} ${target.path}`.toLowerCase();
            if (signal.includes('ov_chiefcomplaint')) return 0;
            if (signal.includes('ov_doctor_spec')) return 1;
            if (signal.includes('officevisit_spec')) return 2;
            if (signal.includes('chiefcomplaint')) return 3;
            if (signal.includes('officevisit')) return 4;
            if (signal.includes('workarea1')) return 5;
            if (signal.includes('workarea')) return 6;
            return 10;
          };
          const prioritizedTargets = [...targets].sort((a, b) => rankTarget(a) - rankTarget(b));

          return prioritizedTargets.slice(0, 80).map((target) => {
            const win = target.doc.defaultView as
              | (Window & {
                  saveIt?: (...args: unknown[]) => unknown;
                  saveAction?: (...args: unknown[]) => unknown;
                  save?: (...args: unknown[]) => unknown;
                  Save?: (...args: unknown[]) => unknown;
                  SetMenuModified?: (...args: unknown[]) => unknown;
                  OfficeVisit?: { saveIt?: (...args: unknown[]) => unknown; saveAction?: (...args: unknown[]) => unknown };
                  chiefComplaint?: { saveIt?: (...args: unknown[]) => unknown; saveAction?: (...args: unknown[]) => unknown };
                })
              | null;
            const availableFns = [
              typeof win?.saveIt === 'function' ? 'saveIt' : null,
              typeof win?.saveAction === 'function' ? 'saveAction' : null,
              typeof win?.save === 'function' ? 'save' : null,
              typeof win?.Save === 'function' ? 'Save' : null,
              typeof win?.SetMenuModified === 'function' ? 'SetMenuModified' : null,
              typeof win?.OfficeVisit?.saveIt === 'function' ? 'OfficeVisit.saveIt' : null,
              typeof win?.OfficeVisit?.saveAction === 'function' ? 'OfficeVisit.saveAction' : null,
              typeof win?.chiefComplaint?.saveIt === 'function' ? 'chiefComplaint.saveIt' : null,
              typeof win?.chiefComplaint?.saveAction === 'function' ? 'chiefComplaint.saveAction' : null,
            ].filter((item): item is string => item != null);

            const saveNodes = Array.from(
              target.doc.querySelectorAll(
                'button, input[type="button"], input[type="submit"], a, div[onclick], span[onclick], td[onclick], [onclick], #SavePage, #btnSave, #btnsave',
              ),
            )
              .filter((node) => {
                const text = [
                  node.textContent ?? '',
                  (node as HTMLInputElement).value ?? '',
                  node.getAttribute('id') ?? '',
                  node.getAttribute('name') ?? '',
                  node.getAttribute('title') ?? '',
                  node.getAttribute('onclick') ?? '',
                ]
                  .join(' ')
                  .toLowerCase();
                return text.includes('save') || text.includes('saveit');
              })
              .slice(0, 8)
              .map((node) => {
                const onclick = (node.getAttribute('onclick') ?? '').replace(/\s+/g, ' ').slice(0, 120);
                return `${describeNode(node)}::onclick=${onclick}`;
              });

            const inlineOnclickFns = Array.from(
              new Set(
                Array.from(target.doc.querySelectorAll('[onclick]'))
                  .flatMap((node) => parseOnclickFns(node.getAttribute('onclick') ?? ''))
                  .filter((name) => /save|chief|complaint|menu/i.test(name)),
              ),
            ).slice(0, 10);

            return {
              sourceUrl: target.sourceUrl,
              path: target.path,
              availableFns,
              inlineOnclickFns,
              saveNodes,
            };
          });
        };

        const saveProbe = collectSaveProbes(initialTargets);
        logContentDebug(
          { type: 'FD_SYNC_EMR_CHIEF_COMPLAINT', payload },
          'save probe snapshot',
          {
            totalTargets: initialTargets.length,
            probes: saveProbe.slice(0, 12),
          },
        );

        function setFormLikeValue(
          target: HTMLElement,
          value: string,
          options?: { gentle?: boolean },
        ): void {
          const normalized = value.replace(/\r\n/g, '\n').trim();
          const gentle = options?.gentle === true;
          const normalizedHtml = normalized
            .split('\n')
            .map((line) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
            .join('<br>');

          const trySetRichEditorApiValue = (): boolean => {
            if (gentle) {
              return false;
            }
            const targetDoc = target.ownerDocument;
            const targetWin = targetDoc?.defaultView;
            const frameEl = (targetWin?.frameElement as Element | null) ?? null;
            const frameName = (frameEl?.getAttribute('name') ?? frameEl?.getAttribute('id') ?? '').trim();

            const candidateIds = new Set<string>();
            if (frameName) {
              candidateIds.add(frameName);
              candidateIds.add(frameName.replace(/_ifr$/i, ''));
            }
            const lowerHint = `${frameName} ${target.getAttribute('id') ?? ''} ${target.getAttribute('name') ?? ''}`.toLowerCase();
            if (lowerHint.includes('chief')) {
              candidateIds.add('chiefComplaint');
              candidateIds.add('txtChiefComplaint');
            }
            if (lowerHint.includes('present') || lowerHint.includes('illness') || lowerHint.includes('hpi')) {
              candidateIds.add('presentIllness');
              candidateIds.add('txtPresentIllness');
            }

            const windowsToTry: Window[] = [];
            if (targetWin) windowsToTry.push(targetWin);
            try {
              if (targetWin?.parent && targetWin.parent !== targetWin) windowsToTry.push(targetWin.parent);
            } catch {
              // ignore
            }
            try {
              if (targetWin?.top && targetWin.top !== targetWin) windowsToTry.push(targetWin.top);
            } catch {
              // ignore
            }

            let updated = false;
            for (const win of windowsToTry) {
              const w = win as Window & {
                tinyMCE?: { get?: (id: string) => { setContent?: (html: string) => void; save?: () => void; fire?: (event: string) => void } | null };
                tinymce?: { get?: (id: string) => { setContent?: (html: string) => void; save?: () => void; fire?: (event: string) => void } | null };
                CKEDITOR?: { instances?: Record<string, { setData?: (html: string) => void; updateElement?: () => void }> };
              };

              const tiny = w.tinyMCE ?? w.tinymce;
              if (tiny?.get) {
                for (const id of candidateIds) {
                  try {
                    const editor = tiny.get(id);
                    if (!editor || typeof editor.setContent !== 'function') continue;
                    editor.setContent(normalizedHtml);
                    editor.fire?.('change');
                    editor.save?.();
                    updated = true;
                  } catch {
                    // ignore
                  }
                }
              }

              const ckInstances = w.CKEDITOR?.instances;
              if (ckInstances) {
                for (const id of candidateIds) {
                  try {
                    const editor = ckInstances[id];
                    if (!editor || typeof editor.setData !== 'function') continue;
                    editor.setData(normalizedHtml);
                    editor.updateElement?.();
                    updated = true;
                  } catch {
                    // ignore
                  }
                }
              }
            }

            // Keep underlying textarea/input synchronized for submit-based save flows.
            const docsToTry: Document[] = [];
            if (targetDoc) docsToTry.push(targetDoc);
            try {
              const parentDoc = targetWin?.parent?.document;
              if (parentDoc && parentDoc !== targetDoc) docsToTry.push(parentDoc);
            } catch {
              // ignore
            }
            for (const doc of docsToTry) {
              for (const id of candidateIds) {
                const field = doc.getElementById(id);
                if (!isElementNode(field)) continue;
                const tag = field.tagName.toLowerCase();
                if (tag === 'textarea' || tag === 'input') {
                  (field as unknown as { value?: string }).value = normalized;
                  dispatchInputEvents(field);
                  updated = true;
                }
              }
            }

            return updated;
          };

          const tagName = target.tagName.toLowerCase();
          if (tagName === 'textarea' || tagName === 'input') {
            (target as unknown as { value?: string }).value = normalized;
            if (!gentle) {
              dispatchInputEvents(target);
            }
            return;
          }
          if (tagName === 'body' || tagName === 'html') {
            // Prefer editor APIs (tinyMCE/CKEditor) so EMR detects modified state on manual Save.
            trySetRichEditorApiValue();
            target.innerHTML = normalizedHtml;
            if (!gentle) {
              dispatchInputEvents(target);
            }
            return;
          }
          if ((target as { isContentEditable?: boolean }).isContentEditable) {
            target.textContent = normalized;
            if (!gentle) {
              dispatchInputEvents(target);
            }
            return;
          }
          target.textContent = normalized;
          if (!gentle) {
            dispatchInputEvents(target);
          }
        }

        function syncEditorBackFields(doc: Document, chiefText: string, hpiText: string): number {
          const fields = Array.from(doc.querySelectorAll('input, textarea')).filter((node) =>
            isElementNode(node),
          ) as HTMLElement[];

          const chiefNeedles = ['chief', 'complaint', 'reason', 'visit', 'cc'];
          const hpiNeedles = ['present', 'illness', 'hpi', 'history'];
          let updated = 0;

          for (const field of fields) {
            const key = [
              field.getAttribute('id') ?? '',
              field.getAttribute('name') ?? '',
              field.getAttribute('class') ?? '',
            ]
              .join(' ')
              .toLowerCase();
            if (!key) continue;

            const valueHolder = field as unknown as { value?: string };
            if (!('value' in valueHolder)) continue;

            if (chiefNeedles.some((needle) => key.includes(needle))) {
              valueHolder.value = chiefText;
              dispatchInputEvents(field);
              updated += 1;
              continue;
            }
            if (hpiNeedles.some((needle) => key.includes(needle))) {
              valueHolder.value = hpiText;
              dispatchInputEvents(field);
              updated += 1;
            }
          }

          return updated;
        }

        function describeNode(node: Element): string {
          const id = node.getAttribute('id') ?? '';
          const name = node.getAttribute('name') ?? '';
          const tag = node.tagName.toLowerCase();
          return `${tag}#${id}[name=${name}]`;
        }

        function isMdlandEclinicHost(hostname: string): boolean {
          const h = hostname.toLowerCase();
          return h.endsWith('.mdland.net') || h.endsWith('.mdland.com');
        }

        /**
         * MDLand eClinic: align with DocPro-style navigation (ov_doctor_spec → MenuFrame →
         * chiefComplaint iframe → chiefComplaint_ifr / presentIllness_ifr → #tinymce + replaceChildren).
         * Reference behavior observed in DocPro mdland_officevisit_spec.js (same-origin only).
         */
        async function tryMdlandDoctorSpecDocProChiefSync(
          targets: SearchTarget[],
          payload: SyncChiefComplaintPayload,
        ): Promise<SyncChiefComplaintResponse | null> {
          const logMsg: RuntimeMessage = { type: 'FD_SYNC_EMR_CHIEF_COMPLAINT', payload };
          const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

          const replaceTinyMceChildren = (el: HTMLElement | null, html: string): boolean => {
            if (!el) return false;
            const parsed = new DOMParser().parseFromString(html || '', 'text/html');
            el.replaceChildren(...parsed.body.childNodes);
            return true;
          };

          const plainTextToDocproHtml = (text: string): string => {
            const normalized = text.replace(/\r\n/g, '\n').trim();
            const inner = normalized
              .split('\n')
              .map((line) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
              .join('<br>');
            return `<div>${inner}</div>`;
          };

          const doctorSpecs = targets
            .filter((t) => /\/eClinic\/ov_doctor_spec\.aspx/i.test(t.sourceUrl))
            .sort((a, b) => {
              const wa = getWorkareaTokenFromPath(a.path);
              const wb = getWorkareaTokenFromPath(b.path);
              if (wa === 'workarea1' && wb !== 'workarea1') return -1;
              if (wb === 'workarea1' && wa !== 'workarea1') return 1;
              return 0;
            });

          logContentDebug(logMsg, 'mdland-docpro: start', {
            doctorSpecFrames: doctorSpecs.slice(0, 6).map((t) => ({ path: t.path, url: t.sourceUrl })),
            chiefLen: (payload.chiefComplaintText ?? '').length,
            hpiLen: (payload.presentIllnessText ?? '').length,
            autoSave: payload.autoSave === true,
          });

          if (doctorSpecs.length === 0) {
            logContentDebug(logMsg, 'mdland-docpro: abort — no ov_doctor_spec in merged targets');
            return null;
          }

          for (const spec of doctorSpecs) {
            const doc = spec.doc;
            const trace: string[] = [];

            try {
              let menuFrame: HTMLElement | null = null;
              for (let s = 0; s < 10; s += 1) {
                menuFrame = doc.getElementById('MenuFrame');
                if (isElementNode(menuFrame)) break;
                trace.push(`wait MenuFrame attempt=${s + 1}`);
                await sleep(200);
              }
              if (!isElementNode(menuFrame)) {
                logContentDebug(logMsg, 'mdland-docpro: frame skip — MenuFrame missing', {
                  path: spec.path,
                  trace,
                });
                continue;
              }

              const menuDoc =
                (menuFrame as HTMLIFrameElement).contentDocument ??
                (menuFrame as HTMLIFrameElement).contentWindow?.document ??
                null;
              if (!menuDoc) {
                logContentDebug(logMsg, 'mdland-docpro: frame skip — MenuFrame document inaccessible', {
                  path: spec.path,
                });
                continue;
              }

              const menuSpan = menuDoc.querySelector('#menu_span_chiefcomplaint');
              if (!isElementNode(menuSpan)) {
                logContentDebug(logMsg, 'mdland-docpro: frame skip — #menu_span_chiefcomplaint missing', {
                  path: spec.path,
                });
                continue;
              }

              (menuSpan as HTMLElement).click();
              trace.push('clicked #menu_span_chiefcomplaint');
              logContentDebug(logMsg, 'mdland-docpro: menu click', { path: spec.path, trace: [...trace] });
              await sleep(500);

              let chiefOuter: HTMLElement | null = null;
              for (let l = 0; l < 12; l += 1) {
                chiefOuter =
                  doc.getElementById('chiefComplaint') ??
                  (doc.querySelector(
                    'iframe#chiefComplaint, iframe[name="chiefComplaint"], frame#chiefComplaint, frame[name="chiefComplaint"]',
                  ) as HTMLElement | null);
                if (isElementNode(chiefOuter)) break;
                trace.push(`wait chiefComplaint iframe attempt=${l + 1}`);
                await sleep(200);
              }
              if (!isElementNode(chiefOuter)) {
                logContentDebug(logMsg, 'mdland-docpro: frame skip — chiefComplaint iframe missing', {
                  path: spec.path,
                  trace,
                });
                continue;
              }

              const chiefDoc =
                (chiefOuter as HTMLIFrameElement).contentDocument ??
                (chiefOuter as HTMLIFrameElement).contentWindow?.document ??
                null;
              if (!chiefDoc) {
                logContentDebug(logMsg, 'mdland-docpro: frame skip — chiefComplaint document inaccessible', {
                  path: spec.path,
                });
                continue;
              }
              trace.push('entered chiefComplaint iframe document');
              await sleep(400);

              const chiefText = (payload.chiefComplaintText ?? '').trim();
              if (chiefText.length > 0) {
                let innerFr: HTMLElement | null = null;
                for (let p = 0; p < 18; p += 1) {
                  innerFr = chiefDoc.getElementById('chiefComplaint_ifr');
                  if (isElementNode(innerFr)) break;
                  trace.push(`wait chiefComplaint_ifr attempt=${p + 1}`);
                  await sleep(200);
                }
                if (!isElementNode(innerFr)) {
                  logContentDebug(logMsg, 'mdland-docpro: frame skip — chiefComplaint_ifr missing', {
                    path: spec.path,
                    trace,
                  });
                  continue;
                }
                const innerDoc =
                  (innerFr as HTMLIFrameElement).contentDocument ??
                  (innerFr as HTMLIFrameElement).contentWindow?.document ??
                  null;
                if (!innerDoc) {
                  logContentDebug(logMsg, 'mdland-docpro: frame skip — chiefComplaint_ifr document inaccessible', {
                    path: spec.path,
                  });
                  continue;
                }
                await sleep(300);
                const chiefBold = chiefDoc.getElementById('chiefComplaint_bold');
                if (isElementNode(chiefBold)) {
                  chiefBold.click();
                  await sleep(80);
                  chiefBold.click();
                  trace.push('double-click chiefComplaint_bold');
                }
                const tiny = innerDoc.getElementById('tinymce');
                const html = plainTextToDocproHtml(chiefText);
                const wrote = replaceTinyMceChildren(tiny, html);
                trace.push(`chief tinymce write ok=${wrote} node=${tiny ? describeNode(tiny) : 'null'}`);
                try {
                  const tw = innerDoc.defaultView as Window & {
                    tinymce?: { triggerSave?: () => void; editors?: unknown[] };
                    tinyMCE?: { triggerSave?: () => void };
                  };
                  tw?.tinymce?.triggerSave?.();
                  tw?.tinyMCE?.triggerSave?.();
                } catch {
                  // ignore
                }
              }

              const hpiText = (payload.presentIllnessText ?? '').trim();
              if (hpiText.length > 0) {
                let hpiFr: HTMLElement | null = null;
                for (let m = 0; m < 14; m += 1) {
                  hpiFr = chiefDoc.getElementById('presentIllness_ifr');
                  if (isElementNode(hpiFr)) break;
                  trace.push(`wait presentIllness_ifr attempt=${m + 1}`);
                  await sleep(200);
                }
                if (isElementNode(hpiFr)) {
                  const hpiDoc =
                    (hpiFr as HTMLIFrameElement).contentDocument ??
                    (hpiFr as HTMLIFrameElement).contentWindow?.document ??
                    null;
                  if (hpiDoc) {
                    await sleep(300);
                    const hpiBold = chiefDoc.getElementById('presentIllness_bold');
                    if (isElementNode(hpiBold)) {
                      hpiBold.click();
                      await sleep(80);
                      hpiBold.click();
                      trace.push('double-click presentIllness_bold');
                    }
                    const tinyH = hpiDoc.getElementById('tinymce');
                    const htmlH = plainTextToDocproHtml(hpiText);
                    const wroteH = replaceTinyMceChildren(tinyH, htmlH);
                    trace.push(`hpi tinymce write ok=${wroteH} node=${tinyH ? describeNode(tinyH) : 'null'}`);
                    try {
                      const tw = hpiDoc.defaultView as Window & { tinymce?: { triggerSave?: () => void } };
                      tw?.tinymce?.triggerSave?.();
                    } catch {
                      // ignore
                    }
                  }
                }
              }

              logContentDebug(logMsg, 'mdland-docpro: writes complete', {
                path: spec.path,
                url: spec.sourceUrl,
                trace,
              });

              if (payload.autoSave === true) {
                await sleep(500);
                const proc = doc.querySelector('#procbarTDOfficeVisit');
                logContentDebug(logMsg, 'mdland-docpro: autoSave — procbarTDOfficeVisit first click', {
                  hasProc: !!proc,
                  path: spec.path,
                });
                (proc as HTMLElement | undefined)?.click?.();
                await sleep(500);
                const savePage = doc.querySelector('#SavePage');
                let saveVis = '';
                if (isElementNode(savePage) && doc.defaultView) {
                  saveVis = doc.defaultView.getComputedStyle(savePage).visibility;
                }
                logContentDebug(logMsg, 'mdland-docpro: autoSave — SavePage visibility', {
                  visibility: saveVis,
                  path: spec.path,
                });
                if (saveVis !== 'hidden') {
                  (doc.querySelector('#procbarTDOfficeVisit') as HTMLElement | undefined)?.click?.();
                  trace.push('second procbarTDOfficeVisit click (SavePage visible)');
                }
                logContentDebug(logMsg, 'mdland-docpro: autoSave sequence done', { path: spec.path, trace });
              }

              return {
                ok: true,
                strategy: 'mdland-docpro:ov_doctor_spec',
                sourceUrl: spec.sourceUrl,
                sourcePath: spec.path,
                note:
                  payload.autoSave === true
                    ? 'mdland docpro path: write + autoSave(procbar/SavePage guard)'
                    : 'mdland docpro path: write only (manual Save)',
                diagnostics: { trace },
              };
            } catch (err) {
              logContentDebug(logMsg, 'mdland-docpro: frame error', {
                path: spec.path,
                error: err instanceof Error ? err.message : String(err),
                trace,
              });
            }
          }

          logContentDebug(logMsg, 'mdland-docpro: all ov_doctor_spec attempts failed — falling back');
          return null;
        }

        function primeDocForSaveSubmit(doc: Document): void {
          const isPostBack = doc.getElementById('isPostBack');
          if (isElementNode(isPostBack)) {
            const holder = isPostBack as unknown as { value?: string };
            if ('value' in holder) {
              holder.value = 'PostBack';
            }
          }
          const saveToTemplate = doc.getElementById('SaveToGTemplate');
          if (isElementNode(saveToTemplate)) {
            const holder = saveToTemplate as unknown as { value?: string };
            if ('value' in holder && holder.value == null) {
              holder.value = '0';
            }
          }
          closeGlobalTemplatePopup(doc);
        }

        function flushChiefEditorState(editorDoc: Document): { flushed: number; traces: string[] } {
          const traces: string[] = [];
          let flushed = 0;
          const visited = new Set<Window>();
          const queue: Array<{ win: Window; hint: string }> = [];
          const startWin = editorDoc.defaultView;
          if (startWin) queue.push({ win: startWin, hint: 'flush:start' });

          while (queue.length > 0) {
            const current = queue.shift();
            if (!current) continue;
            if (visited.has(current.win)) continue;
            visited.add(current.win);

            const w = current.win as Window & {
              saveAction?: (...args: unknown[]) => unknown;
              OfficeVisit?: { saveAction?: (...args: unknown[]) => unknown };
              chiefComplaint?: { saveAction?: (...args: unknown[]) => unknown };
            };

            const flushFns: Array<{ name: string; fn?: (...args: unknown[]) => unknown }> = [
              { name: 'chiefComplaint.saveAction', fn: w.chiefComplaint?.saveAction },
              { name: 'OfficeVisit.saveAction', fn: w.OfficeVisit?.saveAction },
              { name: 'saveAction', fn: w.saveAction },
            ];
            for (const candidate of flushFns) {
              if (typeof candidate.fn !== 'function') continue;
              try {
                candidate.fn(true);
                flushed += 1;
                traces.push(`${current.hint}:${candidate.name}(true)`);
                continue;
              } catch {
                // ignore
              }
              try {
                candidate.fn(false);
                flushed += 1;
                traces.push(`${current.hint}:${candidate.name}(false)`);
                continue;
              } catch {
                // ignore
              }
              try {
                candidate.fn();
                flushed += 1;
                traces.push(`${current.hint}:${candidate.name}()`);
              } catch {
                // ignore
              }
            }

            try {
              primeDocForSaveSubmit(current.win.document);
            } catch {
              // ignore
            }

            try {
              if (current.win.parent && current.win.parent !== current.win && !visited.has(current.win.parent)) {
                queue.push({ win: current.win.parent, hint: `${current.hint}>parent` });
              }
            } catch {
              // ignore
            }
            try {
              if (current.win.top && current.win.top !== current.win && !visited.has(current.win.top)) {
                queue.push({ win: current.win.top, hint: `${current.hint}>top` });
              }
            } catch {
              // ignore
            }
          }

          return { flushed, traces };
        }

        function scoreEditorField(node: Element, keywordGroups: string[][], contextText = ''): number {
          const text = [
            node.getAttribute('id') ?? '',
            node.getAttribute('name') ?? '',
            node.getAttribute('class') ?? '',
            node.getAttribute('placeholder') ?? '',
            node.getAttribute('title') ?? '',
            node.textContent ?? '',
            contextText,
          ]
            .join(' ')
            .toLowerCase();

          let score = 0;
          for (const group of keywordGroups) {
            if (group.every((kw) => text.includes(kw))) {
              score += 5;
            }
          }
          const tagName = node.tagName.toLowerCase();
          if (tagName === 'textarea') score += 2;
          if (tagName === 'input' && (node as HTMLInputElement).type === 'text') score += 1;
          return score;
        }

        function triggerEditorSave(doc: Document): { triggered: boolean; strategy: string } {
          primeDocForSaveSubmit(doc);
          const baseWindow = doc.defaultView;
          const windowsToTry: Window[] = [];
          if (baseWindow) {
            windowsToTry.push(baseWindow);
            try {
              if (baseWindow.parent && baseWindow.parent !== baseWindow) windowsToTry.push(baseWindow.parent);
            } catch {
              // ignore parent access errors
            }
            try {
              if (baseWindow.top && baseWindow.top !== baseWindow) windowsToTry.push(baseWindow.top);
            } catch {
              // ignore top access errors
            }
          }

          for (const win of windowsToTry) {
            const w = win as Window & {
              saveAction?: (...args: unknown[]) => unknown;
              save?: (...args: unknown[]) => unknown;
              Save?: (...args: unknown[]) => unknown;
              saveIt?: (...args: unknown[]) => unknown;
            };
            const callCandidates: Array<{ name: string; fn?: (...args: unknown[]) => unknown }> = [
              { name: 'saveIt', fn: w.saveIt },
              { name: 'saveAction', fn: w.saveAction },
              { name: 'save', fn: w.save },
              { name: 'Save', fn: w.Save },
            ];

            for (const candidate of callCandidates) {
              if (typeof candidate.fn !== 'function') continue;
              try {
                candidate.fn(true);
                return { triggered: true, strategy: `function:${candidate.name}(true)` };
              } catch {
                // ignore and continue to next strategy
              }
              try {
                candidate.fn(false);
                return { triggered: true, strategy: `function:${candidate.name}(false)` };
              } catch {
                // ignore and continue to next strategy
              }
              try {
                candidate.fn();
                return { triggered: true, strategy: `function:${candidate.name}()` };
              } catch {
                // ignore and continue to next strategy
              }
            }
          }

          const clickCandidates = Array.from(
            doc.querySelectorAll(
              'button, input[type="button"], input[type="submit"], a, div[onclick], span[onclick], td[onclick], [onclick*="saveIt"], [id*="saveIt"], [name*="saveIt"], #SavePage',
            ),
          );
          const saveButton =
            clickCandidates.find((node) => {
              const id = (node.getAttribute('id') ?? '').toLowerCase();
              const text = [
                node.textContent ?? '',
                (node as HTMLInputElement).value ?? '',
                node.getAttribute('id') ?? '',
                node.getAttribute('name') ?? '',
                node.getAttribute('title') ?? '',
                node.getAttribute('onclick') ?? '',
              ]
                .join(' ')
                .toLowerCase();
              if (text.includes('saveit')) return true;
              return id === 'savepage';
            }) ?? null;

          if (isElementNode(saveButton)) {
            saveButton.click();
            return { triggered: true, strategy: `click:${describeNode(saveButton)}` };
          }

          return { triggered: false, strategy: 'none' };
        }

        function trySaveOnDoc(
          doc: Document,
          label: string,
        ): { triggered: boolean; strategy: string } {
          primeDocForSaveSubmit(doc);
          const win = doc.defaultView as
            | (Window & {
                saveAction?: (...args: unknown[]) => unknown;
                save?: (...args: unknown[]) => unknown;
                Save?: (...args: unknown[]) => unknown;
              saveIt?: (...args: unknown[]) => unknown;
              })
            | null;

          const callCandidates: Array<{ name: string; fn?: (...args: unknown[]) => unknown }> = [
            { name: 'saveIt', fn: win?.saveIt },
            { name: 'saveAction', fn: win?.saveAction },
            { name: 'save', fn: win?.save },
            { name: 'Save', fn: win?.Save },
          ];

          for (const candidate of callCandidates) {
            if (typeof candidate.fn !== 'function') continue;
            try {
              candidate.fn(true);
              return { triggered: true, strategy: `${label}:function:${candidate.name}(true)` };
            } catch {
              // ignore and continue
            }
            try {
              candidate.fn(false);
              return { triggered: true, strategy: `${label}:function:${candidate.name}(false)` };
            } catch {
              // ignore and continue
            }
            try {
              candidate.fn();
              return { triggered: true, strategy: `${label}:function:${candidate.name}()` };
            } catch {
              // ignore and continue
            }
          }

          const saveItChainResult = (() => {
            const baseWin = doc.defaultView as
              | (Window & { parent?: Window; top?: Window; saveIt?: (...args: unknown[]) => unknown })
              | null;
            if (!baseWin) return { triggered: false, strategy: `${label}:saveIt-chain-missed` };
            const windowsToTry: Array<{ win: Window; hint: string }> = [{ win: baseWin, hint: `${label}:self` }];
            try {
              if (baseWin.parent && baseWin.parent !== baseWin) {
                windowsToTry.push({ win: baseWin.parent, hint: `${label}:parent` });
              }
            } catch {
              // ignore
            }
            try {
              if (baseWin.top && baseWin.top !== baseWin) {
                windowsToTry.push({ win: baseWin.top, hint: `${label}:top` });
              }
            } catch {
              // ignore
            }

            for (const entry of windowsToTry) {
              const fn = (entry.win as Window & { saveIt?: (...args: unknown[]) => unknown }).saveIt;
              if (typeof fn !== 'function') continue;
              try {
                fn(true);
                return { triggered: true, strategy: `${entry.hint}:function:saveIt(true)` };
              } catch {
                // ignore
              }
              try {
                fn(false);
                return { triggered: true, strategy: `${entry.hint}:function:saveIt(false)` };
              } catch {
                // ignore
              }
              try {
                fn();
                return { triggered: true, strategy: `${entry.hint}:function:saveIt()` };
              } catch {
                // ignore
              }
            }
            return { triggered: false, strategy: `${label}:saveIt-chain-missed` };
          })();
          if (saveItChainResult.triggered) {
            return saveItChainResult;
          }

          const saveButton =
            Array.from(
              doc.querySelectorAll(
                'button, input[type="button"], input[type="submit"], a, div[onclick], span[onclick], td[onclick], [onclick*="saveIt"], [id*="saveIt"], [name*="saveIt"], #SavePage',
              ),
            ).find(
              (node) => {
                const id = (node.getAttribute('id') ?? '').toLowerCase();
                const text = [
                  node.textContent ?? '',
                  (node as HTMLInputElement).value ?? '',
                  node.getAttribute('id') ?? '',
                  node.getAttribute('name') ?? '',
                  node.getAttribute('title') ?? '',
                  node.getAttribute('onclick') ?? '',
                ]
                  .join(' ')
                  .toLowerCase();
                if (text.includes('saveit')) return true;
                return id === 'savepage';
              },
            ) ?? null;

          if (isElementNode(saveButton)) {
            const inlineHandler = saveButton.getAttribute('onclick') ?? '';
            if (/saveit\s*\(/i.test(inlineHandler)) {
              try {
                if (invokeInlineHandlerInPageContext(saveButton, inlineHandler)) {
                  return { triggered: true, strategy: `${label}:inline-onclick:saveIt(page-context)` };
                }
              } catch {
                // ignore and continue
              }
            }
            const domOnclick = (saveButton as unknown as { onclick?: ((this: HTMLElement, ev?: Event) => unknown) | null }).onclick;
            if (typeof domOnclick === 'function') {
              try {
                domOnclick.call(saveButton);
                return { triggered: true, strategy: `${label}:dom-onclick:${describeNode(saveButton)}` };
              } catch {
                // ignore and continue
              }
            }
            saveButton.click();
            return { triggered: true, strategy: `${label}:click:${describeNode(saveButton)}` };
          }

          return { triggered: false, strategy: `${label}:save action not found` };
        }

        function triggerSiblingOfficeVisitSave(
          editorDoc: Document,
        ): { triggered: boolean; strategy: string } {
          try {
            const editorWin = editorDoc.defaultView as
              | (Window & { parent?: Window & { document?: Document } })
              | null;
            const parentDoc = editorWin?.parent?.document;
            if (!parentDoc) return { triggered: false, strategy: 'sibling-officevisit:no-parent-doc' };

            const officeFrame = parentDoc.querySelector(
              'iframe[name="OfficeVisit"], frame[name="OfficeVisit"], iframe#OfficeVisit, frame#OfficeVisit',
            );
            if (!isElementNode(officeFrame)) {
              return { triggered: false, strategy: 'sibling-officevisit:not-found' };
            }

            const officeDoc = (officeFrame as HTMLIFrameElement).contentDocument;
            const officeWin = (officeFrame as HTMLIFrameElement).contentWindow as
              | (Window & {
                  saveIt?: (...args: unknown[]) => unknown;
                  saveAction?: (...args: unknown[]) => unknown;
                  save?: (...args: unknown[]) => unknown;
                  Save?: (...args: unknown[]) => unknown;
                })
              | null;
            if (!officeDoc || !officeWin) {
              return { triggered: false, strategy: 'sibling-officevisit:no-doc-window' };
            }

            const fnCandidates: Array<{ name: string; fn?: (...args: unknown[]) => unknown }> = [
              { name: 'saveIt', fn: officeWin.saveIt as ((...args: unknown[]) => unknown) | undefined },
              { name: 'saveAction', fn: officeWin.saveAction },
              { name: 'save', fn: officeWin.save },
              { name: 'Save', fn: officeWin.Save },
            ];
            for (const candidate of fnCandidates) {
              if (typeof candidate.fn !== 'function') continue;
              try {
                candidate.fn(true);
                return { triggered: true, strategy: `sibling-officevisit:${candidate.name}(true)` };
              } catch {
                // ignore
              }
              try {
                candidate.fn(false);
                return { triggered: true, strategy: `sibling-officevisit:${candidate.name}(false)` };
              } catch {
                // ignore
              }
              try {
                candidate.fn();
                return { triggered: true, strategy: `sibling-officevisit:${candidate.name}()` };
              } catch {
                // ignore
              }
            }

            const clickSaveResult = trySaveOnDoc(officeDoc, 'sibling-officevisit-doc');
            if (clickSaveResult.triggered) return clickSaveResult;
            return { triggered: false, strategy: clickSaveResult.strategy };
          } catch {
            return { triggered: false, strategy: 'sibling-officevisit:exception' };
          }
        }

        function trySaveOnWindowChain(
          startDoc: Document,
          label: string,
        ): { triggered: boolean; strategy: string } {
          const visited = new Set<Window>();
          const queue: Array<{ win: Window; hint: string }> = [];

          const startWin = startDoc.defaultView;
          if (startWin) queue.push({ win: startWin, hint: `${label}:start` });

          while (queue.length > 0) {
            const current = queue.shift();
            if (!current) continue;
            if (visited.has(current.win)) continue;
            visited.add(current.win);

            const currentWin = current.win as Window & {
              saveIt?: (...args: unknown[]) => unknown;
              saveAction?: (...args: unknown[]) => unknown;
              save?: (...args: unknown[]) => unknown;
              Save?: (...args: unknown[]) => unknown;
              OfficeVisit?: { saveAction?: (...args: unknown[]) => unknown; save?: (...args: unknown[]) => unknown };
              chiefComplaint?: { saveAction?: (...args: unknown[]) => unknown; save?: (...args: unknown[]) => unknown };
            };

            const fnCandidates: Array<{ name: string; fn?: (...args: unknown[]) => unknown }> = [
              { name: 'saveIt', fn: currentWin.saveIt },
              { name: 'saveAction', fn: currentWin.saveAction },
              { name: 'save', fn: currentWin.save },
              { name: 'Save', fn: currentWin.Save },
              { name: 'OfficeVisit.saveAction', fn: currentWin.OfficeVisit?.saveAction },
              { name: 'OfficeVisit.save', fn: currentWin.OfficeVisit?.save },
              { name: 'chiefComplaint.saveAction', fn: currentWin.chiefComplaint?.saveAction },
              { name: 'chiefComplaint.save', fn: currentWin.chiefComplaint?.save },
            ];

            for (const candidate of fnCandidates) {
              if (typeof candidate.fn !== 'function') continue;
              try {
                candidate.fn(true);
                return { triggered: true, strategy: `${current.hint}:${candidate.name}(true)` };
              } catch {
                // ignore
              }
              try {
                candidate.fn(false);
                return { triggered: true, strategy: `${current.hint}:${candidate.name}(false)` };
              } catch {
                // ignore
              }
              try {
                candidate.fn();
                return { triggered: true, strategy: `${current.hint}:${candidate.name}()` };
              } catch {
                // ignore
              }
            }

            const currentDoc = currentWin.document;
            primeDocForSaveSubmit(currentDoc);
            const directSaveButton =
              currentDoc.querySelector(
                '[onclick*="saveIt"], [id*="saveIt"], [name*="saveIt"], #btnSave, #btnsave, #SavePage',
              ) ?? null;
            if (isElementNode(directSaveButton)) {
              const id = (directSaveButton.getAttribute('id') ?? '').toLowerCase();
              const inlineHandler = directSaveButton.getAttribute('onclick') ?? '';
              if (/saveit\s*\(/i.test(inlineHandler)) {
                try {
                  if (invokeInlineHandlerInPageContext(directSaveButton, inlineHandler)) {
                    return { triggered: true, strategy: `${current.hint}:inline-onclick:saveIt(page-context)` };
                  }
                } catch {
                  // ignore and continue
                }
              }
              const domOnclick = (directSaveButton as unknown as {
                onclick?: ((this: HTMLElement, ev?: Event) => unknown) | null;
              }).onclick;
              if (typeof domOnclick === 'function') {
                try {
                  domOnclick.call(directSaveButton);
                  return {
                    triggered: true,
                    strategy: `${current.hint}:dom-onclick:${describeNode(directSaveButton)}`,
                  };
                } catch {
                  // ignore and continue
                }
              }
              try {
                directSaveButton.click();
                return { triggered: true, strategy: `${current.hint}:click:${describeNode(directSaveButton)}` };
              } catch {
                // ignore
              }
            }

            try {
              if (currentWin.parent && currentWin.parent !== currentWin && !visited.has(currentWin.parent)) {
                queue.push({ win: currentWin.parent, hint: `${current.hint}>parent` });
              }
            } catch {
              // ignore parent access issues
            }
            try {
              if (currentWin.top && currentWin.top !== currentWin && !visited.has(currentWin.top)) {
                queue.push({ win: currentWin.top, hint: `${current.hint}>top` });
              }
            } catch {
              // ignore top access issues
            }
          }

          return { triggered: false, strategy: `${label}:window-chain-save-missed` };
        }

        function triggerDoctorSpecSave(
          targets: SearchTarget[],
          editorDoc: Document,
          preferredWorkarea: string | null,
        ): { triggered: boolean; strategy: string } {
          const docsToTry: Array<{ doc: Document; label: string }> = [];

          const doctorSpecTargets = targets
            .filter((target) => /\/eClinic\/ov_doctor_spec\.aspx/i.test(target.sourceUrl))
            .sort((a, b) => {
              const aMatch = preferredWorkarea != null && getWorkareaTokenFromPath(a.path) === preferredWorkarea;
              const bMatch = preferredWorkarea != null && getWorkareaTokenFromPath(b.path) === preferredWorkarea;
              if (aMatch === bMatch) return 0;
              return aMatch ? -1 : 1;
            });
          for (const doctorSpecTarget of doctorSpecTargets) {
            docsToTry.push({ doc: doctorSpecTarget.doc, label: `ov_doctor_spec@${doctorSpecTarget.path}` });
          }

          const editorWin = editorDoc.defaultView as (Window & { parent?: Window; top?: Window }) | null;
          try {
            if (editorWin?.parent?.document) {
              docsToTry.push({ doc: editorWin.parent.document, label: 'editor-parent' });
            }
          } catch {
            // ignore cross-origin access
          }
          try {
            if (editorWin?.top?.document && editorWin.top.document !== editorWin?.parent?.document) {
              docsToTry.push({ doc: editorWin.top.document, label: 'editor-top' });
            }
          } catch {
            // ignore cross-origin access
          }

          for (const entry of docsToTry) {
            const result = trySaveOnDoc(entry.doc, entry.label);
            if (result.triggered) return result;
          }

          return { triggered: false, strategy: 'ov_doctor_spec save action not found' };
        }

        function collectSameOriginDocsFromDoc(rootDoc: Document, rootPath: string): Array<{ doc: Document; path: string }> {
          const docs: Array<{ doc: Document; path: string }> = [{ doc: rootDoc, path: rootPath }];
          const frames = rootDoc.querySelectorAll('iframe, frame');
          frames.forEach((frameEl, idx) => {
            try {
              const frame = frameEl as HTMLIFrameElement;
              const childDoc = frame.contentDocument;
              if (childDoc != null) {
                const name = frame.getAttribute('name') ?? frame.getAttribute('id') ?? `${idx}`;
                const childPath = `${rootPath}>${frameEl.tagName.toLowerCase()}[${name}]`;
                docs.push(...collectSameOriginDocsFromDoc(childDoc, childPath));
              }
            } catch {
              // Cross-origin frame; ignore and continue.
            }
          });
          return docs;
        }

        function getNamedEditorFrameBody(
          rootDoc: Document,
          frameName: string,
        ): { node: HTMLElement; path: string } | null {
          const frameEl = rootDoc.querySelector(
            `iframe[name="${frameName}"], iframe#${frameName}, frame[name="${frameName}"], frame#${frameName}`,
          );
          if (!isElementNode(frameEl)) {
            return null;
          }
          const frameTag = frameEl.tagName.toLowerCase();
          if (frameTag !== 'iframe' && frameTag !== 'frame') {
            return null;
          }

          try {
            const innerDoc = (frameEl as HTMLIFrameElement).contentDocument;
            if (!innerDoc) return null;
            const body = innerDoc.body;
            if (isElementNode(body)) {
              return { node: body, path: `${frameName}>body` };
            }
            const html = innerDoc.documentElement;
            if (isElementNode(html)) {
              return { node: html, path: `${frameName}>documentElement` };
            }
          } catch {
            return null;
          }

          return null;
        }

        if (isMdlandEclinicHost(window.location.hostname)) {
          const docProResult = await tryMdlandDoctorSpecDocProChiefSync(initialTargets, payload);
          if (docProResult != null) {
            return docProResult;
          }
        }

        const chiefEditorTarget =
          initialTargets.find((target) => /\/eClinic\/ov_ChiefComplaint\.aspx/i.test(target.sourceUrl)) ?? null;
        if (chiefEditorTarget) {
          const editorDoc = chiefEditorTarget.doc;
          closeGlobalTemplatePopup(editorDoc);
          const directChiefFrame = getNamedEditorFrameBody(editorDoc, 'chiefComplaint_ifr');
          const directHpiFrame = getNamedEditorFrameBody(editorDoc, 'presentIllness_ifr');
          const editorDocs = collectSameOriginDocsFromDoc(editorDoc, chiefEditorTarget.path);
          const writableCandidates = editorDocs.flatMap(({ doc, path }) => {
            const entries: Array<{ node: HTMLElement; path: string }> = [];

            if (isElementNode(doc.body)) {
              entries.push({ node: doc.body, path: `${path}>body` });
            }

            const queried = Array.from(
              doc.querySelectorAll(
                'textarea, input[type="text"], input:not([type]), [contenteditable], iframe, frame',
              ),
            )
              .map((node) => ({ node, path }))
              .filter(({ node }) => isElementNode(node))
              .map(({ node, path }) => ({ node: node as HTMLElement, path }));

            return [...entries, ...queried];
          });

          const writableElements: Array<{ node: HTMLElement; path: string }> = [];
          if (directChiefFrame) writableElements.push(directChiefFrame);
          if (directHpiFrame) writableElements.push(directHpiFrame);
          for (const candidate of writableCandidates) {
            const candidateTag = candidate.node.tagName.toLowerCase();
            if (candidateTag === 'iframe' || candidateTag === 'frame') {
              try {
                const innerDoc = (candidate.node as HTMLIFrameElement).contentDocument;
                const body = innerDoc?.body;
                if (isElementNode(body)) {
                  writableElements.push({ node: body, path: `${candidate.path}>iframe-body` });
                }
              } catch {
                // ignore
              }
              continue;
            }
            writableElements.push(candidate);
          }

          const chiefField =
            writableElements
              .map((node) => ({
                node: node.node,
                path: node.path,
                score:
                  scoreEditorField(
                    node.node,
                    [['chief'], ['complaint'], ['reason', 'visit']],
                    node.path,
                  ) +
                  (node.path.toLowerCase().includes('chiefcomplaint_ifr') ? 20 : 0) +
                  (node.path.toLowerCase().includes('chiefcomplaint') ? 8 : 0),
              }))
              .sort((a, b) => b.score - a.score)[0] ?? null;

          const hpiField =
            writableElements
              .map((node) => ({
                node: node.node,
                path: node.path,
                score:
                  scoreEditorField(
                    node.node,
                    [['present', 'illness'], ['hpi'], ['history', 'present']],
                    node.path,
                  ) +
                  (node.path.toLowerCase().includes('presentillness_ifr') ? 20 : 0) +
                  (node.path.toLowerCase().includes('presentillness') ? 8 : 0),
              }))
              .sort((a, b) => b.score - a.score)[0] ?? null;

          if (!isElementNode(chiefField?.node)) {
            return {
              ok: false,
              error: `Chief complaint editor frame found but writable field missing. editorUrl=${chiefEditorTarget.sourceUrl}; editorPath=${chiefEditorTarget.path}; editorDocs=${JSON.stringify(
                editorDocs.slice(0, 10).map((d) => d.path),
              )}; writableCandidates=${JSON.stringify(
                writableElements.slice(0, 12).map((entry) => `${entry.path}:${describeNode(entry.node)}`),
              )}`,
            };
          }

          logContentDebug(
            { type: 'FD_SYNC_EMR_CHIEF_COMPLAINT', payload },
            'chief editor fields resolved',
            {
              editorUrl: chiefEditorTarget.sourceUrl,
              editorPath: chiefEditorTarget.path,
              chiefField: `${chiefField.path}:${describeNode(chiefField.node)}`,
              hpiField:
                isElementNode(hpiField?.node)
                  ? `${hpiField.path}:${describeNode(hpiField.node)}`
                  : null,
              directChiefFrame: directChiefFrame ? `${directChiefFrame.path}:${describeNode(directChiefFrame.node)}` : null,
              directHpiFrame: directHpiFrame ? `${directHpiFrame.path}:${describeNode(directHpiFrame.node)}` : null,
              writableCandidates: writableElements
                .slice(0, 12)
                .map((entry) => `${entry.path}:${describeNode(entry.node)}`),
            },
          );

          const gentleWrite = payload.autoSave !== true;
          setFormLikeValue(chiefField.node, payload.chiefComplaintText ?? '', { gentle: gentleWrite });
          if (isElementNode(hpiField?.node) && (payload.presentIllnessText ?? '').trim().length > 0) {
            setFormLikeValue(hpiField.node, payload.presentIllnessText ?? '', { gentle: gentleWrite });
          }

          if (payload.autoSave !== true) {
            const editorWorkarea = getWorkareaTokenFromPath(chiefEditorTarget.path);
            const collectManualSaveDocs = (): SearchTarget[] => {
              const ranked = [...initialTargets]
                .filter((target) => {
                  if (editorWorkarea != null && getWorkareaTokenFromPath(target.path) !== editorWorkarea) {
                    return false;
                  }
                  const signal = `${target.sourceUrl} ${target.path}`.toLowerCase();
                  return (
                    signal.includes('ov_doctor_spec') ||
                    signal.includes('patient_spec') ||
                    signal.includes('clinic_main') ||
                    signal.includes('workarea') ||
                    signal.includes('chiefcomplaint')
                  );
                })
                .sort((a, b) => {
                  const score = (target: SearchTarget): number => {
                    const signal = `${target.sourceUrl} ${target.path}`.toLowerCase();
                    if (signal.includes('ov_doctor_spec')) return 0;
                    if (signal.includes('patient_spec')) return 1;
                    if (signal.includes('clinic_main')) return 2;
                    return 3;
                  };
                  return score(a) - score(b);
                });
              return ranked;
            };

            const probeSaveButtons = (
              targets: SearchTarget[],
            ): Array<{
              sourceUrl: string;
              path: string;
              matched: string[];
              disabled: boolean[];
              pointerEvents: string[];
              display: string[];
              visibility: string[];
            }> => {
              const snapshots: Array<{
                sourceUrl: string;
                path: string;
                matched: string[];
                disabled: boolean[];
                pointerEvents: string[];
                display: string[];
                visibility: string[];
              }> = [];

              for (const target of targets.slice(0, 10)) {
                try {
                  const nodes = Array.from(
                    target.doc.querySelectorAll(
                      '#SavePage, [onclick*="saveIt"], [id*="saveIt"], [name*="saveIt"], button, input[type="button"], input[type="submit"], a',
                    ),
                  ).filter((node) => {
                    const text = [
                      node.textContent ?? '',
                      (node as HTMLInputElement).value ?? '',
                      node.getAttribute('id') ?? '',
                      node.getAttribute('name') ?? '',
                      node.getAttribute('title') ?? '',
                      node.getAttribute('onclick') ?? '',
                    ]
                      .join(' ')
                      .toLowerCase();
                    return text.includes('save');
                  });
                  if (nodes.length === 0) continue;

                  const view = target.doc.defaultView;
                  const matched: string[] = [];
                  const disabled: boolean[] = [];
                  const pointerEvents: string[] = [];
                  const display: string[] = [];
                  const visibility: string[] = [];

                  for (const node of nodes.slice(0, 4)) {
                    if (!isElementNode(node)) continue;
                    matched.push(describeNode(node));
                    const htmlNode = node as HTMLElement & { disabled?: boolean };
                    disabled.push(Boolean(htmlNode.disabled));
                    const styles = view?.getComputedStyle ? view.getComputedStyle(node) : null;
                    pointerEvents.push(styles?.pointerEvents ?? node.style.pointerEvents ?? '');
                    display.push(styles?.display ?? node.style.display ?? '');
                    visibility.push(styles?.visibility ?? node.style.visibility ?? '');
                  }

                  snapshots.push({
                    sourceUrl: target.sourceUrl,
                    path: target.path,
                    matched,
                    disabled,
                    pointerEvents,
                    display,
                    visibility,
                  });
                } catch {
                  // ignore
                }
              }
              return snapshots;
            };

            const saveProbeBeforeUnlock = probeSaveButtons(collectManualSaveDocs());
            const saveProbeAfterUnlock = saveProbeBeforeUnlock;
            return {
              ok: true,
              strategy: 'editor-update-only',
              sourceUrl: chiefEditorTarget.sourceUrl,
              sourcePath: chiefEditorTarget.path,
              note: 'editor updated only, waiting manual save',
              diagnostics: {
                unlockedButtons: [],
                saveProbeBeforeUnlock,
                saveProbeAfterUnlock,
              },
            };
          }

          markChiefComplaintModified(editorDoc);

          let mirroredBackFields = 0;
          mirroredBackFields += syncEditorBackFields(
            editorDoc,
            payload.chiefComplaintText ?? '',
            payload.presentIllnessText ?? '',
          );
          for (const { doc } of editorDocs) {
            mirroredBackFields += syncEditorBackFields(
              doc,
              payload.chiefComplaintText ?? '',
              payload.presentIllnessText ?? '',
            );
          }

          const editorWorkarea = getWorkareaTokenFromPath(chiefEditorTarget.path);
          const getPrioritizedOfficeVisitTargets = (): SearchTarget[] => {
            const officeVisitCandidates = initialTargets.filter((target) =>
              /\/eClinic\/officevisit_Spec\.aspx/i.test(target.sourceUrl),
            );
            return [
              ...officeVisitCandidates.filter(
                (target) =>
                  editorWorkarea != null && getWorkareaTokenFromPath(target.path) === editorWorkarea,
              ),
              ...officeVisitCandidates.filter(
                (target) =>
                  editorWorkarea == null || getWorkareaTokenFromPath(target.path) !== editorWorkarea,
              ),
            ];
          };

          const mirrorToOfficeVisitDisplay = (): {
            mirrored: boolean;
            sourceUrl?: string;
            sourcePath?: string;
            editorWorkarea?: string | null;
          } => {
            const prioritizedOfficeVisits = getPrioritizedOfficeVisitTargets();

            for (const officeVisitTarget of prioritizedOfficeVisits) {
              const chiefFallback =
                ensureChiefByLabelInDoc(officeVisitTarget.doc) ??
                ensureChiefNearDemographicsInDoc(officeVisitTarget.doc) ??
                ensureChiefInDoc(officeVisitTarget.doc);
              const hpiFallback =
                ensureHpiByLabelInDoc(officeVisitTarget.doc) ??
                ensureHpiNearDemographicsInDoc(officeVisitTarget.doc) ??
                ensureHpiInDoc(officeVisitTarget.doc);

              if (!isElementNode(chiefFallback)) {
                continue;
              }

              const complaintSection = officeVisitTarget.doc.getElementById('div_chiefcomplaint');
              if (isElementNode(complaintSection)) {
                complaintSection.style.display = '';
                complaintSection.style.visibility = 'visible';
              }
              const button = officeVisitTarget.doc.getElementById('chiefcomplaintBut');
              const officeWin = officeVisitTarget.doc.defaultView as
                | (Window & { showMe2?: (obj: unknown, but: unknown, show: number) => void })
                | null;
              if (
                officeWin &&
                typeof officeWin.showMe2 === 'function' &&
                isElementNode(complaintSection) &&
                isElementNode(button)
              ) {
                try {
                  officeWin.showMe2(complaintSection, button, 1);
                } catch {
                  // ignore UI expand errors, content write still applies.
                }
              }

              setMultilineContent(chiefFallback, payload.chiefComplaintText ?? '');
              if (isElementNode(hpiFallback) && (payload.presentIllnessText ?? '').trim().length > 0) {
                setMultilineContent(hpiFallback, payload.presentIllnessText ?? '');
              }
              logContentDebug(
                { type: 'FD_SYNC_EMR_CHIEF_COMPLAINT', payload },
                'officevisit display nodes mirrored',
                {
                  editorUrl: chiefEditorTarget.sourceUrl,
                  editorPath: chiefEditorTarget.path,
                  editorWorkarea,
                  officeVisitUrl: officeVisitTarget.sourceUrl,
                  officeVisitPath: officeVisitTarget.path,
                },
              );
              return {
                mirrored: true,
                sourceUrl: officeVisitTarget.sourceUrl,
                sourcePath: officeVisitTarget.path,
                editorWorkarea,
              };
            }

            try {
              const editorWin = editorDoc.defaultView as
                | (Window & { parent?: Window & { document?: Document } })
                | null;
              const officeVisitFrame = editorWin?.parent?.document?.querySelector(
                'iframe[name="OfficeVisit"], frame[name="OfficeVisit"]',
              );
              if (isElementNode(officeVisitFrame)) {
                const officeDoc = (officeVisitFrame as HTMLIFrameElement).contentDocument;
                if (officeDoc) {
                  const chiefFallback =
                    ensureChiefByLabelInDoc(officeDoc) ??
                    ensureChiefNearDemographicsInDoc(officeDoc) ??
                    ensureChiefInDoc(officeDoc);
                  const hpiFallback =
                    ensureHpiByLabelInDoc(officeDoc) ??
                    ensureHpiNearDemographicsInDoc(officeDoc) ??
                    ensureHpiInDoc(officeDoc);
                  if (isElementNode(chiefFallback)) {
                    setMultilineContent(chiefFallback, payload.chiefComplaintText ?? '');
                    if (isElementNode(hpiFallback) && (payload.presentIllnessText ?? '').trim().length > 0) {
                      setMultilineContent(hpiFallback, payload.presentIllnessText ?? '');
                    }
                    return {
                      mirrored: true,
                      sourceUrl: officeDoc.location?.href ?? '',
                      sourcePath: `${chiefEditorTarget.path}>sibling[OfficeVisit]`,
                      editorWorkarea,
                    };
                  }
                }
              }
            } catch {
              // ignore fallback mirror errors
            }

            return { mirrored: false, editorWorkarea };
          };

          const persistOfficeVisitDirectly = (): { triggered: boolean; strategy: string } => {
            const prioritizedOfficeVisits = getPrioritizedOfficeVisitTargets();
            for (const officeVisitTarget of prioritizedOfficeVisits) {
              const doc = officeVisitTarget.doc;
              const win = doc.defaultView as
                | (Window & {
                    saveAction?: (...args: unknown[]) => unknown;
                    save?: (...args: unknown[]) => unknown;
                    Save?: (...args: unknown[]) => unknown;
                    OfficeVisit?: { saveAction?: (...args: unknown[]) => unknown };
                  })
                | null;
              if (!win) continue;

              markChiefComplaintModified(doc);
              primeDocForSaveSubmit(doc);

              const fnCandidates: Array<{ name: string; fn?: (...args: unknown[]) => unknown }> = [
                { name: 'OfficeVisit.saveAction', fn: win.OfficeVisit?.saveAction },
                { name: 'saveAction', fn: win.saveAction },
                { name: 'save', fn: win.save },
                { name: 'Save', fn: win.Save },
              ];
              for (const candidate of fnCandidates) {
                if (typeof candidate.fn !== 'function') continue;
                try {
                  candidate.fn(true);
                  return {
                    triggered: true,
                    strategy: `officevisit-direct@${officeVisitTarget.path}:function:${candidate.name}(true)`,
                  };
                } catch {
                  // ignore
                }
                try {
                  candidate.fn(false);
                  return {
                    triggered: true,
                    strategy: `officevisit-direct@${officeVisitTarget.path}:function:${candidate.name}(false)`,
                  };
                } catch {
                  // ignore
                }
                try {
                  candidate.fn();
                  return {
                    triggered: true,
                    strategy: `officevisit-direct@${officeVisitTarget.path}:function:${candidate.name}()`,
                  };
                } catch {
                  // ignore
                }
              }

              const form =
                doc.querySelector('form#Form1, form[name="Form1"], form[id="Form1"]') ??
                doc.querySelector('form');
              if (isElementNode(form) && form.tagName.toLowerCase() === 'form') {
                try {
                  (form as HTMLFormElement).requestSubmit();
                  return {
                    triggered: true,
                    strategy: `officevisit-direct@${officeVisitTarget.path}:form.requestSubmit`,
                  };
                } catch {
                  // ignore
                }
                try {
                  (form as HTMLFormElement).submit();
                  return {
                    triggered: true,
                    strategy: `officevisit-direct@${officeVisitTarget.path}:form.submit`,
                  };
                } catch {
                  // ignore
                }
              }
            }
            return { triggered: false, strategy: 'officevisit-direct:not-found' };
          };

          // Mirror once before save so current OfficeVisit pane shows immediate changes.
          const mirrorBeforeSave = mirrorToOfficeVisitDisplay();

          const flushResult = flushChiefEditorState(editorDoc);
          const preferredWorkarea = editorWorkarea;
          const officeVisitDirectSaveResult = persistOfficeVisitDirectly();
          const saveResult = triggerEditorSave(editorDoc);
          const doctorSpecSaveResult = triggerDoctorSpecSave(
            initialTargets,
            editorDoc,
            preferredWorkarea,
          );
          const siblingOfficeVisitSaveResult = triggerSiblingOfficeVisitSave(editorDoc);
          const windowChainSaveResult = trySaveOnWindowChain(editorDoc, 'editor-window-chain');
          const saveAttempts = [
            officeVisitDirectSaveResult,
            doctorSpecSaveResult,
            siblingOfficeVisitSaveResult,
            windowChainSaveResult,
            saveResult,
          ];
          const effectiveSaveResult =
            saveAttempts.find(
              (attempt) =>
                attempt.triggered &&
                (attempt.strategy.includes(':function:') ||
                  attempt.strategy.includes('inline-onclick') ||
                  attempt.strategy.includes('saveIt')),
            ) ??
            saveAttempts.find((attempt) => attempt.triggered) ??
            saveResult;

          // Mirror again after save in case UI or frame content got refreshed.
          const mirrorAfterSave = mirrorToOfficeVisitDisplay();
          closeGlobalTemplatePopup(editorDoc);
          const mirrorResult = mirrorAfterSave.mirrored ? mirrorAfterSave : mirrorBeforeSave;

          if (!effectiveSaveResult.triggered) {
            if (mirrorResult.mirrored) {
              return {
                ok: true,
                strategy: 'officevisit-fallback-display',
                sourceUrl: mirrorResult.sourceUrl,
                sourcePath: mirrorResult.sourcePath,
                note: `editorSaveFailed:${[
                  officeVisitDirectSaveResult.strategy,
                  doctorSpecSaveResult.strategy,
                  siblingOfficeVisitSaveResult.strategy,
                  windowChainSaveResult.strategy,
                  saveResult.strategy,
                ].join('|')}`,
              };
            }
            return {
              ok: false,
              error: `Chief complaint editor fields updated but save action not found. editorUrl=${chiefEditorTarget.sourceUrl}; tried=${[
                officeVisitDirectSaveResult.strategy,
                doctorSpecSaveResult.strategy,
                siblingOfficeVisitSaveResult.strategy,
                windowChainSaveResult.strategy,
                saveResult.strategy,
              ].join('|')}; probe=${JSON.stringify(
                saveProbe
                  .filter(
                    (item) =>
                      /ov_ChiefComplaint|ov_doctor_spec|officevisit_Spec/i.test(item.sourceUrl) ||
                      /chiefComplaint|OfficeVisit|workarea/i.test(item.path),
                  )
                  .slice(0, 8),
              )}`,
            };
          }

          logContentDebug(
            { type: 'FD_SYNC_EMR_CHIEF_COMPLAINT', payload },
            'chief editor updated and save triggered',
            {
              editorUrl: chiefEditorTarget.sourceUrl,
              editorPath: chiefEditorTarget.path,
              saveStrategy: effectiveSaveResult.strategy,
              flushedBeforeSave: flushResult,
              mirroredBackFields,
            },
          );
          return {
            ok: true,
            strategy: `editor-save:${effectiveSaveResult.strategy}`,
            sourceUrl: mirrorResult.sourceUrl ?? chiefEditorTarget.sourceUrl,
            sourcePath: mirrorResult.sourcePath ?? chiefEditorTarget.path,
            note: mirrorResult.mirrored ? 'officevisit display mirrored' : 'editor save only',
            diagnostics: saveProbe
              .filter(
                (item) =>
                  /ov_ChiefComplaint|ov_doctor_spec|officevisit_Spec/i.test(item.sourceUrl) ||
                  /chiefComplaint|OfficeVisit|workarea/i.test(item.path),
              )
              .slice(0, 8),
          };
        }

        function findChiefInDoc(doc: Document): HTMLElement | null {
          const bySelector = queryFirstElementInDoc(doc, profile.selectors.chiefComplaint);
          if (bySelector instanceof HTMLElement) {
            return bySelector;
          }

          const byLooseId =
            Array.from(doc.querySelectorAll('[id]')).find((node) => {
              if (!(node instanceof HTMLElement)) return false;
              const id = (node.getAttribute('id') ?? '').toLowerCase();
              if (!id) return false;
              return id.includes('chiefcomplaint') || id.includes('chief_complaint');
            }) ?? null;
          if (byLooseId instanceof HTMLElement) {
            return byLooseId;
          }

          // Fallback for slight DOM drift: find "Reason for Visit" label and the next content div.
          const reasonLabel = Array.from(doc.querySelectorAll('b, span, td, div')).find((node) =>
            /reason\s*for\s*visit/i.test(node.textContent ?? ''),
          );
          if (!(reasonLabel instanceof HTMLElement)) {
            return null;
          }

          let sibling = reasonLabel.nextElementSibling;
          while (sibling != null) {
            if (sibling instanceof HTMLElement && sibling.tagName.toLowerCase() === 'div') {
              return sibling;
            }
            sibling = sibling.nextElementSibling;
          }
          return null;
        }

        function findHpiInDoc(doc: Document): HTMLElement | null {
          const bySelector = queryFirstElementInDoc(doc, profile.selectors.presentIllness);
          if (bySelector instanceof HTMLElement) {
            return bySelector;
          }

          const byLooseId =
            Array.from(doc.querySelectorAll('[id]')).find((node) => {
              if (!(node instanceof HTMLElement)) return false;
              const id = (node.getAttribute('id') ?? '').toLowerCase();
              if (!id) return false;
              return id.includes('presentillness') || id.includes('present_illness');
            }) ?? null;
          if (byLooseId instanceof HTMLElement) {
            return byLooseId;
          }
          return null;
        }

        function ensureChiefInDoc(doc: Document): HTMLElement | null {
          const exactView = doc.getElementById('div_chiefComplaint_view');
          if (exactView instanceof HTMLElement) {
            return exactView;
          }

          const existing = findChiefInDoc(doc);
          if (existing instanceof HTMLElement) {
            return existing;
          }

          const complaintContainer = doc.getElementById('div_chiefcomplaint');
          if (complaintContainer instanceof HTMLElement) {
            const firstInnerDiv = complaintContainer.querySelector('div');
            if (firstInnerDiv instanceof HTMLElement) {
              const created = doc.createElement('div');
              created.id = 'div_chiefComplaint_view';
              firstInnerDiv.appendChild(created);
              return created;
            }

            const created = doc.createElement('div');
            created.id = 'div_chiefComplaint_view';
            complaintContainer.appendChild(created);
            return created;
          }

          const complaintTable = doc.getElementById('table_chiefcomplaint');
          if (complaintTable instanceof HTMLElement) {
            const created = doc.createElement('div');
            created.id = 'div_chiefComplaint_view';
            complaintTable.appendChild(created);
            return created;
          }

          const chiefHeader = Array.from(doc.querySelectorAll('b, td, span, div')).find((node) =>
            /chief complaint/i.test(node.textContent ?? ''),
          );
          if (!(chiefHeader instanceof HTMLElement)) {
            return null;
          }

          const host =
            chiefHeader.closest('#chiefcomplaint, #div_chiefcomplaint, #table_chiefcomplaint, table, div') ??
            chiefHeader.parentElement;
          if (!(host instanceof HTMLElement)) {
            return null;
          }

          const created = doc.createElement('div');
          created.id = 'div_chiefComplaint_view';
          host.appendChild(created);
          return created;
        }

        function ensureHpiInDoc(doc: Document): HTMLElement | null {
          const existing = findHpiInDoc(doc);
          if (existing instanceof HTMLElement) {
            return existing;
          }

          const historyLabel = Array.from(doc.querySelectorAll('b, span, td, div')).find((node) =>
            /history\s*of\s*present\s*illness/i.test(node.textContent ?? ''),
          );
          if (!(historyLabel instanceof HTMLElement)) {
            return null;
          }

          let sibling = historyLabel.nextElementSibling;
          while (sibling != null) {
            if (sibling instanceof HTMLElement && sibling.tagName.toLowerCase() === 'div') {
              return sibling;
            }
            sibling = sibling.nextElementSibling;
          }

          const host = historyLabel.parentElement;
          if (!(host instanceof HTMLElement)) {
            return null;
          }

          const created = doc.createElement('div');
          created.id = 'div_presentIllness_view';
          host.appendChild(created);
          return created;
        }

        function ensureChiefNearDemographicsInDoc(doc: Document): HTMLElement | null {
          const demographicsRoot = doc.getElementById('PatientDemographics');
          if (!(demographicsRoot instanceof HTMLElement)) {
            return null;
          }

          const direct = ensureChiefInDoc(doc);
          if (direct instanceof HTMLElement) {
            return direct;
          }

          const demographicsSection =
            demographicsRoot.closest('#patientinfo, #table_patientinfo, table, div') ?? demographicsRoot.parentElement;
          if (!(demographicsSection instanceof HTMLElement)) {
            return null;
          }

          let cursor: Element | null = demographicsSection;
          for (let idx = 0; idx < 8 && cursor != null; idx += 1) {
            cursor = cursor.nextElementSibling;
            if (!(cursor instanceof HTMLElement)) {
              continue;
            }

            const sectionText = (cursor.textContent ?? '').toLowerCase();
            const mentionsChief = sectionText.includes('chief complaint') || sectionText.includes('reason for visit');
            const chiefById = cursor.querySelector('#div_chiefComplaint_view, #div_chiefcomplaint_view');
            if (chiefById instanceof HTMLElement) {
              return chiefById;
            }

            if (mentionsChief) {
              const complaintHost =
                cursor.querySelector('#div_chiefcomplaint, #table_chiefcomplaint, #chiefcomplaint') ?? cursor;
              if (complaintHost instanceof HTMLElement) {
                const created = doc.createElement('div');
                created.id = 'div_chiefComplaint_view';
                complaintHost.appendChild(created);
                return created;
              }
            }
          }

          return null;
        }

        function ensureHpiNearDemographicsInDoc(doc: Document): HTMLElement | null {
          const direct = ensureHpiInDoc(doc);
          if (direct instanceof HTMLElement) {
            return direct;
          }

          const demographicsRoot = doc.getElementById('PatientDemographics');
          if (!(demographicsRoot instanceof HTMLElement)) {
            return null;
          }

          const demographicsSection =
            demographicsRoot.closest('#patientinfo, #table_patientinfo, table, div') ?? demographicsRoot.parentElement;
          if (!(demographicsSection instanceof HTMLElement)) {
            return null;
          }

          let cursor: Element | null = demographicsSection;
          for (let idx = 0; idx < 8 && cursor != null; idx += 1) {
            cursor = cursor.nextElementSibling;
            if (!(cursor instanceof HTMLElement)) {
              continue;
            }

            const hpiById = cursor.querySelector('#div_presentIllness_view, #div_presentillness_view');
            if (hpiById instanceof HTMLElement) {
              return hpiById;
            }
          }

          return null;
        }

        function findAnchorElementByText(doc: Document, pattern: RegExp): HTMLElement | null {
          const body = doc.body;
          if (!(body instanceof HTMLElement)) return null;

          const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
          let current: Node | null = walker.nextNode();
          while (current != null) {
            const raw = current.textContent ?? '';
            const normalized = raw.replace(/\s+/g, ' ').trim();
            if (normalized && pattern.test(normalized)) {
              const parent = current.parentElement;
              if (parent instanceof HTMLElement) {
                return parent;
              }
            }
            current = walker.nextNode();
          }
          return null;
        }

        function ensureChiefByLabelInDoc(doc: Document): HTMLElement | null {
          const existing = doc.getElementById('div_chiefComplaint_view');
          if (existing instanceof HTMLElement) {
            return existing;
          }

          const anchor = findAnchorElementByText(doc, /reason\s*for\s*visit\s*:?/i);
          if (!(anchor instanceof HTMLElement)) {
            return null;
          }

          let sibling = anchor.nextElementSibling;
          while (sibling != null) {
            if (sibling instanceof HTMLElement && sibling.tagName.toLowerCase() === 'div') {
              return sibling;
            }
            sibling = sibling.nextElementSibling;
          }

          const created = doc.createElement('div');
          created.id = 'div_chiefComplaint_view';
          anchor.insertAdjacentElement('afterend', created);
          return created;
        }

        function ensureHpiByLabelInDoc(doc: Document): HTMLElement | null {
          const existing = doc.getElementById('div_presentIllness_view');
          if (existing instanceof HTMLElement) {
            return existing;
          }

          const anchor = findAnchorElementByText(doc, /history\s*of\s*present\s*illness\s*:?/i);
          if (!(anchor instanceof HTMLElement)) {
            return null;
          }

          let sibling = anchor.nextElementSibling;
          while (sibling != null) {
            if (sibling instanceof HTMLElement && sibling.tagName.toLowerCase() === 'div') {
              return sibling;
            }
            sibling = sibling.nextElementSibling;
          }

          const created = doc.createElement('div');
          created.id = 'div_presentIllness_view';
          anchor.insertAdjacentElement('afterend', created);
          return created;
        }

        const targets = mergeSearchTargets(
          collectSameOriginDocs(document, 'top-dom'),
          collectSameOriginDocsFromWindowTree(rootWindow, 'top-window'),
        );
        const targetSnapshots = targets.slice(0, 12).map((t) => ({
          sourceUrl: t.sourceUrl,
          path: t.path,
        }));

        const officeVisitTarget =
          targets.find((target) => /\/eClinic\/officevisit_Spec\.aspx/i.test(target.sourceUrl)) ?? null;
        const officeVisitDiag =
          officeVisitTarget == null
            ? null
            : {
                sourceUrl: officeVisitTarget.sourceUrl,
                path: officeVisitTarget.path,
                readyState: officeVisitTarget.doc.readyState,
                hasBody: officeVisitTarget.doc.body != null,
                htmlLength: officeVisitTarget.doc.documentElement?.outerHTML?.length ?? 0,
                textLength: (officeVisitTarget.doc.body?.innerText ?? '').replace(/\s+/g, ' ').trim().length,
              };

        type ChiefProbe = {
          sourceUrl: string;
          path: string;
          hasDemographics: boolean;
          hasChiefSection: boolean;
          hasChiefView: boolean;
          hasHpiView: boolean;
          hasReasonLabel: boolean;
          hasChiefLabel: boolean;
          score: number;
        };

        function probeChiefNode(target: SearchTarget): ChiefProbe {
          const doc = target.doc;
          const hasDemographics = doc.getElementById('PatientDemographics') instanceof HTMLElement;
          const hasChiefSection =
            doc.getElementById('div_chiefcomplaint') instanceof HTMLElement ||
            doc.getElementById('table_chiefcomplaint') instanceof HTMLElement;
          const hasChiefView = doc.getElementById('div_chiefComplaint_view') instanceof HTMLElement;
          const hasHpiView = doc.getElementById('div_presentIllness_view') instanceof HTMLElement;
          const bodyText = (doc.body?.innerText ?? '').replace(/\s+/g, ' ');
          const hasReasonLabel = /reason\s*for\s*visit/i.test(bodyText);
          const hasChiefLabel = /chief complaint/i.test(bodyText);
          const isOfficeVisit = /\/eClinic\/officevisit_Spec\.aspx/i.test(target.sourceUrl);
          const isLastDemographicsDoc =
            lastDemographicsSourceUrl != null &&
            target.sourceUrl === lastDemographicsSourceUrl &&
            (lastDemographicsSourcePath == null || target.path === lastDemographicsSourcePath);
          const score =
            (isLastDemographicsDoc ? 10 : 0) +
            (isOfficeVisit ? 6 : 0) +
            (hasDemographics ? 5 : 0) +
            (hasChiefSection ? 4 : 0) +
            (hasChiefView ? 4 : 0) +
            (hasHpiView ? 2 : 0) +
            (hasReasonLabel ? 2 : 0) +
            (hasChiefLabel ? 1 : 0);

          return {
            sourceUrl: target.sourceUrl,
            path: target.path,
            hasDemographics,
            hasChiefSection,
            hasChiefView,
            hasHpiView,
            hasReasonLabel,
            hasChiefLabel,
            score,
          };
        }

        const chiefProbes = targets.map((target) => probeChiefNode(target)).sort((a, b) => b.score - a.score);
        const bestProbe = chiefProbes[0] ?? null;

        type ResolvedTarget = {
          target: SearchTarget;
          chiefEl: HTMLElement;
          hpiEl: HTMLElement | null;
        };

        function resolveWritableNodes(target: SearchTarget): ResolvedTarget | null {
          const chief =
            ensureChiefByLabelInDoc(target.doc) ??
            ensureChiefNearDemographicsInDoc(target.doc) ??
            ensureChiefInDoc(target.doc);
          if (!(chief instanceof HTMLElement)) {
            return null;
          }
          const hpi =
            ensureHpiByLabelInDoc(target.doc) ??
            ensureHpiNearDemographicsInDoc(target.doc) ??
            ensureHpiInDoc(target.doc);
          return { target, chiefEl: chief, hpiEl: hpi instanceof HTMLElement ? hpi : null };
        }

        let resolvedTarget: ResolvedTarget | null = null;
        for (const probe of chiefProbes) {
          const candidate = targets.find(
            (target) => target.sourceUrl === probe.sourceUrl && target.path === probe.path,
          );
          if (!candidate) continue;
          const resolved = resolveWritableNodes(candidate);
          if (resolved != null) {
            resolvedTarget = resolved;
            break;
          }
        }

        logContentDebug(
          { type: 'FD_SYNC_EMR_CHIEF_COMPLAINT', payload },
          'chief node probe results',
          {
            totalTargets: targets.length,
            sampleTargets: targetSnapshots,
            bestProbe,
            topProbes: chiefProbes.slice(0, 8),
            resolvedTarget:
              resolvedTarget == null
                ? null
                : { sourceUrl: resolvedTarget.target.sourceUrl, path: resolvedTarget.target.path },
            officeVisitDiag,
          },
        );

        if (targets.length === 0) {
          return { ok: false, error: 'No accessible document/frame found for sync' };
        }

        if (resolvedTarget == null) {
          logContentDebug(
            { type: 'FD_SYNC_EMR_CHIEF_COMPLAINT', payload },
            'chief complaint target not found',
            {
              totalTargets: targets.length,
              sampleTargets: targetSnapshots,
              topProbes: chiefProbes.slice(0, 8),
              officeVisitDiag,
            },
          );
          return {
            ok: false,
            error: `Chief complaint section not found in any accessible frame for profile "${profile.id}". officeVisitDiag=${JSON.stringify(officeVisitDiag)}. probes=${JSON.stringify(chiefProbes.slice(0, 8))}. scanned=${JSON.stringify(targetSnapshots)}`,
          };
        }

        const matchedTarget = resolvedTarget.target;
        const chiefEl = resolvedTarget.chiefEl;
        const hpiEl = resolvedTarget.hpiEl;

        logContentDebug(
          { type: 'FD_SYNC_EMR_CHIEF_COMPLAINT', payload },
          'chief node matched before sync',
          {
            sourceUrl: matchedTarget.sourceUrl,
            sourcePath: matchedTarget.path,
            chiefNodeId: chiefEl.id,
            chiefNodeTag: chiefEl.tagName,
            chiefNodePreview: chiefEl.outerHTML.slice(0, 300),
          },
        );

        setMultilineContent(chiefEl, payload.chiefComplaintText ?? '');
        if (hpiEl instanceof HTMLElement && (payload.presentIllnessText ?? '').trim().length > 0) {
          setMultilineContent(hpiEl, payload.presentIllnessText ?? '');
        }
        logContentDebug(
          { type: 'FD_SYNC_EMR_CHIEF_COMPLAINT', payload },
          'chief complaint synced into frame',
          {
            sourceUrl: matchedTarget.sourceUrl,
            sourcePath: matchedTarget.path,
            chiefLength: (payload.chiefComplaintText ?? '').length,
            hpiLength: (payload.presentIllnessText ?? '').length,
            hpiPatched: hpiEl instanceof HTMLElement && (payload.presentIllnessText ?? '').trim().length > 0,
          },
        );
        return {
          ok: true,
          strategy: 'generic-frame-sync',
          sourceUrl: matchedTarget.sourceUrl,
          sourcePath: matchedTarget.path,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to sync EMR chief complaint';
        return { ok: false, error: message };
      }
    }

    browser.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
      logContentDebug(message, 'runtime message received', { type: message?.type });
      if (message?.type === 'FD_EXTRACT_ACTIVE_PAGE') {
        sendResponse(extractActivePage());
        return true;
      }

      if (message?.type === 'FD_EXTRACT_EMR_DEMOGRAPHICS') {
        // Avoid multi-frame response race: only top frame responds.
        if (window !== window.top) {
          return undefined;
        }
        const result = extractEmrDemographics(message);
        sendResponse(result);
        return true;
      }

      if (message?.type === 'FD_SYNC_EMR_CHIEF_COMPLAINT') {
        // Keep one responder to avoid races; top frame will traverse/write into child frames.
        if (window !== window.top) {
          return undefined;
        }
        void (async () => {
          const result = await syncEmrChiefComplaint(message.payload);
          if (result == null) {
            sendResponse({ ok: false, error: 'Sync handler returned no result' });
            return;
          }
          sendResponse(result);
        })();
        return true;
      }

      return undefined;
    });
  },
});
