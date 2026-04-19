export default defineBackground(() => {
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  type SyncChiefComplaintPayload = {
    chiefComplaintText: string;
    presentIllnessText: string;
  };

  type RuntimeMessage = {
    type?: string;
    payload?: { debug?: boolean; requestId?: string } | (SyncChiefComplaintPayload & { debug?: boolean; requestId?: string });
  };

  type RelayTarget = {
    contentType:
      | 'FD_EXTRACT_ACTIVE_PAGE'
      | 'FD_EXTRACT_EMR_DEMOGRAPHICS'
      | 'FD_SYNC_EMR_CHIEF_COMPLAINT';
    payload?: RuntimeMessage['payload'];
  };

  function isRestrictedTabUrl(url: string): boolean {
    return /^(about:|chrome:|edge:|brave:|vivaldi:|opera:|moz-extension:|chrome-extension:|extension:)/i.test(
      url,
    );
  }

  function getRelayTarget(message: RuntimeMessage): RelayTarget | null {
    if (message.type === 'FD_SCRAPE_ACTIVE_TAB') {
      return { contentType: 'FD_EXTRACT_ACTIVE_PAGE' };
    }

    if (message.type === 'FD_EXTRACT_EMR_DEMOGRAPHICS') {
      return {
        contentType: 'FD_EXTRACT_EMR_DEMOGRAPHICS',
        payload: message.payload,
      };
    }

    if (message.type === 'FD_SYNC_EMR_CHIEF_COMPLAINT') {
      return {
        contentType: 'FD_SYNC_EMR_CHIEF_COMPLAINT',
        payload: message.payload,
      };
    }

    return null;
  }

  function logBridgeDebug(message: RuntimeMessage, stage: string, details?: unknown): void {
    if (!message.payload?.debug) {
      return;
    }

    const requestId = message.payload.requestId ?? 'n/a';
    const prefix = `[FastDoc][background][${requestId}]`;
    if (details === undefined) {
      console.log(`${prefix} ${stage}`);
    } else {
      console.log(`${prefix} ${stage}`, details);
    }
  }

  browser.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    logBridgeDebug(message, 'runtime message received', {
      type: message.type,
      hasPayload: message.payload != null,
    });

    const relayTarget = getRelayTarget(message);
    if (!relayTarget) {
      logBridgeDebug(message, 'ignored message (not relay target)');
      return undefined;
    }

    void (async () => {
      try {
        const [focusedTab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
        const [currentWindowTab] = await browser.tabs.query({ active: true, currentWindow: true });
        const activeTab = focusedTab ?? currentWindowTab;
        logBridgeDebug(message, 'active tab resolved', {
          id: activeTab?.id,
          url: activeTab?.url,
        });

        if (!activeTab?.id) {
          sendResponse({ ok: false, error: 'No active tab found' });
          return;
        }

        const activeUrl = activeTab.url;
        if (typeof activeUrl === 'string' && activeUrl.length > 0 && isRestrictedTabUrl(activeUrl)) {
          sendResponse({
            ok: false,
            error: 'Active tab is a browser/internal page. Please switch to the MDLand tab and try again.',
          });
          return;
        }

        const response = await browser.tabs.sendMessage(activeTab.id, {
          type: relayTarget.contentType,
          payload: relayTarget.payload,
        });
        logBridgeDebug(message, 'content script response received', response);

        if (!response || typeof response !== 'object') {
          sendResponse({ ok: false, error: 'Invalid response from content script' });
          return;
        }

        sendResponse(response);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to message active tab';
        logBridgeDebug(message, 'relay failed with exception', { errorMessage, error });
        if (typeof errorMessage === 'string' && /receiving end does not exist|could not establish connection/i.test(errorMessage)) {
          sendResponse({
            ok: false,
            error: 'Could not reach page script. Please focus a loaded MDLand eClinic tab and try again.',
          });
          return;
        }

        sendResponse({ ok: false, error: errorMessage });
      }
    })();

    // Keep the message channel open for async sendResponse.
    return true;
  });
});
