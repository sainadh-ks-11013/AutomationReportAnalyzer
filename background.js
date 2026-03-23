/**
 * Background Service Worker for Automation Failure Intelligence
 * Handles cross-origin API requests that content scripts cannot make due to CORS
 */

// Silent fetch wrapper that doesn't throw errors
async function silentFetch(url, options = {}) {
  try {
    const response = await fetch(url, options);
    return response;
  } catch (e) {
    // Silently return null for network failures (expected for cross-origin)
    return null;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Forward analysisComplete message to close popup
  if (request.action === 'analysisComplete') {
    // Forward to all extension views (including popup)
    chrome.runtime.sendMessage(request).catch(() => {
      // Popup might already be closed, that's fine
    });
    return false;
  }
  
  if (request.action === 'fetchHistoryData') {
    fetchHistoryData(request.testCaseId, request.apiPatterns)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep the message channel open for async response
  }
  
  if (request.action === 'fetchUrl' || request.type === 'fetchUrl') {
    const url = request.url;
    silentFetch(url, {
      credentials: 'include',
      headers: { 'Accept': 'text/html,application/json,*/*' }
    })
      .then(async response => {
        if (!response || !response.ok) {
          sendResponse({ success: false, error: response ? `HTTP ${response.status}` : 'Network unavailable' });
          return;
        }
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          sendResponse({ success: true, data });
        } else {
          // Return HTML/text content (for DOM analysis)
          const html = await response.text();
          sendResponse({ success: true, data: { html }, isHtml: true });
        }
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  // ============================================
  // AI API Call Handler (Option 2 - AI Video Analysis)
  // ============================================
  if (request.type === 'aiApiCall') {
    const { provider, endpoint, headers, payload } = request;
    
    console.log('AFI Background: AI API Call to', provider, endpoint);
    
    fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    })
      .then(async response => {
        if (!response.ok) {
          const errorText = await response.text();
          console.error('AFI Background: AI API Error:', response.status, errorText);
          sendResponse({ 
            success: false, 
            error: `API Error ${response.status}: ${errorText.substring(0, 200)}` 
          });
          return;
        }
        const data = await response.json();
        console.log('AFI Background: AI API Response received');
        sendResponse({ success: true, data });
      })
      .catch(error => {
        console.error('AFI Background: AI API Fetch Error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }
});

async function fetchHistoryData(testCaseId, customPatterns = []) {
  // API patterns to try for Aalam history data
  const apiPatterns = customPatterns.length > 0 ? customPatterns : [
    `https://aalam-legacy.csez.zohocorpin.com/Qap/api/history/${testCaseId}?belongsTo=finalStatus`,
    `https://aalam-legacy.csez.zohocorpin.com/Qap/api/testcase/${testCaseId}/history`,
    `https://aalam-legacy.csez.zohocorpin.com/Qap/rest/history/testcaseid/${testCaseId}`,
    `https://aalam-legacy.csez.zohocorpin.com/Qap/rest/testcase/history?id=${testCaseId}&belongsTo=finalStatus`,
    `https://aalam-legacy.csez.zohocorpin.com/getTestCaseHistory?testCaseId=${testCaseId}`,
    `https://aalam-legacy.csez.zohocorpin.com/Qap/getHistory/${testCaseId}`,
    `https://aalam-legacy.csez.zohocorpin.com/api/history/${testCaseId}`,
    `https://aalam-legacy.csez.zohocorpin.com/Qap/api/executions?testCaseId=${testCaseId}`,
    `https://aalam-legacy.csez.zohocorpin.com/Qap/api/v1/testcases/${testCaseId}/executions`,
  ];

  for (const apiUrl of apiPatterns) {
    console.log('AFI Background: Trying API URL:', apiUrl);
    const response = await silentFetch(apiUrl, {
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
    
    if (response && response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          const data = await response.json();
          console.log('AFI Background: Got data from:', apiUrl, data);
          return { source: apiUrl, data };
        } catch (e) {
          // JSON parse error, continue to next
        }
      }
    }
  }
  
  // If no JSON API works, try fetching the HTML page
  const htmlUrl = `https://aalam-legacy.csez.zohocorpin.com/Qap/#/history/testcaseid/${testCaseId}?belongsTo=finalStatus&automationType=default&repository=ZOHOCRM`;
  console.log('AFI Background: Trying HTML page:', htmlUrl);
  const response = await silentFetch(htmlUrl, { credentials: 'include' });
  if (response && response.ok) {
    try {
      const html = await response.text();
      return { source: 'html', html };
    } catch (e) {
      // Text read error
    }
  }
  
  return null;
}

console.log('AFI Background Service Worker loaded');
