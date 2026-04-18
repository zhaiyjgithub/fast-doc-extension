export function dispatchInputEvents(target: HTMLElement): void {
  const view = target.ownerDocument?.defaultView;
  const eventCtor = view?.Event ?? Event;
  const keyboardCtor = view?.KeyboardEvent ?? KeyboardEvent;
  target.dispatchEvent(new eventCtor('input', { bubbles: true }));
  target.dispatchEvent(new eventCtor('change', { bubbles: true }));
  target.dispatchEvent(new keyboardCtor('keydown', { bubbles: true, key: 'a' }));
  target.dispatchEvent(new keyboardCtor('keyup', { bubbles: true, key: 'a' }));
  target.dispatchEvent(new eventCtor('blur', { bubbles: true }));
}

export function setMultilineContent(target: HTMLElement, text: string): void {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  target.textContent = normalized;
  dispatchInputEvents(target);
}

export function closeGlobalTemplatePopup(doc: Document): void {
  const templatePopup = doc.getElementById('divGlobalTemplate');
  if (templatePopup instanceof HTMLElement) {
    templatePopup.style.visibility = 'hidden';
    templatePopup.style.display = 'none';
  }
}

export function markChiefComplaintModified(editorDoc: Document): void {
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

export function invokeInlineHandlerInPageContext(target: Element, inlineHandler: string): boolean {
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
