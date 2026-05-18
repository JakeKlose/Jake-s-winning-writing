// Service worker — minimal glue for the side panel and the Gmail content script.

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.error('[winning-writing] sidePanel setup:', e));
});

// Side panel asks for the currently-active compose draft; we route the request
// to the content script in the active tab and relay the response back.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'get-compose-text') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) {
        sendResponse({ ok: false, error: 'No active tab.' });
        return;
      }
      if (!/^https:\/\/mail\.google\.com\//.test(tab.url || '')) {
        sendResponse({ ok: false, error: 'Active tab is not Gmail.' });
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: 'get-compose-text' }, (resp) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse(resp || { ok: false, error: 'No response from content script.' });
        }
      });
    });
    return true; // async response
  }
});
