/**
 * Popup Script for Automation Failure Intelligence v2.0
 */

document.addEventListener('DOMContentLoaded', function() {
  const statusCard = document.getElementById('statusCard');
  const statusIcon = document.getElementById('statusIcon');
  const statusText = document.getElementById('statusText');
  const analyzeBtn = document.getElementById('analyzeBtn');

  // Listen for analysis completion message to auto-close popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'analysisComplete') {
      console.log('Analysis complete, closing popup');
      window.close();
    }
  });

  // Check if we're on a valid page
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    const url = tabs[0]?.url || '';
    
    if (url.includes('zohocorpin.com') && 
        (url.includes('AutomationReports') || url.includes('reportsnew') || url.includes('Qap'))) {
      statusIcon.textContent = '';
      statusText.textContent = 'Report page detected! Click Analyze Page to start.';
      statusCard.classList.add('success');
    } else if (url.includes('zohocorpin.com')) {
      statusIcon.textContent = '';
      statusText.textContent = 'Navigate to an automation report page to see analysis.';
      statusCard.classList.add('info');
    } else {
      statusIcon.textContent = '';
      statusText.textContent = 'Open a Zoho automation report page';
      statusCard.classList.add('warning');
    }
  });

  // Analyze button click
  analyzeBtn.addEventListener('click', function() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: triggerAnalysis
      });
      
      statusIcon.textContent = '';
      statusText.textContent = 'Analyzing...';
      
      // Show completion message briefly, then auto-close popup
      setTimeout(() => {
        statusIcon.textContent = '';
        statusText.textContent = 'Analysis complete! Closing...';
        
        // Auto-close popup after showing completion message
        setTimeout(() => {
          window.close();
        }, 500);
      }, 2500); // Wait for analysis to complete (content script takes ~2s)
    });
  });
});

// Function to inject and trigger analysis
function triggerAnalysis() {
  if (window.AFI && typeof window.AFI.analyze === 'function') {
    window.AFI.analyze();
    console.log('Analysis triggered via AFI API');
  } else {
    console.log('AFI not loaded - reloading page may help');
  }
}