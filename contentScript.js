/**
 * Automation Failure Intelligence v3.0
 * Deep analysis with Case History comparison & Full Report
 */

(function() {
  'use strict';

  console.log("🔍 Automation Failure Intelligence v3.0 loaded");

  // ============================================
  // CONFIGURATION
  // ============================================

  const CONFIG = {
    panelId: 'afi-analysis-panel',
    debugMode: true,
    // ============================================
    // OPTION 2: AI API INTEGRATION SETTINGS
    // ============================================
    // AI API is now ENABLED by default!
    // To set your API key, run this in browser console:
    //   localStorage.setItem('afi_ai_api_key', 'your-api-key')
    // Or use the UI in the Deep Analysis report
    aiApi: {
      enabled: true,  // AI API is now enabled!
      provider: 'claude', // 'claude' | 'openai' | 'gemini'
      apiKeyStorageKey: 'afi_ai_api_key',
      // API Endpoints
      endpoints: {
        claude: 'https://api.anthropic.com/v1/messages',
        openai: 'https://api.openai.com/v1/chat/completions',
        gemini: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent'
      },
      // Vision-capable models
      models: {
        claude: 'claude-sonnet-4-20250514',
        openai: 'gpt-4-vision-preview',
        gemini: 'gemini-pro-vision'
      },
      // Max tokens for response
      maxTokens: 4096
    }
  };

  // ============================================
  // HELPER: Set API Key from Console
  // ============================================
  // Usage: AFI.setApiKey('your-api-key')
  window.AFI_setApiKey = function(key) {
    localStorage.setItem('afi_ai_api_key', key);
    console.log('✅ AFI: API key saved successfully!');
    console.log('💡 Tip: Open Deep Analysis and use "🤖 Auto AI Analysis" button');
  };

  // ============================================
  // AI VIDEO ANALYSIS API FUNCTIONS (Option 2)
  // ============================================

  /**
   * Get stored AI API key
   */
  function getAIApiKey() {
    return localStorage.getItem(CONFIG.aiApi.apiKeyStorageKey);
  }

  /**
   * Store AI API key
   */
  function setAIApiKey(key) {
    localStorage.setItem(CONFIG.aiApi.apiKeyStorageKey, key);
  }

  /**
   * Check if AI API is configured and ready
   */
  function isAIApiReady() {
    return CONFIG.aiApi.enabled && !!getAIApiKey();
  }

  /**
   * Call AI Vision API to analyze videos
   * This requires the background script to make the API call (CORS)
   * 
   * @param {Object} context - Test context with video URLs
   * @returns {Promise<Object>} AI analysis result
   */
  async function analyzeVideosWithAI(context) {
    if (!isAIApiReady()) {
      throw new Error('AI API not configured. Set CONFIG.aiApi.enabled = true and store API key.');
    }

    const provider = CONFIG.aiApi.provider;
    const apiKey = getAIApiKey();
    const endpoint = CONFIG.aiApi.endpoints[provider];
    const model = CONFIG.aiApi.models[provider];

    // Build the prompt for the AI
    const prompt = buildAIAnalysisPrompt(context);

    // Different payload structure for each provider
    let payload;
    let headers;

    switch (provider) {
      case 'claude':
        headers = {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        };
        payload = {
          model: model,
          max_tokens: CONFIG.aiApi.maxTokens,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              // Note: Claude expects image URLs or base64 images
              // For video analysis, we'd need to extract frames first
              ...(context.failureVideoLink ? [{
                type: 'text', 
                text: `\n\n[FAILURE VIDEO URL: ${context.failureVideoLink}]`
              }] : []),
              ...(context.idealVideoLink ? [{
                type: 'text',
                text: `\n\n[IDEAL VIDEO URL: ${context.idealVideoLink}]`
              }] : [])
            ]
          }]
        };
        break;

      case 'openai':
        headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        };
        payload = {
          model: model,
          max_tokens: CONFIG.aiApi.maxTokens,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              // OpenAI Vision can accept URLs directly for images
              // For videos, manual frame extraction would be needed
            ]
          }]
        };
        break;

      case 'gemini':
        headers = {
          'Content-Type': 'application/json'
        };
        // Gemini uses different structure
        payload = {
          contents: [{
            parts: [
              { text: prompt }
            ]
          }],
          generationConfig: {
            maxOutputTokens: CONFIG.aiApi.maxTokens
          }
        };
        // API key goes in URL for Gemini
        break;
    }

    // Send request through background script to avoid CORS
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'aiApiCall',
        provider: provider,
        endpoint: provider === 'gemini' ? `${endpoint}?key=${apiKey}` : endpoint,
        headers: headers,
        payload: payload
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (response && response.success) {
          resolve(parseAIResponse(provider, response.data));
        } else {
          reject(new Error(response?.error || 'AI API call failed'));
        }
      });
    });
  }

  /**
   * Build prompt for AI video analysis
   */
  function buildAIAnalysisPrompt(context) {
    return `You are an expert QA automation engineer analyzing test execution videos.

TEST CASE: ${context.caseName}
FAILURE TEXT: ${context.failureText || 'Not provided'}
REASON: ${context.reasonText || 'Not provided'}
DESCRIPTION: ${context.caseDescription || 'Not provided'}

INITIAL VERDICT: ${context.initialVerdict} (${context.confidence}% confidence)

FAILURE VIDEO: ${context.failureVideoLink || 'Not available'}
IDEAL VIDEO: ${context.idealVideoLink || 'Not available'}

Please analyze and determine:
1. Is this an AUTOMATION_ISSUE or PRODUCT_ISSUE?
2. Where exactly does the failure video diverge from the ideal?
3. What is the root cause?
4. What specific action should be taken?

IMPORTANT - Look for these PRODUCT_ISSUE indicators in the video:
- Red/colored loading bar or progress indicator at the top of the page that stays visible (page stuck loading)
- ERROR BANNERS at the top of the page showing messages like:
  * "Sorry, something went wrong. Please try again later."
  * "Something went wrong"
  * "Oops! Something went wrong"
  * Any error message with a close (X) button
- Error alerts/popups appearing during user actions
- Blank/white screens or partially loaded pages
- Error modals or freeze layers
- Spinning loaders that never complete
- Page not responding or hung state
- Any error messages displayed in UI

CRITICAL - ERROR BANNER DETECTION:
- If an error banner/toast appears at the TOP of the page with messages like "Sorry, something went wrong. Please try again later."
- This is a PRODUCT_ISSUE - "UI Alert/Modal Error" 
- The error banner indicates the product encountered an unexpected error during the operation

CRITICAL - BLANK PAGE DETECTION:
- If user copies a link (e.g., calendar booking link, shared link, embed URL) and opens it in a new browser/tab
- And the page shows BLANK/WHITE/EMPTY content with no actual page content loading
- This is a PRODUCT_ISSUE - "Blank Page / Link Not Loading"
- The shared/copied link should render the expected content but shows nothing

CRITICAL - SYNC/INTEGRATION ERROR DETECTION:
- If the UI shows status messages like "Problem in sync initiation", "Sync failed", "Integration error"
- Or any status field showing error/problem state for sync or integration features
- This is a PRODUCT_ISSUE - "Sync/Integration Error"
- The integration between systems failed to complete properly

CRITICAL - ACTION-TRIGGERED LOADING STUCK:
- If user clicks a button (Create, Save, Submit, etc.) and the page/modal gets stuck loading
- Example flow: User opens a feature (e.g., Canvas Detail View) → Clicks "Create" button → Modal shows → Clicks "Create" → Page keeps loading forever
- If you see the page spinning/loading indefinitely after clicking Create, Save, Submit or similar action buttons
- This is a PRODUCT_ISSUE - "Page Loading/Performance Issue"
- The action triggered but never completed, leaving the page in a stuck state

If you see a RED LOADING BAR or PROGRESS INDICATOR visible at the top of the browser/page that indicates the page is still loading or stuck, this is a PRODUCT_ISSUE (Page Loading/Performance Issue).

If the page shows BLANK/WHITE after navigating to a copied or shared link, this is a PRODUCT_ISSUE (Blank Page / Shared Link Not Loading).

If you see sync/integration STATUS showing errors like "Problem in sync initiation", this is a PRODUCT_ISSUE (Sync/Integration Error).

If clicking Create/Save/Submit button causes the page or modal to keep loading indefinitely without completing, this is a PRODUCT_ISSUE (Page Loading/Performance Issue).

Respond in JSON format:
{
  "verdict": "AUTOMATION_ISSUE" | "PRODUCT_ISSUE" | "NEEDS_REVIEW",
  "confidence": 0-100,
  "category": "category of the issue (e.g., Page Loading/Performance Issue, Blank Page / Link Not Loading, Sync/Integration Error, Functionality Error, Element Locator Issue)",
  "divergencePoint": "description of where videos differ",
  "rootCause": "explanation of the cause",
  "evidence": ["observation1", "observation2"],
  "recommendation": "specific action to take",
  "loadingBarDetected": true | false,
  "errorAlertDetected": true | false,
  "blankPageDetected": true | false,
  "syncErrorDetected": true | false,
  "actionLoadingStuck": true | false
}`;
  }

  /**
   * Parse response from different AI providers
   */
  function parseAIResponse(provider, data) {
    try {
      let text;
      switch (provider) {
        case 'claude':
          text = data.content?.[0]?.text || '';
          break;
        case 'openai':
          text = data.choices?.[0]?.message?.content || '';
          break;
        case 'gemini':
          text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          break;
      }

      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // Return raw text if JSON parsing fails
      return { rawResponse: text };
    } catch (e) {
      console.error('AFI: Failed to parse AI response:', e);
      return { error: 'Failed to parse response', raw: data };
    }
  }

  // ============================================
  // PAGE DETECTION
  // ============================================

  function isReportPage() {
    const url = window.location.href;
    return url.includes("AutomationReports") || 
           url.includes("reportsnew") || 
           url.includes("Qap");
  }

  if (!isReportPage()) {
    console.log("📋 Not a report page - skipping analysis");
    return;
  }

  // ============================================
  // FAILURE PATTERNS DATABASE
  // ============================================

  const AUTOMATION_PATTERNS = {
    elementIssues: {
      patterns: [
        "NoSuchElementException",
        "StaleElementReferenceException",
        "ElementNotInteractableException",
        "ElementClickInterceptedException",
        "element is not present",
        "element is not visible",
        "element is not clickable",
        "element not found",
        "Failed to locate element",
        "Element not Available",
        "Absence Of:",
        "not present after \\d+ seconds"
      ],
      category: "Element Locator Issue",
      suggestion: "Check if element locator is correct or add explicit wait"
    },
    timingIssues: {
      patterns: [
        "TimeoutException",
        "not available after waiting",
        "after waiting \\d+ seconds",
        "Expected condition failed",
        "Timed out waiting"
      ],
      category: "Timing/Wait Issue",
      suggestion: "Increase wait time or use dynamic waits"
    },
    overlayIssues: {
      patterns: [
        "another element.*obscures it",
        // Specific automation overlay issues - NOT generic modal/overlay
        "is not clickable at point.*because another element",
        "element.*covered by",
        "element.*blocked by.*other element",
        "click intercepted.*overlay",
        "modal.*blocking.*element",  // Element blocked BY modal (automation needs to handle)
        "overlay.*blocking.*click"    // Overlay blocking click (automation needs to handle)
      ],
      category: "Blocked by Overlay/Popup",
      suggestion: "Handle popup/overlay before interaction"
    },
    setupIssues: {
      patterns: [
        "not configured properly",
        "configuration has started",
        "syncing",
        "precondition",
        "setup failed",
        "DUPLICATE_DATA",
        "already exists",
        // Test data dependency issues
        "associated with other",
        "asscoiated with other",
        "cannot be removed as",
        "can not be removed as",
        "account specific issue",
        "org specific issue",
        "user specific issue",
        // Time slot test issues
        "slot is not found",
        "slots are not found"
      ],
      category: "Test Setup/Data Issue",
      suggestion: "Check test preconditions and data setup"
    },
    // Validation errors - automation provided invalid/empty input
    inputValidationIssues: {
      patterns: [
        "cannot be empty",
        "can't be empty",
        "is required",
        "field is required",
        "this field is required",
        "please enter",
        "please fill",
        "must not be empty",
        "should not be empty",
        "is mandatory",
        "required field",
        "enter a value",
        "enter valid",
        "invalid input",
        "input is invalid",
        "value is required",
        "Name cannot be empty",
        "field cannot be blank",
        "cannot be blank",
        // Special characters / invalid input patterns
        "do not use special characters",
        "special characters not allowed",
        "special characters are not allowed",
        "invalid characters",
        "only alphanumeric",
        "only alphabetic",
        "alphanumeric characters only",
        "no special characters",
        "contains invalid characters",
        "please do not use special characters"
      ],
      category: "Input Validation Error",
      suggestion: "Automation provided invalid test data - check input values"
    },
    // Invalid test data scenarios
    invalidTestDataIssues: {
      patterns: [
        "Validating.*special characters",
        "special characters.*validation",
        "max characters.*validation",
        "Validating.*max characters",
        "character limit",
        "invalid URL",
        "invalid email",
        "invalid phone",
        "invalid format",
        // More validation test patterns
        "invalid domain",
        "Invalid domain name",
        "invalid key",
        "key is invalid",
        "Import.*key.*invalid",
        "duplicate.*symbol",
        "duplicate.*currency",
        "already exists",
        "Please check the domain",
        "check the domain name"
      ],
      category: "Invalid Test Data",
      suggestion: "Test uses intentionally invalid input - expected validation behavior"
    },
    assertionIssues: {
      patterns: [
        "AssertionError",
        "field value is mismatched",
        "expectedAndFoundAreDifferent",
        "Expected.*but found",
        "UnExpected values are found"
      ],
      category: "Assertion Mismatch",
      suggestion: "Verify expected behavior - could be test or product issue"
    }
  };

  const PRODUCT_PATTERNS = {
    serverErrors: {
      patterns: [
        "500 Internal Server Error",
        "502 Bad Gateway",
        "503 Service Unavailable",
        "504 Gateway Timeout",
        "Server Error",
        "ServiceUnavailable"
      ],
      category: "Server/Backend Error",
      severity: "HIGH"
    },
    appExceptions: {
      patterns: [
        "NullPointerException",
        "ArrayIndexOutOfBoundsException",
        "ClassCastException",
        "IllegalStateException",
        "RuntimeException",
        "Exception in thread"
      ],
      category: "Application Exception",
      severity: "HIGH"
    },
    apiErrors: {
      patterns: [
        "API responded with error",
        "API failure",
        "status.*40[0-9]",
        "status.*50[0-9]",
        "Request failed",
        "Failed to fetch"
      ],
      category: "API Error",
      severity: "MEDIUM"
    },
    dbErrors: {
      patterns: [
        "Database error",
        "SQL Exception",
        "Connection refused",
        "DB Connection",
        "Query failed"
      ],
      category: "Database Error",
      severity: "HIGH"
    },
    validationIssues: {
      patterns: [
        "validation.*should.*show.*but.*not",
        "expected.*validation.*error.*not.*display",
        "validation message.*not.*shown",
        "expected.*alert.*but.*not.*present",
        // Negative test - expected error/message not found
        "Expected error msg not found",
        "expected error message not found",
        "Expected error not found",
        "expected validation not found",
        "alert not shown",
        "error message not displayed"
      ],
      category: "Validation Not Triggered",
      severity: "MEDIUM"
    },
    functionalityIssues: {
      patterns: [
        "Sorry, something went wrong",
        "Something went wrong",
        "Oops,? something went wrong",
        "went wrong.*please.*refresh",
        "Please refresh the page and try again",
        "Unexpected error occurred",
        "Unexpected error",
        "An error occurred",
        "page crashed",
        "feature not working",
        "Unable to process your request",
        "We encountered an error",
        "error has occurred",
        "Operation failed"
      ],
      category: "Functionality Error",
      severity: "HIGH"
    },
    // Alert/Modal error messages - high priority product issues
    alertModalErrors: {
      patterns: [
        "Sorry,.*went wrong",
        "Sorry, something went wrong",
        "Sorry, something went wrong. Please try again later",
        "Oops!?.*error",
        "Something went wrong",
        "Something went wrong.*try again",
        "error.*refresh.*page",
        "try again later",
        "Please try again later",
        "request could not be completed",
        "action could not be completed",
        "Unable to complete",
        "failed to load",
        "Could not load",
        "Service temporarily unavailable"
      ],
      category: "UI Alert/Modal Error",
      severity: "HIGH"
    },
    // Unexpected overlay/freeze layer during operations - indicates product error modal appeared
    unexpectedOverlay: {
      patterns: [
        // Freeze layer patterns - indicates unexpected error modal
        "alertFreezeLayer",
        "Freeze layer",
        "Freeze layer found",
        "Freeze layer found on click",
        "Freeze layer found on button",
        "Freeze layer found.*clicking",
        "freeze layer appeared",
        "freezelayer.*appeared",
        // Product error modal indicators (NOT validation modals)
        "error.*modal.*appeared",
        "error.*overlay.*appeared",
        "error.*popup.*appeared",
        "unexpected.*error.*modal",
        "unexpected modal appeared",
        "unexpected popup appeared",
        "unexpected alert appeared",
        // Specific blocking by error modal (product issue)
        "error.*overlay.*blocking",
        "error.*modal.*blocking",
        "freeze.*blocking",
        "Due To Presence of.*Error.*Alert",
        "Due To Presence of.*Alert.*error",
        // Generic modal/overlay that appears WITH error message
        "modal.*something went wrong",
        "overlay.*something went wrong",
        "popup.*error",
        "alert.*went wrong"
      ],
      category: "Unexpected Modal/Overlay Error",
      severity: "HIGH"
    },
    // Potential product issues - unexpected behavior / incorrect display
    unexpectedBehavior: {
      patterns: [
        "wrongly shown",
        "showing wrongly",
        "is wrong in",
        "content is wrong",
        "value is wrong",
        "showing wrong",
        "not redirecting",
        "redirect failed",
        "is not redirecting",
        "notifications not received",
        "not received when expected",
        "is updating when",
        "updating unexpectedly",
        "unexpectedly updating"
      ],
      category: "Unexpected Behavior",
      severity: "MEDIUM"
    },
    // Sync/Integration errors - indicates product integration problems
    syncIntegrationErrors: {
      patterns: [
        // Sync initiation problems
        "Problem in sync initiation",
        "problem.*sync.*initiation",
        "sync.*initiation.*problem",
        "sync.*initiation.*failed",
        "sync.*initiation.*error",
        "failed.*sync.*initiation",
        // General sync issues
        "sync.*failed",
        "sync.*error",
        "sync.*problem",
        "synchronization.*failed",
        "synchronization.*error",
        "failed.*to.*sync",
        "unable.*to.*sync",
        "sync.*not.*working",
        "sync.*issue",
        // Integration issues
        "integration.*failed",
        "integration.*error",
        "integration.*problem",
        "integration.*status.*error",
        "integration.*status.*failed",
        "failed.*to.*integrate",
        "unable.*to.*integrate",
        "integration.*not.*working",
        // Connection/data sync issues
        "data.*sync.*failed",
        "data.*sync.*error",
        "connection.*sync.*failed",
        "sync.*connection.*error",
        // Analytics/reporting sync
        "analytics.*sync.*failed",
        "analytics.*sync.*error",
        "report.*sync.*failed"
      ],
      category: "Sync/Integration Error",
      severity: "HIGH"
    },
    // Page loading stuck / not loaded properly - indicates product performance or loading issue
    pageLoadingIssue: {
      patterns: [
        // Page stuck loading
        "page.*loading",
        "page.*still.*loading",
        "page.*not.*loaded",
        "page.*stuck",
        "page.*hung",
        "page.*hangs",
        "page.*frozen",
        "page.*unresponsive",
        "loading.*stuck",
        "loading.*never.*complete",
        "loading.*timeout",
        "loading.*indefinitely",
        "continuous.*loading",
        "infinite.*loading",
        "endless.*loading",
        "loader.*stuck",
        "loader.*not.*disappear",
        "spinner.*stuck",
        "spinner.*not.*disappear",
        "progress.*bar.*stuck",
        "progress.*indicator.*stuck",
        // Red loading bar specific patterns
        "red.*loading",
        "red.*progress",
        "loading.*bar.*visible",
        "loading.*indicator.*visible",
        "page.*keeps.*loading",
        // Timeout due to loading
        "timeout.*loading",
        "timed.*out.*loading",
        "wait.*loading.*failed",
        // Page not fully rendered
        "page.*not.*fully.*loaded",
        "page.*partial.*load",
        "content.*not.*loaded",
        "elements.*not.*loaded",
        "DOM.*not.*ready",
        "page.*blank",
        "white.*screen",
        "blank.*page",
        // Action-triggered loading stuck (Create, Save, Submit buttons)
        "create.*loading",
        "create.*stuck",
        "create.*not.*responding",
        "create.*keeps.*loading",
        "clicking.*create.*loading",
        "after.*create.*loading",
        "save.*loading",
        "save.*stuck",
        "save.*not.*responding",
        "submit.*loading",
        "submit.*stuck",
        "button.*click.*loading",
        "button.*click.*stuck",
        "action.*stuck",
        "action.*not.*responding",
        "modal.*stuck",
        "modal.*loading",
        "modal.*not.*responding",
        "dialog.*stuck",
        "dialog.*loading",
        "popup.*stuck",
        "popup.*loading",
        "form.*submit.*stuck",
        "form.*submit.*loading",
        "record.*creation.*stuck",
        "record.*creation.*loading",
        "canvas.*loading",
        "canvas.*stuck",
        "detail.*view.*loading",
        "detail.*view.*stuck"
      ],
      category: "Page Loading/Performance Issue",
      severity: "HIGH"
    },
    // Blank page when opening copied/shared links - product issue
    blankPageOnLink: {
      patterns: [
        // Blank page after opening link
        "blank.*after.*open",
        "blank.*when.*open",
        "blank.*on.*open",
        "page.*blank.*new.*tab",
        "page.*blank.*new.*window",
        "page.*blank.*new.*browser",
        "blank.*in.*new.*tab",
        "blank.*in.*new.*window",
        "nothing.*displayed",
        "no.*content.*displayed",
        "no.*content.*showing",
        "no.*content.*visible",
        "content.*missing",
        "content.*not.*rendering",
        "content.*not.*displayed",
        // Copy link scenarios
        "copy.*link.*blank",
        "copied.*link.*blank",
        "shared.*link.*blank",
        "copy.*link.*not.*working",
        "copied.*link.*not.*working",
        "shared.*link.*not.*working",
        "link.*not.*loading",
        "link.*not.*rendering",
        "url.*not.*loading",
        "url.*not.*rendering",
        // Calendar booking specific
        "calendar.*booking.*blank",
        "booking.*link.*blank",
        "booking.*link.*not.*working",
        // Embed/external link issues
        "embed.*blank",
        "embed.*not.*loading",
        "external.*link.*blank",
        "external.*link.*not.*loading",
        // Empty page patterns
        "empty.*page",
        "page.*empty",
        "page.*shows.*nothing",
        "nothing.*on.*page",
        "page.*content.*empty"
      ],
      category: "Blank Page / Shared Link Not Loading",
      severity: "HIGH"
    }
  };

  // ============================================
  // ANALYSIS ENGINE
  // ============================================

  function analyzeFailure(text, caseDescription = '', expectedValue = '', foundValue = '') {
    const result = {
      verdict: "NEEDS_REVIEW",
      confidence: 0,
      category: "Manual Review Required",
      matchedPattern: null,
      suggestion: "Manual review required",
      details: [],
      justification: {
        reason: "",
        evidence: [],
        matchedText: "",
        whyThisVerdict: ""
      }
    };

    // PRIORITY CHECK #1: Expected Value equals Found Value but failure still reported
    // This is a clear AUTOMATION ISSUE - the test script has faulty assertion logic
    if (expectedValue && foundValue) {
      // Normalize values for comparison (trim, lowercase, remove brackets/quotes for comparison)
      const normalizeValue = (val) => {
        return val.toString()
          .trim()
          .toLowerCase()
          .replace(/^[\[\"']+|[\]\"']+$/g, '')  // Remove surrounding brackets/quotes
          .trim();
      };
      
      const normalizedExpected = normalizeValue(expectedValue);
      const normalizedFound = normalizeValue(foundValue);
      
      console.log('🔍 Expected vs Found Check:', { expectedValue, foundValue, normalizedExpected, normalizedFound });
      
      if (normalizedExpected === normalizedFound && normalizedExpected !== '') {
        console.log('🟡 AUTOMATION ISSUE DETECTED: Expected value matches Found value but failure was thrown!');
        result.verdict = "AUTOMATION_ISSUE";
        result.confidence = 95;
        result.category = "Test Script Logic Error";
        result.matchedPattern = "Expected value = Found value but failure reported";
        result.suggestion = "Fix test assertion logic - values match but test incorrectly reported failure";
        result.details.push(`Expected Value: ${expectedValue}`);
        result.details.push(`Found Value: ${foundValue}`);
        result.details.push(`Values are equal but test still threw failure`);
        
        result.justification = {
          reason: "Test assertion logic error - Expected value MATCHES Found value but failure was thrown",
          evidence: [
            `Expected Value: ${expectedValue}`,
            `Found Value: ${foundValue}`,
            `These values are EQUAL (after normalization)`,
            `The test script incorrectly reported failure despite successful verification`,
            `Possible causes: String vs number comparison, array comparison bug, or wrong assertion condition`
          ],
          matchedText: `Expected: ${expectedValue} | Found: ${foundValue}`,
          whyThisVerdict: "When the expected value exactly matches the found value, but the test still reports failure, this is clearly a test script bug - NOT a product issue. The product correctly produced the expected result, but the automation's assertion logic has a flaw (e.g., comparing '[2]' string vs 2 number, or flawed if/else condition)."
        };
        
        return result;
      }
    }

    // PRIORITY CHECK #1.5: Feature Not Available in Module Context
    // Detect when a test is looking for a feature that doesn't exist in the current module/product
    // Example: "Orchestration" is not present in CRM's setup page - this is expected, not a bug
    const featureNotInModulePatterns = [
      // Orchestration - not available in CRM setup
      { 
        feature: /orchestration/i, 
        context: /crm|setup|settings/i,
        notFoundPattern: /orchestration\s*(is\s*)?not\s*found|not\s*found.*orchestration|orchestration.*not\s*present|unable\s*to\s*find.*orchestration|orchestration.*element.*not/i
      },
      // Add more module-specific features here as needed
      { 
        feature: /zia\s*enrichment/i, 
        context: /crm|setup/i,
        notFoundPattern: /zia\s*enrichment\s*(is\s*)?not\s*found|not\s*found.*zia\s*enrichment/i
      },
      {
        feature: /portals/i,
        context: /crm|setup/i,
        notFoundPattern: /portals?\s*(is\s*)?not\s*found|not\s*found.*portals?|portals?.*not\s*present/i
      },
      {
        feature: /canvas/i,
        context: /crm|setup/i,
        notFoundPattern: /canvas\s*(is\s*)?not\s*found|not\s*found.*canvas|canvas.*not\s*present/i
      },
      {
        feature: /sandbox/i,
        context: /crm|setup/i,
        notFoundPattern: /sandbox\s*(is\s*)?not\s*found|not\s*found.*sandbox|sandbox.*not\s*present/i
      },
      {
        feature: /wizards?/i,
        context: /crm|setup/i,
        notFoundPattern: /wizards?\s*(is\s*)?not\s*found|not\s*found.*wizards?|wizards?.*not\s*present/i
      },
      {
        feature: /commandcenter|command\s*center/i,
        context: /crm|setup/i,
        notFoundPattern: /(commandcenter|command\s*center)\s*(is\s*)?not\s*found|not\s*found.*(commandcenter|command\s*center)/i
      },
      {
        feature: /blueprint/i,
        context: /crm|setup/i,
        notFoundPattern: /blueprint\s*(is\s*)?not\s*found|not\s*found.*blueprint|blueprint.*not\s*present/i
      }
    ];

    // Check for critical product errors FIRST - these override feature-not-found classification
    // If the product shows an error like "Sorry something went wrong", it's a product issue
    const criticalProductErrorPatternsEarly = [
      /sorry.*something.*went.*wrong/i,
      /something.*went.*wrong/i,
      /oops.*something.*went.*wrong/i,
      /please.*refresh.*the.*page.*and.*try.*again/i,
      /please.*refresh.*and.*try.*again/i,
      /unexpected.*error.*occurred/i,
      /we.*encountered.*an.*error/i,
      /unable.*to.*process.*your.*request/i,
      /service.*temporarily.*unavailable/i,
      /500.*internal.*server.*error/i,
      /502.*bad.*gateway/i,
      /503.*service.*unavailable/i,
      /504.*gateway.*timeout/i,
      /server.*error/i,
      /NullPointerException/i,
      /RuntimeException/i,
      /Exception.*in.*thread/i
    ];
    
    const hasEarlyCriticalProductError = criticalProductErrorPatternsEarly.some(p => p.test(text));
    
    // Check if the failure matches a "feature not in module" pattern
    // BUT ONLY if there's no critical product error present
    const combinedText = `${text} ${caseDescription}`.toLowerCase();
    
    if (!hasEarlyCriticalProductError) {
      for (const pattern of featureNotInModulePatterns) {
        if (pattern.notFoundPattern.test(text) || pattern.notFoundPattern.test(caseDescription)) {
          // Feature not found - check if it's in a context where the feature isn't expected
          const featureMatch = combinedText.match(pattern.feature);
          const contextMatch = combinedText.match(pattern.context);
          
          if (featureMatch) {
            const featureName = featureMatch[0];
            console.log(`🟡 FEATURE NOT IN MODULE DETECTED: ${featureName} not found in ${contextMatch ? contextMatch[0] : 'this'} context`);
            
            result.verdict = "AUTOMATION_ISSUE";
            result.confidence = 90;
            result.category = "Feature Not Available in Module";
            result.matchedPattern = `${featureName} not found`;
            result.suggestion = `The feature "${featureName}" may not be available in this module/edition. Verify test is running in the correct product context or update test to skip unavailable features.`;
            result.details.push(`Feature "${featureName}" is not found`);
            result.details.push(`This feature may not be available in certain modules (e.g., CRM setup)`);
            result.details.push(`Test should verify feature availability before attempting to interact`);
            
            result.justification = {
              reason: `Feature "${featureName}" is not available in this module/context - this is expected behavior, not a product bug`,
              evidence: [
                `Feature not found: "${featureName}"`,
                `Some features are module-specific and not available everywhere`,
                `Example: Orchestration is NOT present in CRM's setup page by design`,
                `The test should check for feature availability or run in the correct module`
              ],
              matchedText: text.substring(0, 200),
              whyThisVerdict: `When a feature like "${featureName}" is not found, it's often because the feature isn't available in that specific module or edition - not because the product is broken. The test automation should handle this gracefully or be configured to run only in supported contexts.`
            };
            
            return result;
          }
        }
      }
    } else {
      // Log that we're skipping feature-not-found check due to product error
      console.log('🔴 CRITICAL PRODUCT ERROR DETECTED - Skipping feature-not-found check:', 
        criticalProductErrorPatternsEarly.find(p => p.test(text))?.source);
    }

    // PRIORITY CHECK #2: If case description mentions test data validation scenarios,
    // it's likely an automation issue (testing with invalid input)
    const testDataPatterns = [
      // Special characters / invalid input testing
      /validating.*special characters/i,
      /special characters.*validation/i,
      /validating.*max characters/i,
      /max characters.*validation/i,
      /testing.*invalid.*input/i,
      /invalid.*data.*test/i,
      /boundary.*test/i,
      /negative.*test.*scenario/i,
      // Alert/validation verification scenarios
      /enter.*value.*as.*[!@#$%^&*]/i,
      /enter.*as.*[!@#$%^&*]/i,
      /value.*as.*[!@#$%^&*]/i,
      /domains.*as.*[!@#$%^&*]/i,
      /[!@#$%^&*()]{3,}/i,  // 3+ consecutive special chars in case description
      /check.*alert/i,
      /verify.*alert/i,
      /ensure.*alert/i,
      /alert.*is.*shown/i,
      /alert.*should/i,
      /alert.*throws/i,
      /check.*validation/i,
      /verify.*validation/i,
      /validation.*alert/i,
      /validation.*message/i,
      /check.*error.*message/i,
      /verify.*error.*message/i,
      // VALIDATION MESSAGE VERIFICATION - Row 20 specific patterns
      /verifying.*validation/i,         // "verifying the Validation message"
      /verifying.*the.*validation/i,    // "verifying the Validation"
      /validation.*message.*for/i,      // "Validation message for"
      /validation.*for.*domain/i,       // "validation for domain"
      /allowed.*domain/i,               // "allowed domain input field"
      /domain.*input.*field/i,          // "domain input field"
      /embed.*url.*pop/i,               // "Embed URL pop up"
      /while.*verifying/i,              // "While verifying"
      // Invalid input testing
      /give.*invalid/i,
      /provide.*invalid/i,
      /enter.*invalid/i,
      /invalid.*key/i,
      /invalid.*url/i,
      /invalid.*domain/i,
      /invalid.*email/i,
      /invalid.*phone/i,
      /invalid.*number/i,
      /invalid.*format/i,
      /wrong.*format/i,
      /incorrect.*format/i,
      // Empty/space testing
      /set.*as.*empty/i,
      /provide.*space/i,
      /give.*space/i,
      /space.*alone/i,
      /leave.*blank/i,
      /leave.*empty/i,
      /without.*value/i,
      /no.*value/i,
      // Max limit/boundary testing
      /max.*limit/i,
      /check.*limit/i,
      /exceed.*limit/i,
      /beyond.*limit/i,
      /more.*than.*allowed/i,
      /less.*than.*minimum/i,
      // Negative testing patterns
      /negative.*test/i,
      /edge.*case/i,
      /error.*scenario/i,
      /failure.*scenario/i
    ];

    const hasTestDataScenario = testDataPatterns.some(p => p.test(caseDescription)) || 
                                testDataPatterns.some(p => p.test(text));  // Also check text for patterns
    
    // Debug log for Row 20 investigation
    if (CONFIG.debugMode && (text.includes('allowed domain') || caseDescription.includes('validation message'))) {
      console.log('🔍 DEBUG Row 20:', { 
        caseDescription: caseDescription.substring(0, 200), 
        textSnippet: text.substring(0, 200),
        hasTestDataScenario 
      });
    }
    
    // Check for freeze layer (indicates unexpected modal/alert - product issue indicator)
    const hasFreezeLayer = /freeze\s*layer/i.test(text);
    
    // If we have BOTH freeze layer AND test data scenario, show CONFLICTING_SIGNALS
    if (hasFreezeLayer && hasTestDataScenario) {
      console.log('🟣 CONFLICTING SIGNALS: Freeze layer detected in test data scenario context');
      result.verdict = "CONFLICTING_SIGNALS";
      result.confidence = 70;
      result.category = "Conflicting Signals Detected";
      result.matchedPattern = "Freeze layer in test scenario";
      result.suggestion = "Review both analyses below and select the appropriate classification";
      result.details.push(`Freeze layer detected during what appears to be a validation test`);
      
      result.justification = {
        reason: "CONFLICTING SIGNALS: Freeze layer (product error) detected in validation test context",
        evidence: [
          `Product Signal: Freeze layer/modal appeared unexpectedly`,
          `Automation Signal: Test appears to be a validation/negative test scenario`,
          `User decision required to classify this failure`
        ],
        matchedText: text.substring(0, 200),
        whyThisVerdict: "A freeze layer (unexpected modal/popup) appeared during what looks like a validation test. This could be a genuine product error OR expected behavior being tested."
      };
      
      result.conflictingAnalyses = {
        productAnalysis: {
          verdict: "PRODUCT_ISSUE",
          category: "Unexpected Modal/Overlay Error",
          confidence: 85,
          severity: "HIGH",
          matchedPattern: "Freeze layer",
          justification: {
            reason: "Unexpected freeze layer/modal appeared during operation",
            evidence: [
              `Freeze layer detected: "${text.substring(0, 100)}"`,
              `This indicates an unexpected error popup/modal appeared`,
              `The application showed an error that blocked the operation`
            ],
            whyThisVerdict: "When a freeze layer or modal appears unexpectedly (especially with error messages like 'Something went wrong'), it typically indicates a product bug, not a test infrastructure issue."
          }
        },
        automationAnalysis: {
          verdict: "AUTOMATION_ISSUE",
          category: "Invalid Test Data / Validation Test",
          confidence: 80,
          suggestion: "Test scenario may be triggering expected validation behavior",
          matchedPattern: "Test data validation scenario",
          justification: {
            reason: "Test appears to be a validation/negative test scenario",
            evidence: [
              `Case description suggests validation testing`,
              `The freeze layer might be expected validation feedback`,
              `Test may be checking if proper error handling occurs`
            ],
            whyThisVerdict: "Some validation tests expect error modals/alerts to appear when invalid data is submitted. If this is the expected behavior being verified, it's an automation setup issue, not a product bug."
          }
        }
      };
      
      return result;
    }
    
    // If only freeze layer (no test data scenario), go directly to PRODUCT_PATTERNS
    if (hasFreezeLayer) {
      console.log('🔴 FREEZE LAYER DETECTED - No test scenario context, treating as PRODUCT_ISSUE');
      // Continue to PRODUCT_PATTERNS check below (skip the hasTestDataScenario block)
    } else if (hasTestDataScenario) {
      // Check if there's a validation error or element not found in the text
      const automationSignalPatterns = [
        /cannot be empty/i,
        /special characters/i,
        /not.*present after \d+ seconds/i,
        /element is not present/i,
        /element not found/i,
        /invalid.*input/i,
        /is required/i,
        /NoSuchElementException/i,
        /invalid domain/i,
        /invalid key/i,
        /invalid url/i,
        /invalid email/i,
        /invalid phone/i,
        /invalid format/i,
        /button.*not found/i,
        /not found$/i,
        /Alert is shown/i,
        /alert.*presence/i,
        /Due To Presence of.*Alert/i,
        /validation message/i,
        /validating/i,
        /allowed domain/i,
        /embed.*url/i,
        /popup.*not found/i,
        /dialog.*not found/i,
        /modal.*not found/i,
        /error.*message/i,
        /warning.*message/i,
        /field.*error/i,
        /input.*error/i,
        /form.*error/i
      ];
      
      // For test data scenarios with special characters or invalid input,
      // a 400 status is EXPECTED behavior (validation rejection), not a product issue
      const expectedValidationResponses = [
        /status.*400/i,
        /status --400/i,
        /bad request/i,
        /validation.*failed/i,
        /invalid.*request/i,
        /rejected/i
      ];
      
      // CRITICAL: Product error patterns that should OVERRIDE automation classification
      // If these are present, it's a product issue even if automation signals exist
      const criticalProductErrorPatterns = [
        /sorry.*something.*went.*wrong/i,
        /something.*went.*wrong/i,
        /oops.*something.*went.*wrong/i,
        /please.*refresh.*the.*page.*and.*try.*again/i,
        /unexpected.*error.*occurred/i,
        /we.*encountered.*an.*error/i,
        /unable.*to.*process.*your.*request/i,
        /service.*temporarily.*unavailable/i,
        /500.*internal.*server.*error/i,
        /502.*bad.*gateway/i,
        /503.*service.*unavailable/i,
        /504.*gateway.*timeout/i,
        /server.*error/i,
        /NullPointerException/i,
        /RuntimeException/i,
        /Exception.*in.*thread/i,
        // Freeze layer during normal operations indicates unexpected modal/alert (product error)
        /freeze\s*layer/i,  // Matches "Freeze layer", "freeze layer", "Freezelayer"
        /freeze.*layer.*found/i,
        /unexpected.*modal/i,
        /unexpected.*popup/i,
        /unexpected.*alert/i,
        /unexpected.*overlay/i,
        /blocked.*by.*overlay/i,
        /blocked.*by.*modal/i
      ];
      
      const hasCriticalProductError = criticalProductErrorPatterns.some(p => p.test(text));
      
      // Debug logging for freeze layer detection
      if (text.toLowerCase().includes('freeze')) {
        console.log('🔴 FREEZE LAYER DEBUG:', {
          text: text.substring(0, 200),
          hasCriticalProductError,
          matchedPattern: criticalProductErrorPatterns.find(p => p.test(text))?.source
        });
      }
      const hasAutomationSignal = automationSignalPatterns.some(p => p.test(text));
      const hasExpectedValidationResponse = expectedValidationResponses.some(p => p.test(text));
      
      // Debug logging for signal detection
      console.log('🔍 SIGNAL DETECTION DEBUG:', {
        textSnippet: text.substring(0, 150),
        hasCriticalProductError,
        hasAutomationSignal,
        hasExpectedValidationResponse,
        matchedAutomationPattern: automationSignalPatterns.find(p => p.test(text))?.source,
        matchedExpectedValidation: expectedValidationResponses.find(p => p.test(text))?.source
      });
      
      // Get matched patterns for display
      const matchedProductPattern = criticalProductErrorPatterns.find(p => p.test(text));
      const matchedAutomationPattern = automationSignalPatterns.find(p => p.test(text));
      
      // CONFLICTING SIGNALS: Both product error AND automation signals detected
      // Let user decide which classification applies
      if (hasCriticalProductError && (hasAutomationSignal || hasExpectedValidationResponse)) {
        result.verdict = "CONFLICTING_SIGNALS";
        result.confidence = 70;
        result.category = "Conflicting Signals Detected";
        result.matchedPattern = "Both product error and automation signals found";
        result.suggestion = "Review both analyses below and select the appropriate classification";
        result.details.push(`Both product error indicator and automation signal detected`);
        
        // Build dual justification for user decision
        result.justification = {
          reason: "CONFLICTING SIGNALS: Both product error and automation indicators detected",
          evidence: [
            `Product Error Signal: Alert/error message detected in UI`,
            `Automation Signal: Test validation scenario detected`,
            `User decision required to classify this failure`
          ],
          matchedText: text.substring(0, 200),
          whyThisVerdict: "This failure shows both a product error (alert/popup with error message) AND automation validation testing patterns. The system cannot automatically determine if this is a genuine product bug or expected validation behavior."
        };
        
        // Store both possible analyses for user decision
        result.conflictingAnalyses = {
          productAnalysis: {
            verdict: "PRODUCT_ISSUE",
            category: "Functionality Error",
            confidence: 85,
            severity: "HIGH",
            matchedPattern: matchedProductPattern?.source || "Alert/error message",
            justification: {
              reason: "Detected UI alert/error message indicating a product defect",
              evidence: [
                `Alert message displayed: "Something went wrong" or similar`,
                `This is an unexpected error from the product`,
                `The error message suggests a backend/functionality issue`
              ],
              whyThisVerdict: "When the application shows an error alert/popup with messages like 'Something went wrong', 'Please refresh', etc., it typically indicates an unexpected product failure rather than expected validation behavior."
            }
          },
          automationAnalysis: {
            verdict: "AUTOMATION_ISSUE",
            category: "Invalid Test Data / Validation Test",
            confidence: 90,
            suggestion: "Test uses intentionally invalid input for validation testing - expected behavior",
            matchedPattern: matchedAutomationPattern?.source || "Validation test scenario",
            justification: {
              reason: "Test is performing INPUT VALIDATION testing with intentionally invalid data",
              evidence: [
                `Case description mentions validation/testing scenario`,
                `Automation signal detected in error text`,
                `Pattern matched: validation/special characters/invalid input testing`
              ],
              whyThisVerdict: "When automation sends invalid input (special characters, empty values, wrong formats) to test validation, the application may show error messages. This could be the expected validation behavior being verified."
            }
          }
        };
        
        return result;
      }
      
      // If only critical product error is detected, skip automation classification
      // and let the product pattern check handle it
      if (hasCriticalProductError) {
        // Don't return early - continue to product pattern check below
        console.log('🔴 Critical product error detected, skipping automation classification');
      } else if (hasAutomationSignal || hasExpectedValidationResponse) {
        result.verdict = "AUTOMATION_ISSUE";
        result.confidence = 90;
        result.category = "Invalid Test Data / Validation Test";
        result.matchedPattern = "Test data validation scenario";
        result.suggestion = "Test uses intentionally invalid input for validation testing - expected behavior";
        result.details.push(`Case description indicates validation testing: "${caseDescription.substring(0, 100)}..."`);
        
        // Build justification
        result.justification = {
          reason: "Test is performing INPUT VALIDATION testing with intentionally invalid data",
          evidence: [
            `Case description mentions validation/testing scenario`,
            hasAutomationSignal ? `Automation signal detected in error text` : null,
            hasExpectedValidationResponse ? `400/Bad Request response is EXPECTED when server rejects invalid input` : null,
            `Pattern matched: validation/special characters/invalid input testing`
          ].filter(Boolean),
          matchedText: text.substring(0, 200),
          whyThisVerdict: "When automation sends invalid input (special characters, empty values, wrong formats) to test validation, the application SHOULD reject it. This is the test working correctly - not a product bug. The 'failure' is actually the expected validation behavior being verified."
        };
        
        if (hasExpectedValidationResponse) {
          result.details.push("400 status is expected when server rejects invalid input during validation testing");
        }
        return result;
      }
    }

    // Check product patterns first (higher priority)
    for (const [key, patternGroup] of Object.entries(PRODUCT_PATTERNS)) {
      for (const pattern of patternGroup.patterns) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(text)) {
          const matchedTextSnippet = text.match(regex)?.[0] || pattern;
          result.verdict = "PRODUCT_ISSUE";
          result.confidence = 85;
          result.category = patternGroup.category;
          result.matchedPattern = pattern;
          result.severity = patternGroup.severity;
          result.details.push(`Found: "${pattern}"`);
          
          // Build justification for Product Issue
          result.justification = {
            reason: `Detected ${patternGroup.category} - indicates a potential product defect`,
            evidence: [
              `Pattern matched: "${pattern}"`,
              `Category: ${patternGroup.category}`,
              `Severity: ${patternGroup.severity}`,
              `This is NOT a test data validation scenario`
            ],
            matchedText: matchedTextSnippet,
            whyThisVerdict: getProductIssueExplanation(key, patternGroup.category)
          };
          
          return result;
        }
      }
    }

    // Check automation patterns
    for (const [key, patternGroup] of Object.entries(AUTOMATION_PATTERNS)) {
      for (const pattern of patternGroup.patterns) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(text)) {
          const matchedTextSnippet = text.match(regex)?.[0] || pattern;
          result.verdict = "AUTOMATION_ISSUE";
          result.confidence = 80;
          result.category = patternGroup.category;
          result.matchedPattern = pattern;
          result.suggestion = patternGroup.suggestion;
          result.details.push(`Found: "${pattern}"`);
          
          // Build justification for Automation Issue
          result.justification = {
            reason: `Detected ${patternGroup.category} - this is an automation/test infrastructure problem`,
            evidence: [
              `Pattern matched: "${pattern}"`,
              `Category: ${patternGroup.category}`,
              `Suggestion: ${patternGroup.suggestion}`
            ],
            matchedText: matchedTextSnippet,
            whyThisVerdict: getAutomationIssueExplanation(key, patternGroup.category)
          };
          
          return result;
        }
      }
    }

    if (/assertion|mismatch|expected.*actual/i.test(text)) {
      result.verdict = "NEEDS_REVIEW";
      result.confidence = 50;
      result.category = "Assertion Failure";
      result.suggestion = "Compare expected vs actual - could be test or product issue";
      result.justification = {
        reason: "Assertion failure detected - requires manual analysis",
        evidence: [`Text contains assertion/mismatch keywords`],
        matchedText: text.substring(0, 200),
        whyThisVerdict: "Assertion failures can be caused by either test issues (wrong expected values, outdated test data) OR product bugs (actual behavior changed). Manual review of expected vs actual values is needed to determine the root cause."
      };
    } else {
      // Default justification for needs review - extract key info from failure text
      const failureSnippet = text.substring(0, 150).replace(/\s+/g, ' ').trim();
      const keyIndicators = [];
      
      // Try to identify what type of failure this might be
      if (/error|fail|exception/i.test(text)) keyIndicators.push('Error detected');
      if (/timeout|wait/i.test(text)) keyIndicators.push('Possible timing issue');
      if (/click|element|button/i.test(text)) keyIndicators.push('UI interaction involved');
      if (/assert|verify|check/i.test(text)) keyIndicators.push('Verification step');
      if (/api|request|response|status/i.test(text)) keyIndicators.push('API/Network related');
      if (/data|value|field/i.test(text)) keyIndicators.push('Data validation involved');
      
      result.category = keyIndicators.length > 0 
        ? `Unclassified: ${keyIndicators.slice(0, 2).join(', ')}`
        : `Unclassified Failure`;
      
      result.suggestion = "Review failure details manually - no known pattern matched";
      result.justification = {
        reason: `No clear pattern matched - requires manual investigation`,
        evidence: [
          `No automation or product issue patterns detected`,
          keyIndicators.length > 0 ? `Indicators found: ${keyIndicators.join(', ')}` : 'No specific indicators identified',
          `Failure snippet: "${failureSnippet}..."`
        ],
        matchedText: text.substring(0, 200),
        whyThisVerdict: "This failure doesn't match known automation or product issue patterns. Please review the failure details, DOM snapshot, and video to determine if this is a test infrastructure problem or an actual product bug."
      };
    }

    return result;
  }

  // Explanation generators for justifications
  function getProductIssueExplanation(key, category) {
    const explanations = {
      serverErrors: "Server errors (5xx) indicate backend/infrastructure problems that are NOT caused by the test. The application should handle requests without crashing.",
      appExceptions: "Application exceptions (NullPointer, ArrayIndexOutOfBounds, etc.) indicate bugs in the product code that need to be fixed by developers.",
      apiErrors: "API errors indicate the backend is returning error responses. If the test was sending VALID data, this suggests a product issue.",
      dbErrors: "Database errors indicate backend data layer problems that need developer attention.",
      validationIssues: "Expected validation was NOT triggered when it should have been - the product failed to show the expected error/warning.",
      functionalityIssues: "Core functionality is broken - the product crashed or showed unexpected error messages.",
      unexpectedBehavior: "The product is displaying wrong values or behaving unexpectedly - this indicates a functional bug.",
      alertModalErrors: "UI showed an error alert or modal with error message - this indicates a product failure, not expected behavior.",
      unexpectedOverlay: "An unexpected error overlay/freeze layer appeared - this indicates the product encountered an error and showed an error modal.",
      pageLoadingIssue: "Page is stuck loading or not loaded properly - the red loading bar indicates a performance or loading issue. The page failed to fully render, causing the test to fail.",
      blankPageOnLink: "Page shows blank/empty when opening a copied or shared link. When a user copies a link (e.g., calendar booking link) and opens it in a new browser/tab, the page should display content but instead shows nothing - this is a product bug.",
      syncIntegrationErrors: "Sync or integration error detected (e.g., 'Problem in sync initiation'). The integration between systems failed - this indicates a backend/connectivity issue that needs developer attention."
    };
    return explanations[key] || `${category} detected - indicates a product defect that needs developer attention.`;
  }

  function getAutomationIssueExplanation(key, category) {
    const explanations = {
      elementIssues: "Element not found or not interactable - the test locator may be outdated, or the page didn't load properly. Check if the element selector is correct and add waits if needed.",
      timingIssues: "Timeout occurred waiting for element/condition - the page may be slower than expected. Consider increasing wait times or using dynamic waits.",
      overlayIssues: "An overlay/popup is blocking the element - the test needs to handle/dismiss the overlay before proceeding.",
      setupIssues: "Test data or configuration is not set up correctly - check preconditions and test data preparation.",
      inputValidationIssues: "Test provided invalid input and the application correctly rejected it - this is expected behavior for validation testing.",
      invalidTestDataIssues: "Test is verifying validation behavior with intentionally invalid data - the 'failure' is actually the expected validation working correctly.",
      assertionIssues: "Assertion mismatch - verify if the expected values in the test are correct for the current application state."
    };
    return explanations[key] || `${category} detected - this is a test/automation infrastructure issue, not a product bug.`;
  }

  // ============================================
  // DOM EXTRACTION - IMPROVED FOR ALL ROWS
  // ============================================

  function extractAllFailureRows() {
    const failures = [];
    
    // Find all report rows - look for rows with IDs starting with reportrows_
    const reportRows = document.querySelectorAll('[id^="reportrows_"]');
    
    if (reportRows.length > 0) {
      console.log(`📊 Found ${reportRows.length} report rows`);
      
      reportRows.forEach((row, index) => {
        // Extract case name from the row header
        let caseName = '';
        const caseHeader = row.closest('[id^="report_"]') || row.parentElement;
        if (caseHeader) {
          const nameEl = caseHeader.querySelector('div > span, div > div > span');
          if (nameEl) caseName = nameEl.innerText;
        }
        
        // Fallback: try to get from the row itself
        if (!caseName) {
          const firstDiv = row.querySelector('div');
          if (firstDiv) {
            caseName = firstDiv.innerText.split('\n')[0];
          }
        }
        
        // Extract feature name from class="featurename" element
        let featureName = '';
        const featureEl = row.closest('[class*="featurename"]') || 
                         row.querySelector('.featurename') ||
                         document.querySelector('.featurename');
        if (featureEl) {
          featureName = featureEl.innerText || featureEl.textContent || '';
          featureName = featureName.trim();
        }
        // Also try to find it from parent container or report header
        if (!featureName) {
          const reportContainer = row.closest('[id^="report_"]') || row.closest('.report-container');
          if (reportContainer) {
            const featureInContainer = reportContainer.querySelector('.featurename, [class*="feature-name"]');
            if (featureInContainer) featureName = featureInContainer.innerText?.trim() || '';
          }
        }
        // Extract from page title/header if not found
        if (!featureName) {
          const pageHeader = document.querySelector('h1, .report-title, .feature-title, [class*="reportname"]');
          if (pageHeader) featureName = pageHeader.innerText?.trim() || '';
        }
        
        // Extract failure and reason text
        const rowText = row.innerText || row.textContent;
        
        let failureText = '';
        let reasonText = '';
        
        // Extract Failure text
        const failureMatch = rowText.match(/Failure\s*[:\-]?\s*([^\n]+)/i);
        if (failureMatch) failureText = failureMatch[1].trim();
        
        // Extract Reason text
        const reasonMatch = rowText.match(/(?:Reason|Due to)\s*[:\-]?\s*([^\n]+)/i);
        if (reasonMatch) reasonText = reasonMatch[1].trim();
        
        // Extract Expected Value and Found Value for assertion mismatch detection
        let expectedValue = '';
        let foundValue = '';
        const expectedMatch = rowText.match(/Expected\s*Value\s*[:\-]?\s*:?\s*([^\n]+)/i);
        const foundMatch = rowText.match(/Value\s*Found\s*[:\-]?\s*:?\s*([^\n]+)/i);
        if (expectedMatch) expectedValue = expectedMatch[1].trim();
        if (foundMatch) foundValue = foundMatch[1].trim();
        
        // Get ReConstructed DOM link
        const domLink = row.querySelector('a[href*="Failure_DOM"]')?.href || null;
        
        // Get Video links (Failure video, Ideal test case video)
        const videoLinks = extractVideoLinks(row);
        
        // Get Case History menu element
        const caseHistoryMenu = row.querySelector('li');
        
        failures.push({
          index: index + 1,
          rowId: row.id,
          caseName: cleanCaseName(caseName) || `Row ${index + 1}`,
          featureName: featureName, // Add feature name
          failureText: failureText,
          reasonText: reasonText,
          expectedValue: expectedValue,
          foundValue: foundValue,
          fullText: rowText.substring(0, 3000),
          element: row,
          domLink: domLink,
          failureVideoLink: videoLinks.failureVideo,
          idealVideoLink: videoLinks.idealVideo,
          hasCaseHistory: !!caseHistoryMenu
        });
      });
    }

    // Alternative: Find failure containers in different page structures
    if (failures.length === 0) {
      // Try to find rows by class patterns
      const alternateRows = document.querySelectorAll('.failure-row, .test-failure, [class*="breakage"], .row-data');
      alternateRows.forEach((row, index) => {
        const text = row.innerText || row.textContent;
        if (text && text.length > 20) {
          const videoLinks = extractVideoLinks(row);
          failures.push({
            index: index + 1,
            rowId: row.id || `row-${index}`,
            caseName: extractCaseNameFromText(text) || `Case ${index + 1}`,
            failureText: extractFailureFromText(text),
            reasonText: extractReasonFromText(text),
            fullText: text.substring(0, 3000),
            element: row,
            domLink: row.querySelector('a[href*="DOM"]')?.href || null,
            failureVideoLink: videoLinks.failureVideo,
            idealVideoLink: videoLinks.idealVideo,
            hasCaseHistory: false
          });
        }
      });
    }

    console.log(`✅ Extracted ${failures.length} failure rows`);
    return failures;
  }

  // ============================================
  // VIDEO LINK EXTRACTION - For verification
  // ============================================

  function extractVideoLinks(row) {
    const result = {
      failureVideo: null,
      idealVideo: null
    };
    
    // Look for video links in the row
    // Pattern 1: Links with "imageplayer" in href
    const videoAnchors = row.querySelectorAll('a[href*="imageplayer"]');
    
    videoAnchors.forEach(anchor => {
      const text = anchor.innerText.toLowerCase();
      const href = anchor.href;
      
      if (text.includes('failure') || (href && !href.includes('idealtestcaseexecutionvideo'))) {
        result.failureVideo = href;
      }
      if (text.includes('ideal') || (href && href.includes('idealtestcaseexecutionvideo'))) {
        result.idealVideo = href;
      }
    });
    
    // Pattern 2: Look for Video links by text content
    const allAnchors = row.querySelectorAll('a');
    allAnchors.forEach(anchor => {
      const text = anchor.innerText.toLowerCase();
      const href = anchor.href;
      
      if (text.includes('failure video') && !result.failureVideo) {
        result.failureVideo = href;
      }
      if (text.includes('ideal') && text.includes('video') && !result.idealVideo) {
        result.idealVideo = href;
      }
      // Generic "Video" link usually means failure video
      if (text === 'video' && !result.failureVideo) {
        result.failureVideo = href;
      }
    });
    
    return result;
  }

  function cleanCaseName(name) {
    if (!name) return '';
    return name.replace(/TOTAL\s*:\s*\d+/gi, '')
               .replace(/\d+$/g, '')
               .replace(/\n.*/g, '')
               .trim()
               .substring(0, 50);
  }

  function extractCaseNameFromText(text) {
    const lines = text.split('\n');
    return lines[0]?.substring(0, 50) || '';
  }

  function extractFailureFromText(text) {
    const match = text.match(/Failure\s*[:\-]?\s*([^\n]+)/i);
    return match ? match[1].trim() : text.substring(0, 200);
  }

  function extractReasonFromText(text) {
    const match = text.match(/(?:Reason|Due to)\s*[:\-]?\s*([^\n]+)/i);
    return match ? match[1].trim() : '';
  }

  // ============================================
  // DOM & VIDEO ANALYSIS VALIDATION
  // ============================================

  /**
   * Analyze Reconstructed DOM content to validate/override the initial verdict
   * This fetches the actual DOM snapshot and looks for error indicators
   */
  async function analyzeDomContent(domLink) {
    if (!domLink) return null;
    
    try {
      // Use background script to fetch DOM content (avoids CORS)
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'fetchUrl',
          url: domLink
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response);
          }
        });
      });

      if (!response || !response.success || !response.data) {
        console.log('AFI: Could not fetch DOM content');
        return null;
      }

      const domHtml = response.data.html || response.data;
      if (typeof domHtml !== 'string') return null;

      // Analyze the DOM content for error indicators
      const domAnalysis = {
        hasErrorModal: false,
        hasErrorAlert: false,
        hasFreezeLayer: false,
        hasSuccessIndicator: false,
        hasFormValidation: false,
        hasServerError: false,
        errorMessages: [],
        indicators: []
      };

      // Check for error modals/dialogs in DOM
      const errorModalPatterns = [
        /class\s*=\s*["'][^"']*modal[^"']*error[^"']*["']/i,
        /class\s*=\s*["'][^"']*error[^"']*modal[^"']*["']/i,
        /class\s*=\s*["'][^"']*alert[^"']*danger[^"']*["']/i,
        /class\s*=\s*["'][^"']*error[^"']*dialog[^"']*["']/i,
        /<div[^>]*class\s*=\s*["'][^"']*freeze[^"']*["']/i,
        /<div[^>]*class\s*=\s*["'][^"']*overlay[^"']*error[^"']*["']/i
      ];
      
      for (const pattern of errorModalPatterns) {
        if (pattern.test(domHtml)) {
          domAnalysis.hasErrorModal = true;
          domAnalysis.indicators.push('Error modal/dialog visible in DOM');
          break;
        }
      }

      // Check for freeze layer
      if (/alertFreezeLayer|freezelayer|freeze-layer/i.test(domHtml)) {
        domAnalysis.hasFreezeLayer = true;
        domAnalysis.indicators.push('Freeze layer present in DOM');
      }

      // Check for error messages in visible text
      const errorTextPatterns = [
        /Something went wrong/gi,
        /Sorry,? something went wrong/gi,
        /Oops!? something went wrong/gi,
        /An error occurred/gi,
        /Unable to process/gi,
        /Please try again/gi,
        /Request failed/gi,
        /Server error/gi,
        /500\s*Internal Server Error/gi,
        /502\s*Bad Gateway/gi,
        /503\s*Service Unavailable/gi,
        /We encountered an error/gi
      ];

      for (const pattern of errorTextPatterns) {
        const matches = domHtml.match(pattern);
        if (matches) {
          domAnalysis.hasServerError = true;
          domAnalysis.errorMessages.push(matches[0]);
        }
      }

      // Check for form validation messages (automation issue indicators)
      const validationPatterns = [
        /class\s*=\s*["'][^"']*validation[^"']*["']/i,
        /class\s*=\s*["'][^"']*invalid-feedback[^"']*["']/i,
        /class\s*=\s*["'][^"']*field-error[^"']*["']/i,
        /class\s*=\s*["'][^"']*form-error[^"']*["']/i,
        /aria-invalid\s*=\s*["']true["']/i
      ];

      for (const pattern of validationPatterns) {
        if (pattern.test(domHtml)) {
          domAnalysis.hasFormValidation = true;
          domAnalysis.indicators.push('Form validation visible in DOM');
          break;
        }
      }

      // Check for success indicators (might indicate false positive)
      const successPatterns = [
        /class\s*=\s*["'][^"']*success[^"']*["']/i,
        /class\s*=\s*["'][^"']*saved[^"']*["']/i,
        /Successfully/gi,
        /has been saved/gi,
        /has been created/gi
      ];

      for (const pattern of successPatterns) {
        if (pattern.test(domHtml)) {
          domAnalysis.hasSuccessIndicator = true;
          domAnalysis.indicators.push('Success indicator found in DOM');
          break;
        }
      }

      // Determine DOM-based verdict suggestion
      if (domAnalysis.hasServerError || (domAnalysis.hasErrorModal && !domAnalysis.hasFormValidation)) {
        domAnalysis.suggestedVerdict = 'PRODUCT_ISSUE';
        domAnalysis.confidence = 85;
        domAnalysis.reason = 'DOM contains error modal/server error without form validation context';
      } else if (domAnalysis.hasFormValidation && !domAnalysis.hasServerError) {
        domAnalysis.suggestedVerdict = 'AUTOMATION_ISSUE';
        domAnalysis.confidence = 75;
        domAnalysis.reason = 'DOM shows form validation - likely invalid test data scenario';
      } else if (domAnalysis.hasFreezeLayer && domAnalysis.hasFormValidation) {
        domAnalysis.suggestedVerdict = 'NEEDS_REVIEW';
        domAnalysis.confidence = 60;
        domAnalysis.reason = 'DOM shows both freeze layer and form validation - ambiguous';
      } else if (domAnalysis.hasFreezeLayer && !domAnalysis.hasFormValidation) {
        domAnalysis.suggestedVerdict = 'PRODUCT_ISSUE';
        domAnalysis.confidence = 80;
        domAnalysis.reason = 'Freeze layer without form validation suggests product error';
      }

      console.log('AFI DOM Analysis:', domAnalysis);
      return domAnalysis;

    } catch (error) {
      console.log('AFI: DOM analysis failed:', error.message);
      return null;
    }
  }

  /**
   * Validate initial verdict using DOM and Video analysis
   * Returns updated analysis if DOM/Video provides conflicting information
   */
  function validateVerdictWithDomVideo(initialAnalysis, domAnalysis, hasFailureVideo) {
    if (!domAnalysis) return initialAnalysis;

    const result = { ...initialAnalysis };
    const initialVerdict = initialAnalysis.verdict;
    const domVerdict = domAnalysis.suggestedVerdict;
    
    // Track validation details
    result.domVideoValidation = {
      performed: true,
      domAnalysisAvailable: !!domAnalysis,
      hasFailureVideo: hasFailureVideo,
      domIndicators: domAnalysis.indicators || [],
      domErrorMessages: domAnalysis.errorMessages || [],
      initialVerdict: initialVerdict,
      domSuggestedVerdict: domVerdict,
      validationResult: 'CONFIRMED'
    };

    // If DOM and initial verdict agree, boost confidence
    if (domVerdict && domVerdict === initialVerdict) {
      result.confidence = Math.min(95, result.confidence + 10);
      result.domVideoValidation.validationResult = 'CONFIRMED';
      result.justification.evidence.push(
        `✅ DOM Analysis confirms: ${domAnalysis.reason}`
      );
      return result;
    }

    // If DOM suggests different verdict with high confidence, flag for review
    if (domVerdict && domVerdict !== initialVerdict && domAnalysis.confidence >= 75) {
      // Serious conflict - change to NEEDS_REVIEW or update verdict
      if (domAnalysis.confidence > result.confidence) {
        // DOM analysis is more confident - update verdict
        result.verdict = domVerdict;
        result.confidence = domAnalysis.confidence;
        result.domVideoValidation.validationResult = 'OVERRIDDEN_BY_DOM';
        result.justification.evidence.push(
          `⚠️ DOM Analysis overrides initial verdict: ${domAnalysis.reason}`
        );
        
        // Update category based on new verdict
        if (domVerdict === 'PRODUCT_ISSUE') {
          result.category = domAnalysis.hasServerError ? 'Server Error (DOM Verified)' : 
                           domAnalysis.hasErrorModal ? 'Error Modal (DOM Verified)' : 
                           'Product Issue (DOM Verified)';
        } else if (domVerdict === 'AUTOMATION_ISSUE') {
          result.category = 'Form Validation (DOM Verified)';
        }
        
      } else {
        // Both have similar confidence - flag for review
        result.domVideoValidation.validationResult = 'CONFLICTING';
        result.justification.evidence.push(
          `⚠️ DOM Analysis suggests different verdict: ${domAnalysis.reason}`,
          `Manual review recommended to resolve conflict`
        );
        
        // If the conflict is significant, bump to NEEDS_REVIEW
        if (Math.abs(domAnalysis.confidence - result.confidence) < 15) {
          result.verdict = 'NEEDS_REVIEW';
          result.confidence = 65;
          result.category = 'Conflicting Analysis Results';
        }
      }
    }

    // Add video indicator note
    if (hasFailureVideo) {
      result.justification.evidence.push(
        `📹 Failure video available for manual verification`
      );
    }

    return result;
  }

  async function analyzeAllFailures() {
    const failures = extractAllFailureRows();
    const results = [];

    for (const failure of failures) {
      const combinedText = `${failure.failureText} ${failure.reasonText} ${failure.fullText}`;
      // Extract case description from fullText for better analysis
      const caseDescMatch = failure.fullText.match(/Case Description\s*:\s*([\s\S]+?)(?=\n\s*\d\.|Additional|API_DETAILS|$)/i);
      const caseDescription = caseDescMatch ? caseDescMatch[1] : '';
      
      // Initial text-based analysis (with expected/found values for assertion mismatch detection)
      let analysis = analyzeFailure(combinedText, caseDescription, failure.expectedValue || '', failure.foundValue || '');
      
      // DOM validation (async) - only for ambiguous or high-impact verdicts
      if (failure.domLink && (analysis.verdict !== 'AUTOMATION_ISSUE' || analysis.confidence < 85)) {
        try {
          const domAnalysis = await analyzeDomContent(failure.domLink);
          if (domAnalysis) {
            analysis = validateVerdictWithDomVideo(analysis, domAnalysis, !!failure.failureVideoLink);
          }
        } catch (e) {
          console.log('AFI: DOM validation skipped:', e.message);
        }
      }
      
      results.push({
        ...failure,
        analysis,
        caseDescription: caseDescription.substring(0, 500)
      });
    }

    return results;
  }

  // ============================================
  // UI HELPERS
  // ============================================

  function getVerdictEmoji(verdict) {
    switch(verdict) {
      case 'PRODUCT_ISSUE': return '🔴';
      case 'AUTOMATION_ISSUE': return '🟡';
      case 'CONFLICTING_SIGNALS': return '🟣';
      case 'NEEDS_REVIEW': return '🔵';
      default: return '⚪';
    }
  }

  function getVerdictLabel(verdict) {
    switch(verdict) {
      case 'PRODUCT_ISSUE': return 'Product Issue';
      case 'AUTOMATION_ISSUE': return 'Automation Issue';
      case 'CONFLICTING_SIGNALS': return 'Conflicting Signals';
      case 'NEEDS_REVIEW': return 'Needs Review';
      default: return 'Unknown';
    }
  }

  function getVerdictColor(verdict) {
    switch(verdict) {
      case 'PRODUCT_ISSUE': return '#ff4444';
      case 'AUTOMATION_ISSUE': return '#ffbb33';
      case 'CONFLICTING_SIGNALS': return '#a855f7'; // Purple for conflicts
      case 'NEEDS_REVIEW': return '#33b5e5';
      default: return '#999999';
    }
  }

  // Handle user decision for conflicting signals
  function handleConflictDecision(result, index, decision) {
    const selectedAnalysis = decision === 'PRODUCT_ISSUE' 
      ? result.analysis.conflictingAnalyses.productAnalysis 
      : result.analysis.conflictingAnalyses.automationAnalysis;
    
    // Update the result's analysis with the user's decision
    result.analysis.verdict = selectedAnalysis.verdict;
    result.analysis.category = selectedAnalysis.category;
    result.analysis.confidence = selectedAnalysis.confidence;
    result.analysis.matchedPattern = selectedAnalysis.matchedPattern;
    result.analysis.justification = selectedAnalysis.justification;
    result.analysis.userDecision = decision;
    result.analysis.wasConflicting = true;
    
    if (selectedAnalysis.severity) {
      result.analysis.severity = selectedAnalysis.severity;
    }
    if (selectedAnalysis.suggestion) {
      result.analysis.suggestion = selectedAnalysis.suggestion;
    }
    
    // Update the UI for this result
    const resultEl = document.getElementById(`afi-row-${index}`);
    if (resultEl) {
      // Update border color
      resultEl.style.borderColor = getVerdictColor(decision);
      
      // Update header
      const header = resultEl.querySelector('.afi-result-header');
      if (header) {
        const nameSpan = header.querySelector('.afi-result-name');
        const verdictSpan = header.querySelector('span:last-child');
        if (nameSpan) {
          nameSpan.innerHTML = `${getVerdictEmoji(decision)} #${index + 1} ${escapeHtml(result.caseName)}`;
        }
        if (verdictSpan) {
          verdictSpan.textContent = getVerdictLabel(decision);
          verdictSpan.style.color = getVerdictColor(decision);
        }
      }
      
      // Update category
      const categoryEl = resultEl.querySelector('.afi-result-category');
      if (categoryEl) {
        categoryEl.textContent = selectedAnalysis.category;
      }
      
      // Remove the conflict container and show a confirmation
      const conflictContainer = resultEl.querySelector('.afi-conflict-container');
      if (conflictContainer) {
        conflictContainer.innerHTML = `
          <div style="text-align: center; padding: 8px; background: ${getVerdictColor(decision)}22; border-radius: 6px; border: 1px solid ${getVerdictColor(decision)};">
            <span style="color: ${getVerdictColor(decision)}; font-weight: bold;">
              ${getVerdictEmoji(decision)} Classified as ${getVerdictLabel(decision)} by user
            </span>
          </div>
        `;
      }
    }
    
    // Update global results
    if (window.AFI_RESULTS && window.AFI_RESULTS[index]) {
      window.AFI_RESULTS[index] = result;
    }
    
    // Update stats in header
    updatePanelStats();
    
    console.log(`🟣 Conflict resolved: Row ${index + 1} classified as ${decision} by user`);
  }
  
  // Update panel statistics after user decision
  function updatePanelStats() {
    if (!window.AFI_RESULTS) return;
    
    const counts = { PRODUCT_ISSUE: 0, AUTOMATION_ISSUE: 0, CONFLICTING_SIGNALS: 0, NEEDS_REVIEW: 0 };
    window.AFI_RESULTS.forEach(r => {
      counts[r.analysis.verdict] = (counts[r.analysis.verdict] || 0) + 1;
    });
    
    // Update stats display
    const statsEl = document.querySelector('#afi-panel .afi-stats');
    if (statsEl) {
      const productStat = statsEl.querySelector('.stat-product .stat-value');
      const automationStat = statsEl.querySelector('.stat-automation .stat-value');
      const conflictStat = statsEl.querySelector('.stat-conflict .stat-value');
      const reviewStat = statsEl.querySelector('.stat-review .stat-value');
      
      if (productStat) productStat.textContent = counts.PRODUCT_ISSUE;
      if (automationStat) automationStat.textContent = counts.AUTOMATION_ISSUE;
      if (conflictStat) conflictStat.textContent = counts.CONFLICTING_SIGNALS;
      if (reviewStat) reviewStat.textContent = counts.NEEDS_REVIEW;
    }
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================
  // UI PANEL CREATION
  // ============================================

  function createPanel(results) {
    const existingPanel = document.getElementById(CONFIG.panelId);
    if (existingPanel) existingPanel.remove();
    
    const existingBadge = document.getElementById('afi-minimize-badge');
    if (existingBadge) existingBadge.remove();

    const counts = { PRODUCT_ISSUE: 0, AUTOMATION_ISSUE: 0, CONFLICTING_SIGNALS: 0, NEEDS_REVIEW: 0 };
    results.forEach(r => {
      counts[r.analysis.verdict] = (counts[r.analysis.verdict] || 0) + 1;
    });

    let overallVerdict = 'NEEDS_REVIEW';
    if (counts.CONFLICTING_SIGNALS > 0) overallVerdict = 'CONFLICTING_SIGNALS';
    else if (counts.PRODUCT_ISSUE > 0) overallVerdict = 'PRODUCT_ISSUE';
    else if (counts.AUTOMATION_ISSUE > 0) overallVerdict = 'AUTOMATION_ISSUE';

    const panel = document.createElement('div');
    panel.id = CONFIG.panelId;
    panel.innerHTML = `
      <style>
        #${CONFIG.panelId} {
          position: fixed;
          top: 10px;
          right: 10px;
          width: 380px;
          max-height: 85vh;
          background: #1a1a2e;
          color: #eee;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
          z-index: 99999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 13px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        #${CONFIG.panelId} .afi-header {
          background: linear-gradient(135deg, #16213e 0%, #0f3460 100%);
          padding: 14px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #333;
        }
        #${CONFIG.panelId} .afi-title {
          font-weight: 600;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        #${CONFIG.panelId} .afi-close {
          background: none;
          border: none;
          color: #888;
          font-size: 20px;
          cursor: pointer;
          padding: 0 4px;
        }
        #${CONFIG.panelId} .afi-close:hover { color: #fff; }
        #${CONFIG.panelId} .afi-summary {
          padding: 16px;
          background: ${getVerdictColor(overallVerdict)}22;
          border-bottom: 1px solid #333;
        }
        #${CONFIG.panelId} .afi-verdict {
          font-size: 18px;
          font-weight: 700;
          color: ${getVerdictColor(overallVerdict)};
          margin-bottom: 8px;
        }
        #${CONFIG.panelId} .afi-counts {
          display: flex;
          gap: 12px;
          font-size: 12px;
          margin-bottom: 10px;
        }
        #${CONFIG.panelId} .afi-count { display: flex; align-items: center; gap: 4px; }
        #${CONFIG.panelId} .afi-actions {
          display: flex;
          gap: 8px;
          margin-top: 10px;
        }
        #${CONFIG.panelId} .afi-btn {
          padding: 8px 12px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.2s;
        }
        #${CONFIG.panelId} .afi-btn-primary {
          background: #4CAF50;
          color: white;
        }
        #${CONFIG.panelId} .afi-btn-primary:hover { background: #45a049; }
        #${CONFIG.panelId} .afi-btn-secondary {
          background: #2196F3;
          color: white;
        }
        #${CONFIG.panelId} .afi-btn-secondary:hover { background: #1976D2; }
        #${CONFIG.panelId} .afi-results {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }
        #${CONFIG.panelId} .afi-result {
          background: #16213e;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 8px;
          border-left: 3px solid;
          cursor: pointer;
          transition: all 0.2s;
        }
        #${CONFIG.panelId} .afi-result:hover {
          background: #1e2a4a;
          transform: translateX(3px);
        }
        #${CONFIG.panelId} .afi-result-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }
        #${CONFIG.panelId} .afi-result-name {
          font-weight: 600;
          font-size: 12px;
          color: #ccc;
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        #${CONFIG.panelId} .afi-result-category {
          font-size: 11px;
          color: #888;
          margin-bottom: 4px;
        }
        #${CONFIG.panelId} .afi-result-failure {
          font-size: 11px;
          color: #aaa;
          margin: 6px 0;
          padding: 6px;
          background: #0f1525;
          border-radius: 4px;
          max-height: 60px;
          overflow: hidden;
        }
        #${CONFIG.panelId} .afi-result-actions {
          display: flex;
          gap: 6px;
          margin-top: 8px;
          flex-wrap: wrap;
        }
        #${CONFIG.panelId} .afi-action-btn {
          padding: 4px 8px;
          font-size: 10px;
          background: #2a3a5e;
          border: 1px solid #3a4a6e;
          border-radius: 4px;
          color: #aaa;
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
        }
        #${CONFIG.panelId} .afi-action-btn:hover {
          background: #3a4a6e;
          color: #fff;
        }
        #${CONFIG.panelId} .afi-result-suggestion {
          font-size: 11px;
          color: #6c9;
          margin-top: 6px;
          padding: 6px 8px;
          background: #1a3a2a;
          border-radius: 4px;
        }
        #${CONFIG.panelId} .afi-total {
          font-size: 11px;
          color: #888;
          padding: 8px 12px;
          background: #0f1525;
          text-align: center;
          border-bottom: 1px solid #333;
        }
        .afi-minimize-badge {
          position: fixed;
          top: 10px;
          right: 10px;
          padding: 10px 16px;
          background: ${getVerdictColor(overallVerdict)};
          color: #fff;
          border-radius: 8px;
          cursor: grab;
          font-weight: 600;
          font-size: 13px;
          z-index: 99998;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          display: none;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          user-select: none;
        }
        .afi-minimize-badge:active {
          cursor: grabbing;
        }
        #${CONFIG.panelId} .afi-deep-result {
          margin-top: 8px;
          padding: 8px;
          background: #0a0f1a;
          border-radius: 4px;
          font-size: 10px;
          border-left: 2px solid #4CAF50;
        }
      </style>
      <div class="afi-header">
        <span class="afi-title">🔍 Failure Intelligence v3</span>
        <div style="display:flex;gap:8px;">
          <button class="afi-close" id="afi-minimize-btn" title="Minimize">−</button>
          <button class="afi-close" id="afi-close-btn" title="Close" style="background:#d9534f;">✕</button>
        </div>
      </div>
      <div class="afi-summary">
        <div class="afi-verdict">
          ${getVerdictEmoji(overallVerdict)} ${getVerdictLabel(overallVerdict)}
        </div>
        <div class="afi-counts">
          <span class="afi-count">🔴 ${counts.PRODUCT_ISSUE} Product</span>
          <span class="afi-count">🟡 ${counts.AUTOMATION_ISSUE} Automation</span>
          <span class="afi-count">� ${counts.CONFLICTING_SIGNALS} Conflicting</span>
          <span class="afi-count">�🔵 ${counts.NEEDS_REVIEW} Review</span>
        </div>
        <div class="afi-actions">
          <button class="afi-btn afi-btn-primary" id="afi-open-full">📊 Full Report</button>
          <button class="afi-btn afi-btn-secondary" id="afi-refresh">🔄 Refresh</button>
          <button class="afi-btn" id="afi-report-verified" style="background:#6366f1;color:white;">📋 Mark As Completed</button>
        </div>
      </div>
      <div class="afi-total">📋 Total: ${results.length} failure rows (showing all)</div>
      <div class="afi-results" id="afi-results">
        ${results.map((r, i) => createResultCard(r, i)).join('')}
      </div>
    `;

    document.body.appendChild(panel);

    // Add minimize button
    const minimizeBtn = document.createElement('div');
    minimizeBtn.id = 'afi-minimize-badge';
    minimizeBtn.className = 'afi-minimize-badge';
    minimizeBtn.innerHTML = `${getVerdictEmoji(overallVerdict)} ${results.length} Issues`;
    document.body.appendChild(minimizeBtn);

    // Event handlers
    document.getElementById('afi-minimize-btn').addEventListener('click', () => {
      panel.style.display = 'none';
      minimizeBtn.style.display = 'block';
    });

    document.getElementById('afi-close-btn').addEventListener('click', () => {
      panel.remove();
      minimizeBtn.remove();
    });

    // Drag functionality for minimize badge
    let isDragging = false;
    let dragStartX, dragStartY, badgeStartX, badgeStartY;
    let hasMoved = false;

    minimizeBtn.addEventListener('mousedown', (e) => {
      isDragging = true;
      hasMoved = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = minimizeBtn.getBoundingClientRect();
      badgeStartX = rect.left;
      badgeStartY = rect.top;
      minimizeBtn.style.right = 'auto';
      minimizeBtn.style.left = badgeStartX + 'px';
      minimizeBtn.style.top = badgeStartY + 'px';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - dragStartX;
      const deltaY = e.clientY - dragStartY;
      
      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        hasMoved = true;
      }
      
      let newX = badgeStartX + deltaX;
      let newY = badgeStartY + deltaY;
      
      // Keep within viewport bounds
      const badgeRect = minimizeBtn.getBoundingClientRect();
      newX = Math.max(0, Math.min(newX, window.innerWidth - badgeRect.width));
      newY = Math.max(0, Math.min(newY, window.innerHeight - badgeRect.height));
      
      minimizeBtn.style.left = newX + 'px';
      minimizeBtn.style.top = newY + 'px';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Click to expand (only if not dragged)
    minimizeBtn.addEventListener('click', () => {
      if (!hasMoved) {
        panel.style.display = 'flex';
        minimizeBtn.style.display = 'none';
      }
    });

    document.getElementById('afi-open-full').addEventListener('click', () => {
      openFullReport(results);
    });

    document.getElementById('afi-refresh').addEventListener('click', () => {
      init();
    });

    // Report Verified button - two-step: first mark as completed, then show survey
    const reportVerifiedBtn = document.getElementById('afi-report-verified');
    reportVerifiedBtn.addEventListener('click', () => {
      if (reportVerifiedBtn.dataset.completed !== 'true') {
        // First click: Mark as completed
        reportVerifiedBtn.dataset.completed = 'true';
        reportVerifiedBtn.innerHTML = '✅ Report Verified';
        reportVerifiedBtn.style.background = '#059669';
        
        // Store verification status
        markReportVerified(false);
        
        // Update header to show verified badge
        updateHeaderWithVerifiedBadge(false);
        
        // Minimize the panel
        panel.style.display = 'none';
        minimizeBtn.style.display = 'block';
        minimizeBtn.innerHTML = '✅ Report Verified - Click to give feedback';
        minimizeBtn.style.background = '#059669';
        
        // Show confirmation toast
        const toast = document.createElement('div');
        toast.style.cssText = `
          position: fixed;
          bottom: 80px;
          right: 20px;
          background: #059669;
          color: white;
          padding: 12px 20px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          z-index: 100003;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          animation: slideIn 0.3s ease-out;
        `;
        toast.innerHTML = '✅ Report verified! Click the badge to share feedback.';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
      } else {
        // Second click: Show feedback survey
        showSatisfactionSurvey(counts);
      }
    });

    // Add click handlers for each result row
    results.forEach((r, i) => {
      const resultEl = document.getElementById(`afi-row-${i}`);
      if (resultEl) {
        // Click to scroll to row
        resultEl.addEventListener('click', (e) => {
          if (e.target.closest('.afi-action-btn')) return;
          if (r.element) {
            r.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            r.element.style.outline = '3px solid ' + getVerdictColor(r.analysis.verdict);
            r.element.style.outlineOffset = '2px';
            setTimeout(() => { 
              r.element.style.outline = ''; 
              r.element.style.outlineOffset = '';
            }, 3000);
          }
        });
        
        // Deep analyze button
        const analyzeBtn = resultEl.querySelector('.afi-deep-analyze');
        if (analyzeBtn) {
          analyzeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await performDeepAnalysis(r, i);
          });
        }
        
        // View history button
        const historyBtn = resultEl.querySelector('.afi-view-history');
        if (historyBtn) {
          historyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openCaseHistory(r);
          });
        }
        
        // Justification button
        const justificationBtn = resultEl.querySelector('.afi-justification-btn');
        if (justificationBtn) {
          justificationBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showJustificationModal(r, i);
          });
        }
        
        // Playwright MCP prompt button
        const playwrightBtn = resultEl.querySelector('.afi-playwright-btn');
        if (playwrightBtn) {
          playwrightBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showPlaywrightPromptModal(r, i);
          });
        }
        
        // Decision buttons for conflicting signals
        const decideProductBtn = resultEl.querySelector('.afi-decide-product');
        if (decideProductBtn) {
          decideProductBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleConflictDecision(r, i, 'PRODUCT_ISSUE');
          });
        }
        
        const decideAutomationBtn = resultEl.querySelector('.afi-decide-automation');
        if (decideAutomationBtn) {
          decideAutomationBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleConflictDecision(r, i, 'AUTOMATION_ISSUE');
          });
        }
        
        // Report Incorrect button (Self-Learning Feedback)
        const reportIncorrectBtn = resultEl.querySelector('.afi-report-incorrect');
        if (reportIncorrectBtn) {
          reportIncorrectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showFeedbackModal(r, i);
          });
        }
      }
    });

    // Store results globally
    window.AFI_RESULTS = results;
  }

  function createResultCard(r, i) {
    // Check if this is a conflicting signals result
    const isConflicting = r.analysis.verdict === 'CONFLICTING_SIGNALS' && r.analysis.conflictingAnalyses;
    
    // Check if DOM validation was performed
    const domValidation = r.analysis.domVideoValidation;
    const domValidationBadge = domValidation ? `
      <div style="margin-top:6px;font-size:10px;padding:4px 8px;border-radius:4px;display:inline-flex;align-items:center;gap:4px;
        background:${domValidation.validationResult === 'CONFIRMED' ? '#1a3a1a' : domValidation.validationResult === 'OVERRIDDEN_BY_DOM' ? '#3a2a1a' : domValidation.validationResult === 'CONFLICTING' ? '#3a1a3a' : '#2a2a2a'};
        border:1px solid ${domValidation.validationResult === 'CONFIRMED' ? '#5cb85c' : domValidation.validationResult === 'OVERRIDDEN_BY_DOM' ? '#f0ad4e' : domValidation.validationResult === 'CONFLICTING' ? '#a855f7' : '#666'};">
        <span style="color:${domValidation.validationResult === 'CONFIRMED' ? '#5cb85c' : domValidation.validationResult === 'OVERRIDDEN_BY_DOM' ? '#f0ad4e' : '#a855f7'};">
          ${domValidation.validationResult === 'CONFIRMED' ? '✅ DOM Verified' : domValidation.validationResult === 'OVERRIDDEN_BY_DOM' ? '⚠️ DOM Override' : '⚡ DOM Check'}</span>
        ${domValidation.hasFailureVideo ? '<span style="color:#58a6ff;margin-left:4px;">📹</span>' : ''}
      </div>
    ` : '';
    
    // Generate conflicting signals UI if applicable
    const conflictingUI = isConflicting ? `
      <div class="afi-conflict-container" style="margin-top: 10px; padding: 10px; background: #2a2040; border-radius: 8px; border: 1px solid #a855f7;">
        <div style="font-size: 11px; color: #a855f7; margin-bottom: 8px; font-weight: bold;">⚠️ CONFLICTING SIGNALS - Please decide:</div>
        
        <div style="display: flex; gap: 8px; flex-direction: column;">
          <!-- Product Issue Option -->
          <div class="afi-conflict-option" style="background: #331a1a; border: 1px solid #ff4444; border-radius: 6px; padding: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span style="color: #ff4444; font-weight: bold; font-size: 11px;">🔴 Product Issue</span>
                <div style="font-size: 10px; color: #ccc; margin-top: 4px;">${r.analysis.conflictingAnalyses.productAnalysis.justification.evidence[0]}</div>
              </div>
              <button class="afi-decide-btn afi-decide-product" data-index="${i}" 
                style="background: #ff4444; color: white; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 10px;">
                Mark as Product
              </button>
            </div>
          </div>
          
          <!-- Automation Issue Option -->
          <div class="afi-conflict-option" style="background: #332b1a; border: 1px solid #ffbb33; border-radius: 6px; padding: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span style="color: #ffbb33; font-weight: bold; font-size: 11px;">🟡 Automation Issue</span>
                <div style="font-size: 10px; color: #ccc; margin-top: 4px;">${r.analysis.conflictingAnalyses.automationAnalysis.justification.evidence[0]}</div>
              </div>
              <button class="afi-decide-btn afi-decide-automation" data-index="${i}"
                style="background: #ffbb33; color: #000; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 10px;">
                Mark as Automation
              </button>
            </div>
          </div>
        </div>
      </div>
    ` : '';
    
    return `
      <div class="afi-result" id="afi-row-${i}" style="border-color: ${getVerdictColor(r.analysis.verdict)}">
        <div class="afi-result-header">
          <span class="afi-result-name" title="${escapeHtml(r.caseName)}">${getVerdictEmoji(r.analysis.verdict)} #${i + 1} ${escapeHtml(r.caseName)}</span>
          <span style="color: ${getVerdictColor(r.analysis.verdict)}; font-size: 11px;">${getVerdictLabel(r.analysis.verdict)}</span>
        </div>
        <div class="afi-result-category">${r.analysis.category}</div>
        ${r.failureText ? `<div class="afi-result-failure">${escapeHtml(r.failureText.substring(0, 150))}${r.failureText.length > 150 ? '...' : ''}</div>` : ''}
        <div style="font-size:10px;color:#666;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <span>Confidence: ${r.analysis.confidence}%</span>
          ${domValidationBadge}
        </div>
        ${r.analysis.suggestion ? `<div class="afi-result-suggestion">💡 ${r.analysis.suggestion}</div>` : ''}
        ${conflictingUI}
        <div class="afi-result-actions">
          <button class="afi-action-btn afi-justification-btn" data-index="${i}" title="Why this classification?">📋 Justification</button>
          <button class="afi-action-btn afi-playwright-btn" data-index="${i}" title="Generate Playwright MCP prompt to replay">🎭 Replay Prompt</button>
          <button class="afi-action-btn afi-deep-analyze" title="Check Case History & Past Results">🔬 Deep Analyze</button>
          <button class="afi-action-btn afi-view-history" title="Open Case History menu">📜 History</button>
          ${r.domLink ? `<a class="afi-action-btn" href="${r.domLink}" target="_blank" title="View ReConstructed DOM">🖼️ DOM</a>` : ''}
          ${r.failureVideoLink ? `<a class="afi-action-btn" href="${r.failureVideoLink}" target="_blank" title="View Failure Video for verification">🎬 Video</a>` : ''}
          <button class="afi-action-btn afi-report-incorrect" data-index="${i}" title="Report incorrect classification" style="background:#4a1d1d;border-color:#ff6b6b;color:#ff6b6b;">🚨 Report</button>
        </div>
      </div>
    `;
  }

  // ============================================
  // FULL REPORT IN NEW TAB
  // ============================================

  function openFullReport(results) {
    const reportHtml = generateFullReportHtml(results);
    const blob = new Blob([reportHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  function generateFullReportHtml(results) {
    const counts = { PRODUCT_ISSUE: 0, AUTOMATION_ISSUE: 0, CONFLICTING_SIGNALS: 0, NEEDS_REVIEW: 0 };
    results.forEach(r => counts[r.analysis.verdict]++);
    
    const sourceUrl = window.location.href;
    const reportDate = new Date().toLocaleString();
    const resultsJson = JSON.stringify(results.map(r => ({
      index: r.index,
      caseName: r.caseName,
      failureText: r.failureText,
      reasonText: r.reasonText,
      fullText: r.fullText,
      verdict: r.analysis.verdict,
      category: r.analysis.category,
      confidence: r.analysis.confidence,
      suggestion: r.analysis.suggestion,
      justification: r.analysis.justification,
      domLink: r.domLink,
      failureVideoLink: r.failureVideoLink,
      idealVideoLink: r.idealVideoLink
    })));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Failure Intelligence Report - ${new Date().toLocaleDateString()}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117;
      color: #e6edf3;
      padding: 20px;
      line-height: 1.5;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    .header {
      background: linear-gradient(135deg, #1a1f35 0%, #141d2e 100%);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .header h1 { font-size: 28px; margin-bottom: 16px; }
    .stats { display: flex; gap: 24px; flex-wrap: wrap; }
    .stat {
      background: #161b22;
      padding: 16px 24px;
      border-radius: 8px;
      border-left: 4px solid;
    }
    .stat-product { border-color: #ff4444; }
    .stat-automation { border-color: #ffbb33; }
    .stat-conflict { border-color: #a855f7; }
    .stat-review { border-color: #33b5e5; }
    .stat-number { font-size: 32px; font-weight: 700; }
    .stat-label { font-size: 14px; color: #8b949e; }
    .filters { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
    .filter-btn {
      padding: 10px 20px;
      border: 1px solid #30363d;
      background: #21262d;
      color: #e6edf3;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    }
    .filter-btn:hover, .filter-btn.active { background: #30363d; border-color: #8b949e; }
    .filter-btn.product.active { border-color: #ff4444; background: #ff444422; }
    .filter-btn.automation.active { border-color: #ffbb33; background: #ffbb3322; }
    .filter-btn.conflict.active { border-color: #a855f7; background: #a855f722; }
    .filter-btn.review.active { border-color: #33b5e5; background: #33b5e522; }
    .table-container { background: #161b22; border-radius: 12px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th {
      background: #21262d;
      padding: 14px 16px;
      text-align: left;
      font-weight: 600;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #8b949e;
      border-bottom: 1px solid #30363d;
    }
    td {
      padding: 14px 16px;
      border-bottom: 1px solid #21262d;
      font-size: 13px;
      vertical-align: top;
    }
    tr:hover { background: #1c2128; }
    .verdict-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 11px;
    }
    .verdict-product-issue { background: #ff444422; color: #ff6b6b; }
    .verdict-automation-issue { background: #ffbb3322; color: #ffd93d; }
    .verdict-conflicting-signals { background: #a855f722; color: #c084fc; }
    .verdict-needs-review { background: #33b5e522; color: #33b5e5; }
    .failure-text { max-width: 400px; overflow: hidden; text-overflow: ellipsis; color: #8b949e; }
    .category-tag { background: #30363d; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
    .confidence { color: #8b949e; font-size: 11px; }
    .suggestion { color: #7ee787; font-size: 11px; margin-top: 4px; }
    .row-product-issue { border-left: 3px solid #ff4444; }
    .row-automation-issue { border-left: 3px solid #ffbb33; }
    .row-conflicting-signals { border-left: 3px solid #a855f7; }
    .row-needs-review { border-left: 3px solid #33b5e5; }
    .export-btns { display: flex; gap: 10px; margin-top: 20px; }
    .export-btn {
      padding: 10px 20px;
      background: #238636;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
    }
    .export-btn:hover { background: #2ea043; }
    .hidden { display: none !important; }
    .dom-link { color: #58a6ff; text-decoration: none; font-size: 11px; }
    .dom-link:hover { text-decoration: underline; }
    .justification-cell { font-size: 11px; }
    .justification-reason { color: #9ca3af; margin-bottom: 6px; max-height: 60px; overflow: hidden; text-overflow: ellipsis; }
    .view-full-btn, .replay-btn, .desc-btn {
      background: #21262d;
      border: 1px solid #30363d;
      color: #58a6ff;
      padding: 4px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 10px;
    }
    .view-full-btn:hover, .replay-btn:hover, .desc-btn:hover { background: #30363d; }
    .desc-btn { color: #7ee787; border-color: #238636; }
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
    }
    .modal-content {
      background: #1a1f35;
      border-radius: 12px;
      padding: 24px;
      max-width: 800px;
      width: 90%;
      max-height: 85vh;
      overflow-y: auto;
      border: 2px solid #8b5cf6;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      border-bottom: 1px solid #333;
      padding-bottom: 12px;
    }
    .modal-close {
      background: #333;
      border: none;
      color: #fff;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 18px;
    }
    .copy-btn {
      background: #22c55e;
      border: none;
      color: #fff;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }
    .prompt-box {
      background: #161b22;
      padding: 16px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 400px;
      overflow-y: auto;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔍 Failure Intelligence Report</h1>
      <p style="color: #8b949e; margin-bottom: 16px;">
        Generated: ${reportDate}<br>
        Source: <a href="${sourceUrl}" style="color: #58a6ff;">${sourceUrl.substring(0, 80)}...</a>
      </p>
      <div class="stats">
        <div class="stat stat-product">
          <div class="stat-number">${counts.PRODUCT_ISSUE}</div>
          <div class="stat-label">🔴 Product Issues</div>
        </div>
        <div class="stat stat-automation">
          <div class="stat-number">${counts.AUTOMATION_ISSUE}</div>
          <div class="stat-label">🟡 Automation Issues</div>
        </div>
        <div class="stat stat-conflict" style="border-color: #a855f7;">
          <div class="stat-number">${counts.CONFLICTING_SIGNALS}</div>
          <div class="stat-label">🟣 Conflicting</div>
        </div>
        <div class="stat stat-review">
          <div class="stat-number">${counts.NEEDS_REVIEW}</div>
          <div class="stat-label">🔵 Needs Review</div>
        </div>
        <div class="stat" style="border-color: #8b949e;">
          <div class="stat-number">${results.length}</div>
          <div class="stat-label">📊 Total Failures</div>
        </div>
      </div>
    </div>

    <div class="filters">
      <button class="filter-btn active" data-filter="all">All (${results.length})</button>
      <button class="filter-btn product" data-filter="PRODUCT_ISSUE">🔴 Product (${counts.PRODUCT_ISSUE})</button>
      <button class="filter-btn automation" data-filter="AUTOMATION_ISSUE">🟡 Automation (${counts.AUTOMATION_ISSUE})</button>
      <button class="filter-btn conflict" data-filter="CONFLICTING_SIGNALS">🟣 Conflicting (${counts.CONFLICTING_SIGNALS})</button>
      <button class="filter-btn review" data-filter="NEEDS_REVIEW">🔵 Review (${counts.NEEDS_REVIEW})</button>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Test Case</th>
            <th>Verdict</th>
            <th>Category</th>
            <th>Failure Details</th>
            <th>Conf.</th>
            <th>Justification</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="results-body">
          ${results.map((r, i) => {
            const justification = r.analysis.justification || {};
            return `
            <tr class="result-row row-${r.analysis.verdict.toLowerCase().replace('_', '-')}" data-verdict="${r.analysis.verdict}" data-index="${i}">
              <td>${i + 1}</td>
              <td>
                <strong>${escapeHtml(r.caseName)}</strong>
                <div style="margin-top:6px;"><button class="desc-btn" onclick="showCaseDescription(${i})" title="View Case Description">📄 View Case Description</button></div>
              </td>
              <td>
                <span class="verdict-badge verdict-${r.analysis.verdict.toLowerCase().replace('_', '-')}">
                  ${getVerdictEmoji(r.analysis.verdict)} ${getVerdictLabel(r.analysis.verdict)}
                </span>
              </td>
              <td><span class="category-tag">${r.analysis.category}</span></td>
              <td>
                <div class="failure-text">${escapeHtml((r.failureText || r.reasonText || 'N/A').substring(0, 200))}</div>
                ${r.analysis.suggestion ? `<div class="suggestion">💡 ${r.analysis.suggestion}</div>` : ''}
              </td>
              <td><span class="confidence">${r.analysis.confidence}%</span></td>
              <td>
                <div class="justification-cell">
                  <div class="justification-reason">${escapeHtml(justification.reason || r.analysis.suggestion || 'Pattern matched')}</div>
                  <button class="view-full-btn" onclick="showFullJustification(${i})">📋 View Full</button>
                </div>
              </td>
              <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                  ${r.domLink ? `<a class="dom-link" href="${r.domLink}" target="_blank" title="View DOM">🖼️</a>` : ''}
                  ${r.failureVideoLink ? `<a class="dom-link" href="${r.failureVideoLink}" target="_blank" title="View Video">🎬</a>` : ''}
                  <button class="replay-btn" onclick="showPlaywrightPrompt(${i})" title="Generate Playwright MCP Prompt">🎭</button>
                  <button class="replay-btn" onclick="showFeedbackForm(${i})" title="Report incorrect classification" style="border-color:#ff6b6b;color:#ff6b6b;">🚨</button>
                </div>
              </td>
            </tr>
          `;}).join('')}
        </tbody>
      </table>
    </div>

    <div class="export-btns">
      <button class="export-btn" onclick="exportCSV()">📥 Export CSV</button>
      <button class="export-btn" onclick="window.print()">🖨️ Print Report</button>
      <button class="export-btn" onclick="showFeedbackSummary()" style="background:#7c3aed;">💬 Feedback Hub</button>
    </div>
  </div>

  <script>
    const resultsData = ${resultsJson};
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const filter = btn.dataset.filter;
        document.querySelectorAll('.result-row').forEach(row => {
          if (filter === 'all' || row.dataset.verdict === filter) {
            row.classList.remove('hidden');
          } else {
            row.classList.add('hidden');
          }
        });
      });
    });

    function exportCSV() {
      const rows = [['#', 'Test Case', 'Verdict', 'Category', 'Failure', 'Reason', 'Confidence', 'Justification', 'DOM Link', 'Video Link']];
      resultsData.forEach((r, i) => {
        rows.push([
          i + 1, 
          r.caseName, 
          r.verdict, 
          r.category, 
          (r.failureText || '').replace(/,/g, ';').replace(/\\n/g, ' ').substring(0, 200),
          (r.reasonText || '').replace(/,/g, ';').replace(/\\n/g, ' ').substring(0, 200),
          r.confidence + '%',
          r.justification?.reason || r.suggestion || 'Pattern matched',
          r.domLink || '',
          r.failureVideoLink || ''
        ]);
      });
      const csvContent = rows.map(row => row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',')).join('\\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'failure-intelligence-report-${new Date().toISOString().split('T')[0]}.csv';
      a.click();
    }

    function showFullJustification(index) {
      const r = resultsData[index];
      const j = r.justification || {};
      const verdictColor = r.verdict === 'PRODUCT_ISSUE' ? '#f85149' : r.verdict === 'AUTOMATION_ISSUE' ? '#d29922' : '#58a6ff';
      const verdictLabel = r.verdict === 'PRODUCT_ISSUE' ? 'Product Issue' : r.verdict === 'AUTOMATION_ISSUE' ? 'Automation Issue' : 'Needs Review';
      
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = \`
        <div class="modal-content" style="border-color: \${verdictColor};">
          <div class="modal-header">
            <h2 style="margin:0;color:#fff;font-size:18px;">📋 Classification Justification</h2>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
          </div>
          <div style="margin-bottom:16px;">
            <div style="color:#888;font-size:11px;text-transform:uppercase;margin-bottom:4px;">Test Case</div>
            <div style="color:#e6edf3;font-size:14px;">#\${index + 1} \${r.caseName}</div>
          </div>
          <div style="margin-bottom:16px;">
            <div style="color:#888;font-size:11px;text-transform:uppercase;margin-bottom:4px;">Verdict</div>
            <span style="display:inline-block;padding:6px 16px;background:\${verdictColor}22;border:1px solid \${verdictColor};border-radius:20px;color:\${verdictColor};font-weight:600;font-size:14px;">\${verdictLabel}</span>
            <span style="color:#888;font-size:12px;margin-left:12px;">Confidence: \${r.confidence}%</span>
          </div>
          <div style="margin-bottom:16px;background:#161b22;padding:16px;border-radius:8px;border-left:4px solid \${verdictColor};">
            <div style="color:#888;font-size:11px;text-transform:uppercase;margin-bottom:8px;">🎯 Main Reason</div>
            <div style="color:#e6edf3;font-size:14px;line-height:1.6;">\${j.reason || r.suggestion || 'Pattern matched'}</div>
          </div>
          \${j.evidence && j.evidence.length > 0 ? \`
            <div style="margin-bottom:16px;">
              <div style="color:#888;font-size:11px;text-transform:uppercase;margin-bottom:8px;">📊 Evidence</div>
              <ul style="color:#e6edf3;font-size:13px;margin:0;padding-left:20px;line-height:1.8;">
                \${j.evidence.map(e => '<li>' + e + '</li>').join('')}
              </ul>
            </div>
          \` : ''}
          <div style="margin-bottom:16px;background:#0d1117;padding:16px;border-radius:8px;">
            <div style="color:#888;font-size:11px;text-transform:uppercase;margin-bottom:8px;">💡 Why This Classification?</div>
            <div style="color:#9ca3af;font-size:13px;line-height:1.7;">\${j.whyThisVerdict || 'Based on pattern matching against known automation and product issue signatures.'}</div>
          </div>
        </div>
      \`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }

    function showCaseDescription(index) {
      const r = resultsData[index];
      const verdictColor = r.verdict === 'PRODUCT_ISSUE' ? '#f85149' : r.verdict === 'AUTOMATION_ISSUE' ? '#d29922' : '#58a6ff';
      
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = \`
        <div class="modal-content" style="border-color: \${verdictColor};">
          <div class="modal-header">
            <h2 style="margin:0;color:#fff;font-size:18px;">📄 Case Description</h2>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
          </div>
          <div style="margin-bottom:16px;">
            <div style="color:#888;font-size:11px;text-transform:uppercase;margin-bottom:4px;">Test Case</div>
            <div style="color:#e6edf3;font-size:14px;font-weight:600;">#\${index + 1} \${r.caseName}</div>
          </div>
          <div style="background:#161b22;padding:16px;border-radius:8px;border-left:4px solid \${verdictColor};">
            <div style="color:#888;font-size:11px;text-transform:uppercase;margin-bottom:8px;">Full Description</div>
            <div style="color:#e6edf3;font-size:13px;line-height:1.7;white-space:pre-wrap;max-height:400px;overflow-y:auto;">\${r.fullText || 'No description available'}</div>
          </div>
        </div>
      \`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }

    function showPlaywrightPrompt(index) {
      const r = resultsData[index];
      window._reportRowData = r;
      window._reportRowIndex = index;
      
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = \`
        <div class="modal-content" style="max-width:900px;">
          <div class="modal-header">
            <h2 style="margin:0;color:#fff;font-size:18px;">🎭 Run Test with Playwright MCP</h2>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
          </div>
          
          <div style="margin-bottom:16px;">
            <div style="color:#888;font-size:11px;text-transform:uppercase;margin-bottom:4px;">Test Case</div>
            <div style="color:#e6edf3;font-size:14px;">#\${index + 1} \${r.caseName}</div>
          </div>
          
          <!-- Account Input Section -->
          <div style="background:#0d1117;padding:16px;border-radius:8px;margin-bottom:16px;border:1px solid #30363d;">
            <div style="color:#fbbf24;font-size:12px;font-weight:600;margin-bottom:12px;">🔐 Account Information (Required)</div>
            <p style="color:#9ca3af;font-size:12px;margin-bottom:12px;">Enter account credentials to run this test:</p>
            
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
              <div>
                <label style="color:#888;font-size:11px;display:block;margin-bottom:4px;">Application URL</label>
                <input type="text" id="report-app-url" placeholder="https://your-app.com" style="width:100%;padding:10px 12px;background:#161b22;border:1px solid #30363d;border-radius:6px;color:#e6edf3;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="color:#888;font-size:11px;display:block;margin-bottom:4px;">Username / Email</label>
                <input type="text" id="report-username" placeholder="user@example.com" style="width:100%;padding:10px 12px;background:#161b22;border:1px solid #30363d;border-radius:6px;color:#e6edf3;font-size:13px;box-sizing:border-box;">
              </div>
            </div>
            
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
              <div>
                <label style="color:#888;font-size:11px;display:block;margin-bottom:4px;">Password</label>
                <input type="password" id="report-password" placeholder="••••••••" style="width:100%;padding:10px 12px;background:#161b22;border:1px solid #30363d;border-radius:6px;color:#e6edf3;font-size:13px;box-sizing:border-box;">
              </div>
              <div>
                <label style="color:#888;font-size:11px;display:block;margin-bottom:4px;">Organization (Optional)</label>
                <input type="text" id="report-org" placeholder="company-name" style="width:100%;padding:10px 12px;background:#161b22;border:1px solid #30363d;border-radius:6px;color:#e6edf3;font-size:13px;box-sizing:border-box;">
              </div>
            </div>
            
            <button id="report-generate-btn" style="margin-top:16px;background:#8b5cf6;border:none;color:#fff;padding:10px 20px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:500;width:100%;">🔄 Generate Executable Prompt</button>
          </div>
          
          <!-- Test Reference -->
          <div style="background:#161b22;padding:12px 16px;border-radius:8px;margin-bottom:16px;">
            <div style="color:#888;font-size:11px;text-transform:uppercase;margin-bottom:8px;">📹 Test Reference</div>
            <div style="color:#9ca3af;font-size:12px;line-height:1.6;">
              \${r.idealVideoLink ? '<span style="color:#22c55e;">✅ Ideal Video Available</span> - Prompt will use this to understand correct test flow.<br><a href="' + r.idealVideoLink + '" target="_blank" style="color:#58a6ff;">Watch Ideal Video →</a>' : '<span style="color:#d29922;">⚠️ No Ideal Video</span> - Will use test case description.'}
              \${r.failureVideoLink ? '<br><a href="' + r.failureVideoLink + '" target="_blank" style="color:#f85149;margin-top:4px;display:inline-block;">Watch Failure Video →</a>' : ''}
            </div>
          </div>
          
          <!-- Generated Prompt -->
          <div style="margin-bottom:16px;background:#0d1117;padding:4px;border-radius:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 12px 8px 12px;">
              <div style="color:#888;font-size:11px;text-transform:uppercase;">📝 Executable Prompt</div>
              <button class="copy-btn" onclick="copyPrompt(this)">📋 Copy</button>
            </div>
            <pre class="prompt-box" id="report-prompt-box" style="max-height:250px;">⬆️ Enter account details above and click "Generate Executable Prompt"</pre>
          </div>
          
          <div style="background:#1e293b;padding:12px 16px;border-radius:8px;">
            <div style="color:#fbbf24;font-size:12px;font-weight:500;margin-bottom:6px;">💡 How to Use</div>
            <ol style="color:#9ca3af;font-size:12px;margin:0;padding-left:20px;line-height:1.8;">
              <li>Enter your test account credentials</li>
              <li>Click "Generate Executable Prompt"</li>
              <li>Copy and paste into VS Code Copilot + Playwright MCP</li>
              <li>Copilot will automatically run the test!</li>
            </ol>
          </div>
        </div>
      \`;
      document.body.appendChild(modal);
      
      // Generate button handler
      document.getElementById('report-generate-btn').addEventListener('click', function() {
        const appUrl = document.getElementById('report-app-url').value.trim();
        const username = document.getElementById('report-username').value.trim();
        const password = document.getElementById('report-password').value.trim();
        const org = document.getElementById('report-org').value.trim();
        
        if (!username) {
          alert('Please enter at least a username/email.');
          return;
        }
        
        const prompt = generatePlaywrightPrompt(window._reportRowData, window._reportRowIndex, {appUrl, username, password, org});
        document.getElementById('report-prompt-box').textContent = prompt;
        
        this.textContent = '✅ Prompt Generated!';
        this.style.background = '#22c55e';
        setTimeout(() => { this.textContent = '🔄 Regenerate Prompt'; this.style.background = '#8b5cf6'; }, 2000);
      });
      
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }

    function copyPrompt(btn) {
      const prompt = btn.closest('.modal-content').querySelector('.prompt-box').textContent;
      if (prompt.includes('Enter account details')) {
        alert('Please generate the prompt first.');
        return;
      }
      navigator.clipboard.writeText(prompt).then(() => {
        btn.textContent = '✓ Copied!';
        btn.style.background = '#16a34a';
        setTimeout(() => { btn.textContent = '📋 Copy'; btn.style.background = '#22c55e'; }, 2000);
      });
    }

    function generatePlaywrightPrompt(r, index, account = {}) {
      const caseName = r.caseName || 'Unknown Test Case';
      const failureText = r.failureText || 'No failure text available';
      const reasonText = r.reasonText || '';
      const domLink = r.domLink || '';
      const failureVideoLink = r.failureVideoLink || '';
      const idealVideoLink = r.idealVideoLink || '';
      const verdict = r.verdict || 'UNKNOWN';
      const category = r.category || 'Unknown';
      
      const appUrl = account.appUrl || '[APPLICATION_URL]';
      const username = account.username || '[USERNAME]';
      const password = account.password || '[PASSWORD]';
      const org = account.org || '';
      
      const hasClick = /click|button|submit|select|open|menu/i.test(caseName + failureText);
      const hasInput = /input|fill|type|enter|form|field|text/i.test(caseName + failureText);
      const hasNavigation = /navigate|redirect|page|url|visit/i.test(caseName + failureText);
      const hasValidation = /valid|invalid|error|check|verify/i.test(caseName + failureText);
      
      let prompt = \`EXECUTE THIS TEST CASE USING PLAYWRIGHT MCP:

**Test:** \${caseName}
**Status:** \${verdict === 'PRODUCT_ISSUE' ? '🔴 POTENTIAL BUG' : verdict === 'AUTOMATION_ISSUE' ? '🟡 AUTOMATION ISSUE' : '🟠 NEEDS VERIFICATION'}

---

## STEP 1: LOGIN TO APPLICATION

Navigate to: \${appUrl}
Login with:
- Username: \${username}
- Password: \${password}\${org ? '\\n- Organization: ' + org : ''}

ACTIONS:
1. mcp_playwright_browser_navigate to "\${appUrl}"
2. mcp_playwright_browser_snapshot to find login form
3. mcp_playwright_browser_fill_form with username and password
4. mcp_playwright_browser_click on login/submit button
5. mcp_playwright_browser_wait_for page to load

---

## STEP 2: UNDERSTAND THE TEST STEPS

\`;

      if (idealVideoLink) {
        prompt += \`**IMPORTANT: Watch the IDEAL VIDEO to understand correct test flow:**
\${idealVideoLink}

Replicate the same steps using Playwright MCP.
\`;
      } else {
        prompt += \`**No ideal video. Use test case description:**
Test Case: "\${caseName}"
\`;
      }

      prompt += \`
---

## STEP 3: EXECUTE TEST ACTIONS

Based on "\${caseName}", perform:

\`;

      let stepNum = 1;
      if (hasNavigation) { prompt += stepNum + \`. mcp_playwright_browser_navigate - Go to relevant page\\n\`; stepNum++; }
      prompt += stepNum + \`. mcp_playwright_browser_snapshot - Analyze page\\n\`; stepNum++;
      if (hasClick) { prompt += stepNum + \`. mcp_playwright_browser_click - Click element from test name\\n\`; stepNum++; }
      if (hasInput) { prompt += stepNum + \`. mcp_playwright_browser_fill_form - Enter test data\\n\`; stepNum++; }
      if (hasValidation) { prompt += stepNum + \`. mcp_playwright_browser_snapshot - Check for validation\\n\`; stepNum++; }
      prompt += stepNum + \`. mcp_playwright_browser_take_screenshot - Capture result\\n\`;

      prompt += \`
---

## FAILURE CONTEXT

\\\`\\\`\\\`
\${failureText.substring(0, 350)}\${failureText.length > 350 ? '...' : ''}
\\\`\\\`\\\`
\`;

      if (failureVideoLink) {
        prompt += \`
**Failure Video:** \${failureVideoLink}
\`;
      }

      prompt += \`
---

## STEP 4: VERIFY AND REPORT

After executing:
1. mcp_playwright_browser_take_screenshot
2. Compare with \${idealVideoLink ? 'ideal video' : 'expected behavior'}
3. Report: ✅ Working (automation issue) | ❌ Still failing (product bug) | ⚠️ Different behavior

**AI Classification:** \${verdict === 'PRODUCT_ISSUE' ? '🔴 Product Issue' : verdict === 'AUTOMATION_ISSUE' ? '🟡 Automation Issue' : '🟠 Needs Review'}
**Category:** \${category}\`;

      if (domLink) {
        prompt += \`
**DOM Snapshot:** \${domLink}\`;
      }

      return prompt;
    }

    // ============================================
    // FEEDBACK FUNCTIONS FOR FULL REPORT
    // ============================================

    function showFeedbackForm(index) {
      const r = resultsData[index];
      const verdictColor = r.verdict === 'PRODUCT_ISSUE' ? '#f85149' : r.verdict === 'AUTOMATION_ISSUE' ? '#d29922' : '#58a6ff';
      const verdictLabel = r.verdict === 'PRODUCT_ISSUE' ? 'Product Issue' : r.verdict === 'AUTOMATION_ISSUE' ? 'Automation Issue' : 'Needs Review';
      
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = \`
        <div class="modal-content" style="border-color: #ff6b6b; max-width: 650px;">
          <div class="modal-header">
            <h2 style="margin:0;color:#ff6b6b;font-size:18px;">🚨 Report Incorrect Classification</h2>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
          </div>

          <div style="background:#161b22;padding:14px;border-radius:8px;margin-bottom:16px;">
            <div style="color:#888;font-size:11px;text-transform:uppercase;margin-bottom:6px;">Current Classification</div>
            <div style="display:flex;align-items:center;gap:12px;">
              <span style="display:inline-block;padding:6px 14px;background:\${verdictColor}22;border:1px solid \${verdictColor};border-radius:16px;color:\${verdictColor};font-weight:600;font-size:13px;">\${verdictLabel}</span>
              <span style="color:#666;font-size:12px;">| \${r.category}</span>
            </div>
            <div style="color:#888;margin-top:8px;font-size:12px;">Case: #\${index + 1} \${r.caseName}</div>
          </div>

          <div style="margin-bottom:16px;">
            <label style="color:#ccc;font-size:13px;margin-bottom:8px;display:block;font-weight:500;">
              What should the correct classification be?
            </label>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <label style="display:flex;align-items:center;gap:8px;padding:12px 16px;background:#ff444420;border:2px solid #ff444440;border-radius:8px;cursor:pointer;">
                <input type="radio" name="fb-verdict" value="PRODUCT_ISSUE" style="accent-color:#ff4444;">
                <span style="color:#ff4444;">🔴 Product Issue</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;padding:12px 16px;background:#ffbb3320;border:2px solid #ffbb3340;border-radius:8px;cursor:pointer;">
                <input type="radio" name="fb-verdict" value="AUTOMATION_ISSUE" style="accent-color:#ffbb33;">
                <span style="color:#ffbb33;">🟡 Automation Issue</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;padding:12px 16px;background:#33b5e520;border:2px solid #33b5e540;border-radius:8px;cursor:pointer;">
                <input type="radio" name="fb-verdict" value="OTHER" style="accent-color:#33b5e5;">
                <span style="color:#33b5e5;">🔵 Other / Unclear</span>
              </label>
            </div>
          </div>

          <div style="margin-bottom:16px;">
            <label style="color:#ccc;font-size:13px;margin-bottom:8px;display:block;font-weight:500;">
              Why is this classification incorrect? <span style="color:#ff6b6b;">*</span>
            </label>
            <textarea id="fb-details" placeholder="Please explain why the current classification is wrong..." style="width:100%;min-height:80px;padding:12px;background:#0d1117;border:1px solid #30363d;border-radius:8px;color:#e6edf3;font-size:13px;resize:vertical;box-sizing:border-box;line-height:1.5;"></textarea>
          </div>

          <div style="display:flex;gap:12px;">
            <button onclick="submitFeedback(\${index}, this.closest('.modal-overlay'))" style="flex:1;padding:12px 20px;background:#2563eb;border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:500;cursor:pointer;">📧 Send via Email</button>
            <button onclick="copyFeedback(\${index}, this.closest('.modal-overlay'))" style="flex:1;padding:12px 20px;background:#059669;border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:500;cursor:pointer;">📋 Copy Report</button>
          </div>
        </div>
      \`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }

    function submitFeedback(index, modalEl) {
      const r = resultsData[index];
      const correctedVerdict = document.querySelector('input[name="fb-verdict"]:checked')?.value;
      const details = document.getElementById('fb-details').value.trim();

      if (!correctedVerdict) { alert('Please select the correct classification.'); return; }
      if (!details) { alert('Please explain why the classification is incorrect.'); return; }

      const feedback = generateFeedbackReport(r, index, correctedVerdict, details);
      const subject = encodeURIComponent('[AFI Feedback] Misclassification Report - ' + r.caseName.substring(0, 50));
      const body = encodeURIComponent(feedback);
      
      window.open('mailto:afi-feedback@your-team.com?subject=' + subject + '&body=' + body);
      modalEl.remove();
      showToast('Email client opened with feedback report!');
    }

    function copyFeedback(index, modalEl) {
      const r = resultsData[index];
      const correctedVerdict = document.querySelector('input[name="fb-verdict"]:checked')?.value;
      const details = document.getElementById('fb-details').value.trim();

      if (!correctedVerdict) { alert('Please select the correct classification.'); return; }
      if (!details) { alert('Please explain why the classification is incorrect.'); return; }

      const feedback = generateFeedbackReport(r, index, correctedVerdict, details);
      navigator.clipboard.writeText(feedback).then(() => {
        modalEl.remove();
        showToast('Feedback report copied to clipboard!');
      });
    }

    function generateFeedbackReport(r, index, correctedVerdict, details) {
      return \`
AUTOMATION FAILURE INTELLIGENCE - FEEDBACK REPORT
==================================================

Report Date: \${new Date().toISOString()}
Report URL: \${window.location.href}

TEST CASE INFORMATION:
---------------------
Case Name: \${r.caseName}
Index: #\${index + 1}

CLASSIFICATION DISCREPANCY:
--------------------------
Original Classification: \${r.verdict}
Original Category: \${r.category}
Original Confidence: \${r.confidence}%

Correct Classification: \${correctedVerdict}

USER FEEDBACK:
-------------
\${details}

FAILURE CONTEXT:
---------------
\${r.failureText || 'N/A'}

==================================================
This feedback will help improve the extension's pattern detection.
      \`.trim();
    }

    function showFeedbackSummary() {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = \`
        <div class="modal-content" style="border-color: #7c3aed; max-width: 500px;">
          <div class="modal-header">
            <h2 style="margin:0;color:#a78bfa;font-size:18px;">💬 Feedback Hub</h2>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
          </div>
          
          <div style="text-align:center;padding:20px 0;">
            <div style="font-size:40px;margin-bottom:16px;">📊</div>
            <h3 style="color:#e6edf3;margin-bottom:8px;">Help us improve!</h3>
            <p style="color:#9ca3af;font-size:13px;line-height:1.6;">Use the 🚨 button on any row to report misclassifications. Your feedback helps enhance the extension's accuracy.</p>
          </div>

          <div style="background:#161b22;padding:16px;border-radius:8px;margin-bottom:16px;">
            <div style="color:#888;font-size:11px;text-transform:uppercase;margin-bottom:8px;">Analysis Summary</div>
            <div style="display:flex;justify-content:space-around;text-align:center;">
              <div>
                <div style="font-size:24px;font-weight:700;color:#f85149;">\${resultsData.filter(r => r.verdict === 'PRODUCT_ISSUE').length}</div>
                <div style="font-size:11px;color:#888;">Product</div>
              </div>
              <div>
                <div style="font-size:24px;font-weight:700;color:#d29922;">\${resultsData.filter(r => r.verdict === 'AUTOMATION_ISSUE').length}</div>
                <div style="font-size:11px;color:#888;">Automation</div>
              </div>
              <div>
                <div style="font-size:24px;font-weight:700;color:#58a6ff;">\${resultsData.filter(r => r.verdict === 'NEEDS_REVIEW').length}</div>
                <div style="font-size:11px;color:#888;">Review</div>
              </div>
            </div>
          </div>

          <div style="margin-bottom:16px;">
            <div style="color:#ccc;font-size:13px;margin-bottom:8px;">How helpful was this analysis?</div>
            <div style="display:flex;gap:8px;justify-content:center;">
              \${[1,2,3,4,5].map(n => '<button class="rating-btn" data-rating="' + n + '" style="width:44px;height:44px;border:2px solid #333;background:#161b22;border-radius:10px;font-size:18px;cursor:pointer;">' + ['😞', '😕', '😐', '🙂', '😀'][n-1] + '</button>').join('')}
            </div>
          </div>

          <textarea id="survey-comments" placeholder="Any suggestions for improvement? (optional)" style="width:100%;min-height:60px;padding:10px;background:#0d1117;border:1px solid #30363d;border-radius:8px;color:#e6edf3;font-size:12px;resize:none;box-sizing:border-box;margin-bottom:16px;"></textarea>

          <button onclick="submitSurvey(this.closest('.modal-overlay'))" style="width:100%;padding:12px;background:#7c3aed;border:none;border-radius:8px;color:#fff;font-size:14px;font-weight:500;cursor:pointer;">Submit Feedback</button>
        </div>
      \`;
      document.body.appendChild(modal);
      
      let selectedRating = 0;
      modal.querySelectorAll('.rating-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedRating = parseInt(btn.dataset.rating);
          modal.querySelectorAll('.rating-btn').forEach(b => { b.style.borderColor = '#333'; b.style.background = '#161b22'; });
          btn.style.borderColor = '#7c3aed';
          btn.style.background = '#7c3aed22';
        });
      });
      modal.selectedRating = () => selectedRating;
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }

    function submitSurvey(modalEl) {
      const rating = modalEl.selectedRating ? modalEl.selectedRating() : 0;
      const comments = document.getElementById('survey-comments')?.value?.trim() || '';
      
      if (!rating) { alert('Please select a rating.'); return; }
      
      console.log('Survey submitted:', { rating, comments });
      modalEl.remove();
      showToast('Thank you for your feedback!');
    }

    function showToast(message) {
      const toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#059669;color:white;padding:14px 24px;border-radius:8px;font-size:14px;font-weight:500;z-index:100003;box-shadow:0 4px 20px rgba(0,0,0,0.3);';
      toast.innerHTML = '✅ ' + message;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    }
  </script>
</body>
</html>`;
  }

  // ============================================
  // JUSTIFICATION AND PLAYWRIGHT MODALS
  // ============================================

  function showJustificationModal(rowData, index) {
    const analysis = rowData.analysis;
    const justification = analysis.justification || {};
    
    // Remove existing modal if present
    const existingModal = document.getElementById('afi-modal-overlay');
    if (existingModal) existingModal.remove();
    
    const verdictColor = getVerdictColor(analysis.verdict);
    const verdictLabel = getVerdictLabel(analysis.verdict);
    const verdictEmoji = getVerdictEmoji(analysis.verdict);
    
    const modalHtml = `
      <div id="afi-modal-overlay" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        z-index: 100001;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(4px);
      ">
        <div style="
          background: #1a1f35;
          border-radius: 12px;
          padding: 24px;
          max-width: 700px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
          border: 2px solid ${verdictColor};
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        ">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 12px;">
            <h2 style="margin: 0; color: #fff; font-size: 18px;">
              ${verdictEmoji} Classification Justification
            </h2>
            <button id="afi-modal-close" style="
              background: #333;
              border: none;
              color: #fff;
              width: 32px;
              height: 32px;
              border-radius: 50%;
              cursor: pointer;
              font-size: 18px;
            ">×</button>
          </div>
          
          <div style="margin-bottom: 16px;">
            <div style="color: #888; font-size: 11px; text-transform: uppercase; margin-bottom: 4px;">Test Case</div>
            <div style="color: #e6edf3; font-size: 14px;">#${index + 1} ${escapeHtml(rowData.caseName || 'Unknown')}</div>
          </div>
          
          <div style="margin-bottom: 16px;">
            <div style="color: #888; font-size: 11px; text-transform: uppercase; margin-bottom: 4px;">Verdict</div>
            <div style="
              display: inline-block;
              padding: 6px 16px;
              background: ${verdictColor}22;
              border: 1px solid ${verdictColor};
              border-radius: 20px;
              color: ${verdictColor};
              font-weight: 600;
              font-size: 14px;
            ">${verdictLabel}</div>
            <span style="color: #888; font-size: 12px; margin-left: 12px;">Confidence: ${analysis.confidence}%</span>
          </div>
          
          <div style="margin-bottom: 16px;">
            <div style="color: #888; font-size: 11px; text-transform: uppercase; margin-bottom: 4px;">Category</div>
            <div style="color: #e6edf3; font-size: 14px;">${analysis.category}</div>
          </div>
          
          <div style="margin-bottom: 16px; background: #161b22; padding: 16px; border-radius: 8px; border-left: 4px solid ${verdictColor};">
            <div style="color: #888; font-size: 11px; text-transform: uppercase; margin-bottom: 8px;">🎯 Main Reason</div>
            <div style="color: #e6edf3; font-size: 14px; line-height: 1.6;">${justification.reason || analysis.suggestion || 'Pattern matched: ' + (analysis.matchedPattern || 'N/A')}</div>
          </div>
          
          ${justification.evidence && justification.evidence.length > 0 ? `
            <div style="margin-bottom: 16px;">
              <div style="color: #888; font-size: 11px; text-transform: uppercase; margin-bottom: 8px;">📊 Evidence</div>
              <ul style="color: #e6edf3; font-size: 13px; margin: 0; padding-left: 20px; line-height: 1.8;">
                ${justification.evidence.map(e => `<li>${escapeHtml(e)}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
          
          <div style="margin-bottom: 16px; background: #0d1117; padding: 16px; border-radius: 8px;">
            <div style="color: #888; font-size: 11px; text-transform: uppercase; margin-bottom: 8px;">💡 Why This Classification?</div>
            <div style="color: #9ca3af; font-size: 13px; line-height: 1.7;">${escapeHtml(justification.whyThisVerdict || 'Based on pattern matching against known automation and product issue signatures.')}</div>
          </div>
          
          ${analysis.matchedPattern ? `
            <div style="margin-bottom: 16px;">
              <div style="color: #888; font-size: 11px; text-transform: uppercase; margin-bottom: 4px;">🔍 Matched Pattern</div>
              <code style="color: #58a6ff; font-size: 12px; background: #161b22; padding: 8px 12px; border-radius: 4px; display: block; word-break: break-all;">${escapeHtml(analysis.matchedPattern)}</code>
            </div>
          ` : ''}
          
          ${rowData.failureText ? `
            <div style="margin-bottom: 16px;">
              <div style="color: #888; font-size: 11px; text-transform: uppercase; margin-bottom: 4px;">📝 Failure Text (Excerpt)</div>
              <div style="color: #f85149; font-size: 12px; background: #161b22; padding: 12px; border-radius: 4px; font-family: monospace; max-height: 100px; overflow-y: auto;">${escapeHtml(rowData.failureText.substring(0, 300))}${rowData.failureText.length > 300 ? '...' : ''}</div>
            </div>
          ` : ''}
          
          <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #333; display: flex; gap: 12px; flex-wrap: wrap;">
            ${rowData.domLink ? `<a href="${rowData.domLink}" target="_blank" style="color: #58a6ff; text-decoration: none; font-size: 13px;">🖼️ View DOM</a>` : ''}
            ${rowData.failureVideoLink ? `<a href="${rowData.failureVideoLink}" target="_blank" style="color: #58a6ff; text-decoration: none; font-size: 13px;">🎬 View Video</a>` : ''}
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Close handlers
    document.getElementById('afi-modal-close').addEventListener('click', () => {
      document.getElementById('afi-modal-overlay').remove();
    });
    document.getElementById('afi-modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'afi-modal-overlay') {
        document.getElementById('afi-modal-overlay').remove();
      }
    });
  }

  function showPlaywrightPromptModal(rowData, index) {
    // Remove existing modal if present
    const existingModal = document.getElementById('afi-modal-overlay');
    if (existingModal) existingModal.remove();
    
    // Store rowData globally for regeneration
    window._currentPlaywrightRowData = rowData;
    window._currentPlaywrightIndex = index;
    
    const modalHtml = `
      <div id="afi-modal-overlay" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        z-index: 100001;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(4px);
      ">
        <div style="
          background: #1a1f35;
          border-radius: 12px;
          padding: 24px;
          max-width: 900px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
          border: 2px solid #8b5cf6;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        ">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 12px;">
            <h2 style="margin: 0; color: #fff; font-size: 18px;">
              🎭 Run Test Case with Playwright MCP
            </h2>
            <button id="afi-modal-close" style="
              background: #333;
              border: none;
              color: #fff;
              width: 32px;
              height: 32px;
              border-radius: 50%;
              cursor: pointer;
              font-size: 18px;
            ">×</button>
          </div>
          
          <div style="margin-bottom: 16px;">
            <div style="color: #888; font-size: 11px; text-transform: uppercase; margin-bottom: 4px;">Test Case</div>
            <div style="color: #e6edf3; font-size: 14px;">#${index + 1} ${escapeHtml(rowData.caseName || 'Unknown')}</div>
          </div>
          
          <!-- Account Input Section -->
          <div style="background: #0d1117; padding: 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid #30363d;">
            <div style="color: #fbbf24; font-size: 12px; font-weight: 600; margin-bottom: 12px;">🔐 Account Information (Required)</div>
            <p style="color: #9ca3af; font-size: 12px; margin-bottom: 12px;">Enter the account credentials to run this test case in Playwright MCP:</p>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
              <div>
                <label style="color: #888; font-size: 11px; display: block; margin-bottom: 4px;">Application URL</label>
                <input type="text" id="afi-app-url" placeholder="https://your-app.com" style="
                  width: 100%;
                  padding: 10px 12px;
                  background: #161b22;
                  border: 1px solid #30363d;
                  border-radius: 6px;
                  color: #e6edf3;
                  font-size: 13px;
                  box-sizing: border-box;
                " value="">
              </div>
              <div>
                <label style="color: #888; font-size: 11px; display: block; margin-bottom: 4px;">Username / Email</label>
                <input type="text" id="afi-username" placeholder="user@example.com" style="
                  width: 100%;
                  padding: 10px 12px;
                  background: #161b22;
                  border: 1px solid #30363d;
                  border-radius: 6px;
                  color: #e6edf3;
                  font-size: 13px;
                  box-sizing: border-box;
                ">
              </div>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
              <div>
                <label style="color: #888; font-size: 11px; display: block; margin-bottom: 4px;">Password</label>
                <input type="password" id="afi-password" placeholder="••••••••" style="
                  width: 100%;
                  padding: 10px 12px;
                  background: #161b22;
                  border: 1px solid #30363d;
                  border-radius: 6px;
                  color: #e6edf3;
                  font-size: 13px;
                  box-sizing: border-box;
                ">
              </div>
              <div>
                <label style="color: #888; font-size: 11px; display: block; margin-bottom: 4px;">Organization/Portal (Optional)</label>
                <input type="text" id="afi-org" placeholder="company-name" style="
                  width: 100%;
                  padding: 10px 12px;
                  background: #161b22;
                  border: 1px solid #30363d;
                  border-radius: 6px;
                  color: #e6edf3;
                  font-size: 13px;
                  box-sizing: border-box;
                ">
              </div>
            </div>
            
            <button id="afi-generate-prompt" style="
              margin-top: 16px;
              background: #8b5cf6;
              border: none;
              color: #fff;
              padding: 10px 20px;
              border-radius: 6px;
              cursor: pointer;
              font-size: 13px;
              font-weight: 500;
              width: 100%;
            ">🔄 Generate Executable Prompt</button>
          </div>
          
          <!-- Test Reference Info -->
          <div style="background: #161b22; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px;">
            <div style="color: #888; font-size: 11px; text-transform: uppercase; margin-bottom: 8px;">📹 Test Reference</div>
            <div style="color: #9ca3af; font-size: 12px; line-height: 1.6;">
              ${rowData.idealVideoLink ? 
                `<span style="color: #22c55e;">✅ Ideal Video Available</span> - The prompt will analyze this video to understand the correct test steps.<br><a href="${rowData.idealVideoLink}" target="_blank" style="color: #58a6ff;">Watch Ideal Video →</a>` : 
                `<span style="color: #d29922;">⚠️ No Ideal Video</span> - The prompt will use the test case description to determine steps.`
              }
              ${rowData.failureVideoLink ? `<br><a href="${rowData.failureVideoLink}" target="_blank" style="color: #f85149; margin-top: 4px; display: inline-block;">Watch Failure Video →</a>` : ''}
            </div>
          </div>
          
          <!-- Generated Prompt -->
          <div style="margin-bottom: 16px; background: #0d1117; padding: 4px; border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 12px 8px 12px;">
              <div style="color: #888; font-size: 11px; text-transform: uppercase;">📝 Executable Prompt for Copilot + Playwright MCP</div>
              <button id="afi-copy-prompt" style="
                background: #22c55e;
                border: none;
                color: #fff;
                padding: 6px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                font-weight: 500;
              ">📋 Copy</button>
            </div>
            <pre id="afi-playwright-prompt" style="
              color: #e6edf3;
              font-size: 11px;
              background: #161b22;
              padding: 16px;
              border-radius: 6px;
              font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
              white-space: pre-wrap;
              word-break: break-word;
              margin: 0;
              max-height: 300px;
              overflow-y: auto;
              line-height: 1.5;
            ">⬆️ Enter account details above and click "Generate Executable Prompt"</pre>
          </div>
          
          <div style="background: #1e293b; padding: 12px 16px; border-radius: 8px;">
            <div style="color: #fbbf24; font-size: 12px; font-weight: 500; margin-bottom: 6px;">💡 How to Use</div>
            <ol style="color: #9ca3af; font-size: 12px; margin: 0; padding-left: 20px; line-height: 1.8;">
              <li>Enter your test account credentials above</li>
              <li>Click "Generate Executable Prompt"</li>
              <li>Copy the generated prompt</li>
              <li>Open VS Code with Copilot + Playwright MCP enabled</li>
              <li>Paste the prompt - Copilot will automatically execute the test!</li>
            </ol>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Generate prompt handler
    document.getElementById('afi-generate-prompt').addEventListener('click', () => {
      const appUrl = document.getElementById('afi-app-url').value.trim();
      const username = document.getElementById('afi-username').value.trim();
      const password = document.getElementById('afi-password').value.trim();
      const org = document.getElementById('afi-org').value.trim();
      
      if (!username) {
        alert('Please enter at least a username/email to generate the prompt.');
        return;
      }
      
      const accountInfo = { appUrl, username, password, org };
      const prompt = generatePlaywrightMCPPrompt(window._currentPlaywrightRowData, window._currentPlaywrightIndex, accountInfo);
      
      document.getElementById('afi-playwright-prompt').textContent = prompt;
      
      // Highlight that prompt is ready
      const btn = document.getElementById('afi-generate-prompt');
      btn.textContent = '✅ Prompt Generated!';
      btn.style.background = '#22c55e';
      setTimeout(() => {
        btn.textContent = '🔄 Regenerate Prompt';
        btn.style.background = '#8b5cf6';
      }, 2000);
    });
    
    // Copy handler
    document.getElementById('afi-copy-prompt').addEventListener('click', () => {
      const promptText = document.getElementById('afi-playwright-prompt').textContent;
      if (promptText.includes('Enter account details')) {
        alert('Please generate the prompt first by entering account details.');
        return;
      }
      navigator.clipboard.writeText(promptText).then(() => {
        const btn = document.getElementById('afi-copy-prompt');
        btn.textContent = '✓ Copied!';
        btn.style.background = '#16a34a';
        setTimeout(() => {
          btn.textContent = '📋 Copy';
          btn.style.background = '#22c55e';
        }, 2000);
      });
    });
    
    // Close handlers
    document.getElementById('afi-modal-close').addEventListener('click', () => {
      document.getElementById('afi-modal-overlay').remove();
    });
    document.getElementById('afi-modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'afi-modal-overlay') {
        document.getElementById('afi-modal-overlay').remove();
      }
    });
  }

  function generatePlaywrightMCPPrompt(rowData, index, accountInfo = {}) {
    const caseName = rowData.caseName || 'Unknown Test Case';
    const failureText = rowData.failureText || 'No failure text available';
    const reasonText = rowData.reasonText || '';
    const domLink = rowData.domLink || '';
    const failureVideoLink = rowData.failureVideoLink || '';
    const idealVideoLink = rowData.idealVideoLink || '';
    const verdict = rowData.analysis?.verdict || 'UNKNOWN';
    const category = rowData.analysis?.category || 'Unknown';
    
    // Account info from user input
    const appUrl = accountInfo.appUrl || '[APPLICATION_URL]';
    const username = accountInfo.username || '[USERNAME]';
    const password = accountInfo.password || '[PASSWORD]';
    const org = accountInfo.org || '';
    
    // Extract useful information from failure text and case name
    const errorMatch = failureText.match(/error[:\s]+([^\n]+)/i);
    const statusMatch = failureText.match(/status[:\s\-]+(\d+)/i);
    const elementMatch = failureText.match(/(locator|selector|element|xpath|css)[:\s]+([^\n]+)/i);
    
    // Parse test case name for action hints
    const caseNameLower = caseName.toLowerCase();
    const hasClick = /click|button|submit|select|open|menu/i.test(caseName + failureText);
    const hasInput = /input|fill|type|enter|form|field|text/i.test(caseName + failureText);
    const hasNavigation = /navigate|redirect|page|url|visit/i.test(caseName + failureText);
    const hasValidation = /valid|invalid|error|check|verify/i.test(caseName + failureText);
    
    // Build action-oriented executable prompt
    let prompt = `EXECUTE THIS TEST CASE USING PLAYWRIGHT MCP:

**Test:** ${caseName}
**Current Status:** ${verdict === 'PRODUCT_ISSUE' ? '🔴 POTENTIAL BUG' : verdict === 'AUTOMATION_ISSUE' ? '🟡 AUTOMATION ISSUE' : '🟠 NEEDS VERIFICATION'}

---

## STEP 1: LOGIN TO APPLICATION

Navigate to: ${appUrl}
Login with:
- Username: ${username}
- Password: ${password}${org ? `\n- Organization: ${org}` : ''}

ACTIONS:
1. mcp_playwright_browser_navigate to "${appUrl}"
2. mcp_playwright_browser_snapshot to find login form
3. mcp_playwright_browser_fill_form with username "${username}" and password "${password}"
4. mcp_playwright_browser_click on login/submit button
5. mcp_playwright_browser_wait_for page to load after login

---

## STEP 2: UNDERSTAND THE TEST STEPS

`;

    // Reference ideal video if available, otherwise use test description
    if (idealVideoLink) {
      prompt += `**IMPORTANT: Watch the IDEAL VIDEO to understand the correct test flow:**
${idealVideoLink}

The ideal video shows exactly how this test SHOULD work. Watch it and replicate the same steps using Playwright MCP.

After watching, perform the same actions you see in the video:
`;
    } else {
      prompt += `**No ideal video available. Use test case description to determine steps:**

Test Case: "${caseName}"

Based on this test name, perform these likely actions:
`;
    }

    // Generate action steps based on case name and failure context
    prompt += `
---

## STEP 3: EXECUTE TEST ACTIONS

Based on the test case "${caseName}", perform these actions:

`;

    let stepNum = 1;
    
    if (hasNavigation) {
      prompt += `${stepNum}. mcp_playwright_browser_navigate - Go to the relevant page/section mentioned in test name\n`;
      stepNum++;
    }
    
    prompt += `${stepNum}. mcp_playwright_browser_snapshot - Analyze the page structure\n`;
    stepNum++;
    
    if (hasClick) {
      prompt += `${stepNum}. mcp_playwright_browser_click - Click on the element/button mentioned in "${caseName}"\n`;
      stepNum++;
    }
    
    if (hasInput) {
      prompt += `${stepNum}. mcp_playwright_browser_fill_form - Enter test data in the relevant fields\n`;
      stepNum++;
    }
    
    if (hasValidation) {
      prompt += `${stepNum}. mcp_playwright_browser_snapshot - Check for validation messages or errors\n`;
      stepNum++;
    }
    
    prompt += `${stepNum}. mcp_playwright_browser_take_screenshot - Capture the result\n`;

    // Add failure context
    prompt += `
---

## FAILURE CONTEXT (What went wrong in automation)

\`\`\`
${failureText.substring(0, 400)}${failureText.length > 400 ? '...' : ''}
\`\`\`
`;

    if (reasonText) {
      prompt += `
**Failure Reason:** ${reasonText.substring(0, 200)}${reasonText.length > 200 ? '...' : ''}
`;
    }

    // Add failure video for comparison
    if (failureVideoLink) {
      prompt += `
**Failure Video (shows what went wrong):** ${failureVideoLink}
`;
    }

    // Verification instructions
    prompt += `
---

## STEP 4: VERIFY AND REPORT

After executing the test:
1. mcp_playwright_browser_take_screenshot - Capture final state
2. Compare with ${idealVideoLink ? 'the ideal video behavior' : 'expected behavior based on test name'}
3. Report whether this is:
   - ✅ Working correctly (automation issue - test needs fix)
   - ❌ Still failing (product bug - needs developer attention)
   - ⚠️ Different behavior than expected

---

**Classification from AI Analysis:** ${verdict === 'PRODUCT_ISSUE' ? '🔴 Product Issue - Likely a real bug' : verdict === 'AUTOMATION_ISSUE' ? '🟡 Automation Issue - Likely test problem' : '🟠 Needs Review - Manual verification needed'}

**Category:** ${category}
`;

    // Add DOM link if available
    if (domLink) {
      prompt += `
**DOM Snapshot (page state at failure):** ${domLink}
`;
    }

    return prompt;
  }

  // ============================================
  // SELF-LEARNING FEEDBACK SYSTEM
  // ============================================

  const FEEDBACK_STORAGE_KEY = 'afi_feedback_data';
  const VERIFICATION_STORAGE_KEY = 'afi_verified_reports';
  const FEEDBACK_EMAIL = 'afi-feedback@your-team.com'; // Configure your team's email

  // Get report key from URL (normalized)
  function getReportKey() {
    const url = new URL(window.location.href);
    return url.pathname + url.search;
  }

  // Check if current report is verified
  function isReportVerified() {
    try {
      const data = localStorage.getItem(VERIFICATION_STORAGE_KEY);
      const verifiedReports = data ? JSON.parse(data) : {};
      return verifiedReports[getReportKey()] || null;
    } catch (e) {
      return null;
    }
  }

  // Mark current report as verified
  function markReportVerified(feedbackSubmitted = false) {
    try {
      const data = localStorage.getItem(VERIFICATION_STORAGE_KEY);
      const verifiedReports = data ? JSON.parse(data) : {};
      verifiedReports[getReportKey()] = {
        verifiedAt: new Date().toISOString(),
        feedbackSubmitted: feedbackSubmitted,
        url: window.location.href
      };
      localStorage.setItem(VERIFICATION_STORAGE_KEY, JSON.stringify(verifiedReports));
    } catch (e) {
      console.error('Error saving verification status:', e);
    }
  }

  // Update panel header with verified badge
  function updateHeaderWithVerifiedBadge(feedbackSubmitted) {
    const headerTitle = document.querySelector(`#${CONFIG.panelId} .afi-title`);
    if (headerTitle) {
      // Remove existing badge if any
      const existingBadge = headerTitle.querySelector('.afi-verified-badge');
      if (existingBadge) existingBadge.remove();
      
      const badgeHtml = feedbackSubmitted 
        ? `<span class="afi-verified-badge" style="
            display: inline-flex;
            align-items: center;
            gap: 4px;
            margin-left: 8px;
            padding: 3px 8px;
            background: #059669;
            color: white;
            border-radius: 12px;
            font-size: 10px;
            font-weight: 600;
          ">✅ Verified & Feedback Submitted</span>`
        : `<span class="afi-verified-badge" style="
            display: inline-flex;
            align-items: center;
            gap: 4px;
            margin-left: 8px;
            padding: 3px 8px;
            background: #059669;
            color: white;
            border-radius: 12px;
            font-size: 10px;
            font-weight: 600;
          ">✅ Verified</span>`;
      
      headerTitle.insertAdjacentHTML('beforeend', badgeHtml);
    }
    
    // Also update the minimize badge
    const minimizeBadge = document.getElementById('afi-minimize-badge');
    if (minimizeBadge) {
      minimizeBadge.innerHTML = feedbackSubmitted 
        ? '✅ Report Verified & Feedback Submitted' 
        : '✅ Report Verified';
      minimizeBadge.style.background = '#059669';
    }
  }

  // Get stored feedback data
  function getFeedbackData() {
    try {
      const data = localStorage.getItem(FEEDBACK_STORAGE_KEY);
      return data ? JSON.parse(data) : { corrections: [], surveys: [], stats: { total: 0, helpful: 0, notHelpful: 0 } };
    } catch (e) {
      console.error('Error reading feedback data:', e);
      return { corrections: [], surveys: [], stats: { total: 0, helpful: 0, notHelpful: 0 } };
    }
  }

  // Save feedback data
  function saveFeedbackData(data) {
    try {
      localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Error saving feedback data:', e);
    }
  }

  // Store a correction for learning
  function storeCorrection(rowData, originalVerdict, correctedVerdict, details, additionalInfo) {
    const feedbackData = getFeedbackData();
    const correction = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      reportUrl: window.location.href,
      caseName: rowData.caseName,
      featureName: rowData.featureName || '',
      failureText: rowData.failureText?.substring(0, 500) || '',
      reasonText: rowData.reasonText?.substring(0, 300) || '',
      fullText: rowData.fullText?.substring(0, 1000) || '',
      originalVerdict: originalVerdict,
      originalCategory: rowData.analysis?.category || '',
      originalConfidence: rowData.analysis?.confidence || 0,
      matchedPattern: rowData.analysis?.matchedPattern || '',
      correctedVerdict: correctedVerdict,
      userDetails: details,
      additionalInfo: additionalInfo,
      caseDescription: rowData.caseDescription || ''
    };
    
    feedbackData.corrections.push(correction);
    feedbackData.stats.total++;
    saveFeedbackData(feedbackData);
    
    console.log('📝 Feedback stored:', correction);
    return correction;
  }

  // Store survey response
  function storeSurveyResponse(rating, comments, analysisStats) {
    const feedbackData = getFeedbackData();
    const survey = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      reportUrl: window.location.href,
      rating: rating,
      comments: comments,
      analysisStats: analysisStats
    };
    
    feedbackData.surveys.push(survey);
    if (rating >= 3) {
      feedbackData.stats.helpful++;
    } else {
      feedbackData.stats.notHelpful++;
    }
    saveFeedbackData(feedbackData);
    
    console.log('📊 Survey response stored:', survey);
    return survey;
  }

  // Generate email body for feedback
  function generateFeedbackEmailBody(correction) {
    return `
AUTOMATION FAILURE INTELLIGENCE - FEEDBACK REPORT
==================================================

Report Date: ${correction.timestamp}
Report URL: ${correction.reportUrl}

TEST CASE INFORMATION:
---------------------
Case Name: ${correction.caseName}
Feature: ${correction.featureName}

CLASSIFICATION DISCREPANCY:
--------------------------
Original Classification: ${correction.originalVerdict}
Original Category: ${correction.originalCategory}
Original Confidence: ${correction.originalConfidence}%
Matched Pattern: ${correction.matchedPattern}

Correct Classification: ${correction.correctedVerdict}

USER FEEDBACK:
-------------
${correction.userDetails}

${correction.additionalInfo ? `Additional Context:
${correction.additionalInfo}` : ''}

FAILURE CONTEXT:
---------------
Failure Text:
${correction.failureText}

Reason:
${correction.reasonText}

CASE DESCRIPTION (Excerpt):
--------------------------
${correction.caseDescription.substring(0, 500)}

==================================================
This feedback will help improve the extension's pattern detection.
Please review and consider adding new patterns based on this case.
    `.trim();
  }

  // Generate CSV export of all stored feedback
  function exportFeedbackAsCSV() {
    const feedbackData = getFeedbackData();
    if (feedbackData.corrections.length === 0) {
      alert('No feedback data to export yet.');
      return;
    }

    const headers = ['Timestamp', 'Case Name', 'Feature', 'Original Verdict', 'Corrected Verdict', 'Original Category', 'User Details', 'Failure Text', 'Matched Pattern'];
    const rows = feedbackData.corrections.map(c => [
      c.timestamp,
      c.caseName,
      c.featureName,
      c.originalVerdict,
      c.correctedVerdict,
      c.originalCategory,
      c.userDetails,
      c.failureText?.substring(0, 200),
      c.matchedPattern
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `afi-feedback-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Show feedback modal for reporting incorrect classification
  function showFeedbackModal(rowData, index) {
    const existingModal = document.getElementById('afi-feedback-overlay');
    if (existingModal) existingModal.remove();

    const analysis = rowData.analysis;
    const verdictColor = getVerdictColor(analysis.verdict);
    const verdictLabel = getVerdictLabel(analysis.verdict);

    const modalHtml = `
      <div id="afi-feedback-overlay" style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        z-index: 100002;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(4px);
      ">
        <div style="
          background: #1a1f35;
          border-radius: 12px;
          padding: 24px;
          max-width: 700px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
          border: 2px solid #ff6b6b;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        ">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid #333; padding-bottom: 12px;">
            <h2 style="margin: 0; color: #ff6b6b; font-size: 18px;">
              🚨 Report Incorrect Classification
            </h2>
            <button id="afi-feedback-close" style="
              background: #333;
              border: none;
              color: #fff;
              width: 32px;
              height: 32px;
              border-radius: 50%;
              cursor: pointer;
              font-size: 18px;
            ">×</button>
          </div>

          <div style="background: #161b22; padding: 14px; border-radius: 8px; margin-bottom: 16px;">
            <div style="color: #888; font-size: 11px; text-transform: uppercase; margin-bottom: 6px;">Current Classification</div>
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="
                display: inline-block;
                padding: 6px 14px;
                background: ${verdictColor}22;
                border: 1px solid ${verdictColor};
                border-radius: 16px;
                color: ${verdictColor};
                font-weight: 600;
                font-size: 13px;
              ">${getVerdictEmoji(analysis.verdict)} ${verdictLabel}</span>
              <span style="color: #666; font-size: 12px;">| ${analysis.category}</span>
            </div>
            <div style="color: #888; margin-top: 8px; font-size: 12px;">Case: #${index + 1} ${escapeHtml(rowData.caseName)}</div>
          </div>

          <div style="margin-bottom: 16px;">
            <label style="color: #ccc; font-size: 13px; margin-bottom: 8px; display: block; font-weight: 500;">
              What should the correct classification be?
            </label>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              <label style="
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px 16px;
                background: #ff444420;
                border: 2px solid #ff444440;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s;
              ">
                <input type="radio" name="correct-verdict" value="PRODUCT_ISSUE" style="accent-color: #ff4444;">
                <span style="color: #ff4444;">🔴 Product Issue</span>
              </label>
              <label style="
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px 16px;
                background: #ffbb3320;
                border: 2px solid #ffbb3340;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s;
              ">
                <input type="radio" name="correct-verdict" value="AUTOMATION_ISSUE" style="accent-color: #ffbb33;">
                <span style="color: #ffbb33;">🟡 Automation Issue</span>
              </label>
              <label style="
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px 16px;
                background: #33b5e520;
                border: 2px solid #33b5e540;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s;
              ">
                <input type="radio" name="correct-verdict" value="OTHER" style="accent-color: #33b5e5;">
                <span style="color: #33b5e5;">🔵 Other / Unclear</span>
              </label>
            </div>
          </div>

          <div style="margin-bottom: 16px;">
            <label style="color: #ccc; font-size: 13px; margin-bottom: 8px; display: block; font-weight: 500;">
              Why is this classification incorrect? <span style="color: #ff6b6b;">*</span>
            </label>
            <textarea id="afi-feedback-details" placeholder="Please explain why the current classification is wrong and what patterns should have been detected..." style="
              width: 100%;
              min-height: 100px;
              padding: 12px;
              background: #0d1117;
              border: 1px solid #30363d;
              border-radius: 8px;
              color: #e6edf3;
              font-size: 13px;
              resize: vertical;
              box-sizing: border-box;
              line-height: 1.5;
            "></textarea>
          </div>

          <div style="margin-bottom: 20px;">
            <label style="color: #ccc; font-size: 13px; margin-bottom: 8px; display: block; font-weight: 500;">
              Additional context (optional)
            </label>
            <textarea id="afi-feedback-additional" placeholder="Any additional information that might help improve detection (patterns to look for, similar cases, etc.)..." style="
              width: 100%;
              min-height: 60px;
              padding: 12px;
              background: #0d1117;
              border: 1px solid #30363d;
              border-radius: 8px;
              color: #e6edf3;
              font-size: 13px;
              resize: vertical;
              box-sizing: border-box;
              line-height: 1.5;
            "></textarea>
          </div>

          <div style="border-top: 1px solid #333; padding-top: 16px; display: flex; gap: 12px; flex-wrap: wrap;">
            <button id="afi-feedback-email" style="
              flex: 1;
              min-width: 150px;
              padding: 12px 20px;
              background: #2563eb;
              border: none;
              border-radius: 8px;
              color: #fff;
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
            ">📧 Send via Email</button>
            <button id="afi-feedback-copy" style="
              flex: 1;
              min-width: 150px;
              padding: 12px 20px;
              background: #059669;
              border: none;
              border-radius: 8px;
              color: #fff;
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
            ">📋 Copy & Save</button>
            <button id="afi-feedback-save" style="
              flex: 1;
              min-width: 150px;
              padding: 12px 20px;
              background: #7c3aed;
              border: none;
              border-radius: 8px;
              color: #fff;
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
            ">💾 Save for Later</button>
          </div>

          <div style="margin-top: 16px; padding: 12px; background: #1e293b; border-radius: 6px;">
            <div style="color: #94a3b8; font-size: 11px; line-height: 1.6;">
              💡 <strong>Your feedback helps improve the extension!</strong><br>
              Corrections are used to enhance pattern detection and reduce future misclassifications.
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Radio button styling on selection
    document.querySelectorAll('input[name="correct-verdict"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        document.querySelectorAll('input[name="correct-verdict"]').forEach(r => {
          r.closest('label').style.borderWidth = '2px';
          r.closest('label').style.opacity = '0.7';
        });
        e.target.closest('label').style.borderWidth = '3px';
        e.target.closest('label').style.opacity = '1';
      });
    });

    // Close handlers
    document.getElementById('afi-feedback-close').addEventListener('click', () => {
      document.getElementById('afi-feedback-overlay').remove();
    });
    document.getElementById('afi-feedback-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'afi-feedback-overlay') {
        document.getElementById('afi-feedback-overlay').remove();
      }
    });

    // Email button
    document.getElementById('afi-feedback-email').addEventListener('click', () => {
      const correctedVerdict = document.querySelector('input[name="correct-verdict"]:checked')?.value;
      const details = document.getElementById('afi-feedback-details').value.trim();
      const additional = document.getElementById('afi-feedback-additional').value.trim();

      if (!correctedVerdict) {
        alert('Please select the correct classification.');
        return;
      }
      if (!details) {
        alert('Please explain why the classification is incorrect.');
        return;
      }

      const correction = storeCorrection(rowData, analysis.verdict, correctedVerdict, details, additional);
      const emailBody = generateFeedbackEmailBody(correction);
      const subject = encodeURIComponent(`[AFI Feedback] Misclassification Report - ${rowData.caseName.substring(0, 50)}`);
      const body = encodeURIComponent(emailBody);
      
      window.open(`mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`);
      
      document.getElementById('afi-feedback-overlay').remove();
      showFeedbackConfirmation('Email client opened. Thank you for your feedback!');
    });

    // Copy button
    document.getElementById('afi-feedback-copy').addEventListener('click', () => {
      const correctedVerdict = document.querySelector('input[name="correct-verdict"]:checked')?.value;
      const details = document.getElementById('afi-feedback-details').value.trim();
      const additional = document.getElementById('afi-feedback-additional').value.trim();

      if (!correctedVerdict) {
        alert('Please select the correct classification.');
        return;
      }
      if (!details) {
        alert('Please explain why the classification is incorrect.');
        return;
      }

      const correction = storeCorrection(rowData, analysis.verdict, correctedVerdict, details, additional);
      const emailBody = generateFeedbackEmailBody(correction);
      
      navigator.clipboard.writeText(emailBody).then(() => {
        document.getElementById('afi-feedback-overlay').remove();
        showFeedbackConfirmation('Feedback copied to clipboard and saved locally!');
      }).catch(() => {
        alert('Could not copy. Feedback saved locally.');
        document.getElementById('afi-feedback-overlay').remove();
      });
    });

    // Save for later button
    document.getElementById('afi-feedback-save').addEventListener('click', () => {
      const correctedVerdict = document.querySelector('input[name="correct-verdict"]:checked')?.value;
      const details = document.getElementById('afi-feedback-details').value.trim();
      const additional = document.getElementById('afi-feedback-additional').value.trim();

      if (!correctedVerdict) {
        alert('Please select the correct classification.');
        return;
      }
      if (!details) {
        alert('Please explain why the classification is incorrect.');
        return;
      }

      storeCorrection(rowData, analysis.verdict, correctedVerdict, details, additional);
      document.getElementById('afi-feedback-overlay').remove();
      showFeedbackConfirmation('Feedback saved locally! Export all feedback using the Feedback Hub.');
    });
  }

  // Show feedback confirmation toast
  function showFeedbackConfirmation(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #059669;
      color: white;
      padding: 14px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      z-index: 100003;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      animation: slideUp 0.3s ease-out;
    `;
    toast.innerHTML = `✅ ${message}`;
    document.body.appendChild(toast);
    
    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideUp {
        from { transform: translateX(-50%) translateY(20px); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    
    setTimeout(() => toast.remove(), 4000);
  }

  // Show satisfaction survey modal
  function showSatisfactionSurvey(analysisStats) {
    const existingModal = document.getElementById('afi-survey-overlay');
    if (existingModal) return; // Don't show if already shown

    const modalHtml = `
      <div id="afi-survey-overlay" style="
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 380px;
        background: linear-gradient(135deg, #1a1f35 0%, #0f182a 100%);
        border-radius: 16px;
        padding: 20px;
        z-index: 99998;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        border: 1px solid #059669;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <span style="color: #fff; font-size: 15px; font-weight: 600;">✅ Report Verified</span>
          <button id="afi-survey-close" style="
            background: none;
            border: none;
            color: #666;
            font-size: 18px;
            cursor: pointer;
            padding: 0;
          ">×</button>
        </div>

        <div style="background: #059669; color: white; padding: 10px 14px; border-radius: 8px; margin-bottom: 16px; font-size: 12px;">
          🎉 Thank you for completing your verification! Your feedback helps us improve.
        </div>

        <div style="margin-bottom: 16px;">
          <div style="color: #ccc; font-size: 13px; margin-bottom: 10px;">How helpful was this analysis?</div>
          <div style="display: flex; gap: 8px; justify-content: center;">
            ${[1,2,3,4,5].map(n => `
              <button class="afi-rating-btn" data-rating="${n}" style="
                width: 48px;
                height: 48px;
                border: 2px solid #333;
                background: #161b22;
                border-radius: 12px;
                font-size: 20px;
                cursor: pointer;
                transition: all 0.2s;
              ">${n <= 2 ? ['😞', '😕'][n-1] : n === 3 ? '😐' : ['🙂', '😀'][n-4]}</button>
            `).join('')}
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 6px; padding: 0 4px;">
            <span style="color: #666; font-size: 10px;">Not helpful</span>
            <span style="color: #666; font-size: 10px;">Very helpful</span>
          </div>
        </div>

        <div style="margin-bottom: 16px;">
          <textarea id="afi-survey-comments" placeholder="Any suggestions for improvement? (optional)" style="
            width: 100%;
            min-height: 60px;
            padding: 10px;
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 8px;
            color: #e6edf3;
            font-size: 12px;
            resize: none;
            box-sizing: border-box;
          "></textarea>
        </div>

        <div style="display: flex; gap: 10px;">
          <button id="afi-survey-submit" style="
            flex: 1;
            padding: 10px 16px;
            background: #2563eb;
            border: none;
            border-radius: 8px;
            color: #fff;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
          " disabled>Submit Feedback</button>
          <button id="afi-survey-skip" style="
            padding: 10px 16px;
            background: transparent;
            border: 1px solid #333;
            border-radius: 8px;
            color: #888;
            font-size: 13px;
            cursor: pointer;
          ">Skip</button>
        </div>

        <div id="afi-survey-export" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #333; display: none;">
          <button id="afi-export-all" style="
            width: 100%;
            padding: 8px;
            background: #7c3aed20;
            border: 1px solid #7c3aed;
            border-radius: 6px;
            color: #a78bfa;
            font-size: 12px;
            cursor: pointer;
          ">📁 Export All Stored Feedback (CSV)</button>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    let selectedRating = 0;

    // Rating button handlers
    document.querySelectorAll('.afi-rating-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedRating = parseInt(btn.dataset.rating);
        document.querySelectorAll('.afi-rating-btn').forEach(b => {
          b.style.borderColor = '#333';
          b.style.background = '#161b22';
          b.style.transform = 'scale(1)';
        });
        btn.style.borderColor = '#2563eb';
        btn.style.background = '#2563eb22';
        btn.style.transform = 'scale(1.1)';
        document.getElementById('afi-survey-submit').disabled = false;
      });
    });

    // Show export button if there's stored feedback
    const feedbackData = getFeedbackData();
    if (feedbackData.corrections.length > 0) {
      document.getElementById('afi-survey-export').style.display = 'block';
      document.getElementById('afi-export-all').addEventListener('click', exportFeedbackAsCSV);
    }

    // Submit button
    document.getElementById('afi-survey-submit').addEventListener('click', () => {
      const comments = document.getElementById('afi-survey-comments').value.trim();
      storeSurveyResponse(selectedRating, comments, analysisStats);
      
      // Mark report as verified with feedback submitted
      markReportVerified(true);
      
      // Update header with feedback submitted badge
      updateHeaderWithVerifiedBadge(true);
      
      document.getElementById('afi-survey-overlay').remove();
      showFeedbackConfirmation('Thank you for your feedback!');
    });

    // Close/Skip handlers
    document.getElementById('afi-survey-close').addEventListener('click', () => {
      document.getElementById('afi-survey-overlay').remove();
    });
    document.getElementById('afi-survey-skip').addEventListener('click', () => {
      document.getElementById('afi-survey-overlay').remove();
    });
  }

  // ============================================
  // DEEP ANALYSIS WITH CASE HISTORY
  // ============================================

  function openCaseHistory(rowData) {
    const row = document.getElementById(rowData.rowId) || rowData.element;
    if (!row) {
      alert('Row element not found');
      return;

    }

    // Find Case History menu item
    const menuItems = row.querySelectorAll('li');
    let caseHistoryItem = null;
    
    menuItems.forEach(item => {
      if (item.innerText.trim().includes('Case History')) {
        caseHistoryItem = item;
      }
    });

    if (caseHistoryItem) {
      // Trigger mouseenter to show submenu
      caseHistoryItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      caseHistoryItem.click();
      
      // Highlight the row
      row.style.outline = '3px solid #4CAF50';
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => row.style.outline = '', 5000);
    } else {
      alert('Case History menu not found. Please expand the row first by clicking on it, then try again.');
    }
  }

  // ============================================
  // DEEP ANALYSIS HELPER FUNCTIONS
  // ============================================

  /**
   * Parse "In This Report" page to check multiple runs
   * Returns: { runs: [{status, runNumber}], firstRunPassed: bool, hasMultipleRuns: bool }
   */
  function parseInThisReport(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const result = {
      runs: [],
      firstRunPassed: false,
      secondRunFailed: false,
      hasMultipleRuns: false,
      totalRuns: 0,
      passCount: 0,
      failCount: 0
    };

    // Look for run status indicators - common patterns in test reports
    // Pattern 1: Table rows with pass/fail status
    const rows = doc.querySelectorAll('tr, .run-row, [class*="run"], [class*="result"]');
    rows.forEach((row, idx) => {
      const text = row.innerText.toLowerCase();
      const hasPass = text.includes('pass') || text.includes('success') || row.querySelector('.pass, .success, [class*="pass"], [class*="success"]');
      const hasFail = text.includes('fail') || text.includes('error') || row.querySelector('.fail, .error, [class*="fail"], [class*="error"]');
      
      if (hasPass || hasFail) {
        result.runs.push({
          index: idx,
          status: hasPass ? 'pass' : 'fail',
          text: text.substring(0, 100)
        });
        if (hasPass) result.passCount++;
        if (hasFail) result.failCount++;
      }
    });

    // Pattern 2: Look for specific run indicators (1st run, 2nd run, etc.)
    const runMatches = html.match(/(\d+)(st|nd|rd|th)\s*run[^<]*?(pass|fail|success|error)/gi);
    if (runMatches) {
      runMatches.forEach(match => {
        const isPass = /pass|success/i.test(match);
        const runNum = parseInt(match);
        if (runNum === 1) result.firstRunPassed = isPass;
        if (runNum === 2) result.secondRunFailed = !isPass;
      });
    }

    // Pattern 3: Check for status colors (green = pass, red = fail)
    const greenElements = doc.querySelectorAll('[style*="green"], [style*="#0f0"], [style*="#00ff00"], .green, .passed');
    const redElements = doc.querySelectorAll('[style*="red"], [style*="#f00"], [style*="#ff0000"], .red, .failed');
    
    if (greenElements.length > 0 || redElements.length > 0) {
      result.passCount = Math.max(result.passCount, greenElements.length);
      result.failCount = Math.max(result.failCount, redElements.length);
    }

    result.totalRuns = result.passCount + result.failCount;
    result.hasMultipleRuns = result.totalRuns > 1;
    
    // If we found multiple runs and first passed but overall failed, it's likely flaky
    if (result.hasMultipleRuns && result.passCount > 0 && result.failCount > 0) {
      result.firstRunPassed = true;
      result.secondRunFailed = true;
    }

    return result;
  }

  // ============================================
  // ADVANCED ANALYSIS FUNCTIONS (Enhanced Deep Analysis)
  // ============================================

  /**
   * Calculate Flakiness Score (0-100)
   * Higher score = more flaky
   * Based on: pass/fail ratio, alternating patterns, consecutive failures
   */
  function calculateFlakinessScore(historyAnalysis, inReportAnalysis) {
    let score = 0;
    const weights = {
      alternatingPattern: 30,
      mixedInSameReport: 25,
      inconsistentHistory: 20,
      lowConsecutiveFails: 15,
      recentPassAfterFail: 10
    };

    if (!historyAnalysis || historyAnalysis.unavailable) {
      // If no history, use in-report analysis alone
      if (inReportAnalysis && inReportAnalysis.hasMultipleRuns) {
        if (inReportAnalysis.passCount > 0 && inReportAnalysis.failCount > 0) {
          score += weights.mixedInSameReport;
        }
      }
      return { score: Math.min(score, 100), confidence: 'low', reason: 'Limited data available' };
    }

    const { lastNResults, passCount, failCount, totalExecutions, consecutiveFails, isIntermittent } = historyAnalysis;

    // Check for alternating pass/fail pattern (strong flakiness indicator)
    if (lastNResults && lastNResults.length >= 4) {
      const results = lastNResults.map(r => typeof r === 'object' ? r.status : r);
      let alternations = 0;
      for (let i = 1; i < results.length; i++) {
        if (results[i] !== results[i-1] && results[i] !== 'unknown' && results[i-1] !== 'unknown') {
          alternations++;
        }
      }
      const alternationRatio = alternations / (results.length - 1);
      if (alternationRatio > 0.5) {
        score += weights.alternatingPattern * alternationRatio;
      }
    }

    // Mixed results in same report
    if (inReportAnalysis && inReportAnalysis.hasMultipleRuns) {
      if (inReportAnalysis.passCount > 0 && inReportAnalysis.failCount > 0) {
        score += weights.mixedInSameReport;
      }
    }

    // Inconsistent failure rate (between 20-80% = flaky zone)
    if (totalExecutions >= 5) {
      const failureRate = (failCount / totalExecutions) * 100;
      if (failureRate >= 20 && failureRate <= 80) {
        // Peak flakiness at 50% failure rate
        const flakinessFromRate = 1 - Math.abs(50 - failureRate) / 50;
        score += weights.inconsistentHistory * flakinessFromRate;
      }
    }

    // Low consecutive fails with history of both pass and fail
    if (consecutiveFails < 3 && passCount > 0 && failCount > 0) {
      score += weights.lowConsecutiveFails;
    }

    // Has intermittent flag from history analysis
    if (isIntermittent) {
      score += 10;
    }

    const finalScore = Math.min(Math.round(score), 100);
    let confidence = 'low';
    if (totalExecutions >= 10) confidence = 'high';
    else if (totalExecutions >= 5) confidence = 'medium';

    let reason = '';
    if (finalScore >= 70) reason = 'Highly flaky - frequent alternating results';
    else if (finalScore >= 40) reason = 'Moderately flaky - inconsistent behavior';
    else if (finalScore >= 20) reason = 'Slightly flaky - occasional inconsistencies';
    else reason = 'Stable - consistent test behavior';

    return { score: finalScore, confidence, reason };
  }

  /**
   * Detect failure trend over time
   * Returns: improving, worsening, stable, or unknown
   */
  function detectTrend(historyAnalysis) {
    if (!historyAnalysis || historyAnalysis.unavailable || !historyAnalysis.lastNResults) {
      return { trend: 'unknown', description: 'Insufficient data for trend analysis' };
    }

    const results = historyAnalysis.lastNResults.map(r => typeof r === 'object' ? r.status : r);
    if (results.length < 4) {
      return { trend: 'unknown', description: 'Need at least 4 data points for trend analysis' };
    }

    // Split into first half and second half
    const midpoint = Math.floor(results.length / 2);
    const firstHalf = results.slice(0, midpoint);
    const secondHalf = results.slice(midpoint);

    const firstHalfFailRate = firstHalf.filter(r => r === 'fail' || r === 'F').length / firstHalf.length;
    const secondHalfFailRate = secondHalf.filter(r => r === 'fail' || r === 'F').length / secondHalf.length;

    const difference = secondHalfFailRate - firstHalfFailRate;

    if (difference > 0.3) {
      return { 
        trend: 'worsening', 
        description: `Failures increasing: ${Math.round(firstHalfFailRate*100)}% → ${Math.round(secondHalfFailRate*100)}%`,
        icon: '📈',
        color: '#d9534f'
      };
    } else if (difference < -0.3) {
      return { 
        trend: 'improving', 
        description: `Failures decreasing: ${Math.round(firstHalfFailRate*100)}% → ${Math.round(secondHalfFailRate*100)}%`,
        icon: '📉',
        color: '#5cb85c'
      };
    } else {
      return { 
        trend: 'stable', 
        description: `Consistent pattern: ~${Math.round((firstHalfFailRate + secondHalfFailRate) / 2 * 100)}% failure rate`,
        icon: '➡️',
        color: '#f0ad4e'
      };
    }
  }

  /**
   * Calculate overall Test Stability Score (0-100)
   * Combines multiple factors: flakiness, consistency, trend, severity
   */
  function calculateStabilityScore(historyAnalysis, inReportAnalysis, flakinessScore, trend, featureAnalysis) {
    let score = 100; // Start with perfect stability

    // Deduct for flakiness (max -40)
    if (flakinessScore && flakinessScore.score) {
      score -= (flakinessScore.score * 0.4);
    }

    // Deduct for worsening trend (max -20)
    if (trend && trend.trend === 'worsening') {
      score -= 20;
    } else if (trend && trend.trend === 'improving') {
      score += 10; // Bonus for improving
    }

    // Deduct for high failure rate (max -30)
    if (historyAnalysis && !historyAnalysis.unavailable) {
      const failureRate = historyAnalysis.failureRate || 0;
      score -= (failureRate * 0.3);
    }

    // Deduct for consecutive failures (max -10)
    if (historyAnalysis && historyAnalysis.consecutiveFails >= 3) {
      score -= Math.min(historyAnalysis.consecutiveFails * 2, 10);
    }

    // Deduct for mixed results in same report (max -15)
    if (inReportAnalysis && inReportAnalysis.hasMultipleRuns) {
      if (inReportAnalysis.passCount > 0 && inReportAnalysis.failCount > 0) {
        score -= 15;
      }
    }

    // Bonus for consistent behavior with same feature
    if (featureAnalysis && featureAnalysis.totalRows > 1 && featureAnalysis.passedRows > 0) {
      // Other rows in same feature pass - suggests environment issue, not test issue
      score -= 10; // Actually, this indicates flakiness
    }

    // Normalize score
    score = Math.max(0, Math.min(100, Math.round(score)));

    let grade, color;
    if (score >= 80) { grade = 'A'; color = '#5cb85c'; }
    else if (score >= 60) { grade = 'B'; color = '#8bc34a'; }
    else if (score >= 40) { grade = 'C'; color = '#f0ad4e'; }
    else if (score >= 20) { grade = 'D'; color = '#ff9800'; }
    else { grade = 'F'; color = '#d9534f'; }

    return { score, grade, color };
  }

  /**
   * Generate smart recommendations based on analysis
   */
  function generateSmartRecommendations(signals, flakinessScore, trend, stabilityScore, historyAnalysis, rowData) {
    const recommendations = [];

    // Flakiness-based recommendations
    if (flakinessScore && flakinessScore.score >= 50) {
      recommendations.push({
        priority: 'high',
        icon: '⚡',
        title: 'High Flakiness Detected',
        action: 'Add explicit waits, improve selectors, or add retry logic',
        details: 'This test shows significant pass/fail variability suggesting timing or environmental sensitivity.'
      });
    }

    // Trend-based recommendations
    if (trend && trend.trend === 'worsening') {
      recommendations.push({
        priority: 'high',
        icon: '📈',
        title: 'Failure Trend Increasing',
        action: 'Investigate recent changes or deployments',
        details: 'Failures have increased recently. Check for recent code changes, deployments, or environment modifications.'
      });
    }

    // Stability-based recommendations
    if (stabilityScore && stabilityScore.score < 40) {
      recommendations.push({
        priority: 'high',
        icon: '🔧',
        title: 'Low Test Stability',
        action: 'Consider test refactoring or adding stabilization measures',
        details: 'This test has low overall stability. Review test design, dependencies, and execution environment.'
      });
    }

    // Signal-based recommendations
    if (signals.automation > signals.product) {
      if (rowData && rowData.errorDetails) {
        const errorText = rowData.errorDetails.toLowerCase();
        if (errorText.includes('timeout') || errorText.includes('wait')) {
          recommendations.push({
            priority: 'medium',
            icon: '⏱️',
            title: 'Timeout Issue',
            action: 'Increase wait times or add dynamic waits',
            details: 'Consider using WebDriverWait with expected conditions instead of fixed delays.'
          });
        }
        if (errorText.includes('element') || errorText.includes('locator') || errorText.includes('not found')) {
          recommendations.push({
            priority: 'medium',
            icon: '🎯',
            title: 'Element Locator Issue',
            action: 'Review and improve element selectors',
            details: 'Use more stable locators (IDs, data-attributes) instead of dynamic class names or XPath indices.'
          });
        }
      }
    } else if (signals.product > signals.automation) {
      recommendations.push({
        priority: 'high',
        icon: '🐛',
        title: 'Likely Product Bug',
        action: 'File a bug report with the development team',
        details: 'Analysis indicates this is likely a product issue. Document the steps to reproduce and expected behavior.'
      });
    }

    // History-based recommendations
    if (historyAnalysis && !historyAnalysis.unavailable) {
      if (historyAnalysis.consecutiveFails >= 5) {
        recommendations.push({
          priority: 'critical',
          icon: '🚨',
          title: 'Persistent Failure',
          action: 'Immediate investigation required',
          details: `Test has failed ${historyAnalysis.consecutiveFails} times consecutively. This requires immediate attention.`
        });
      }
      if (historyAnalysis.previousClassifications && historyAnalysis.previousClassifications.product > 2) {
        recommendations.push({
          priority: 'high',
          icon: '📋',
          title: 'Recurring Product Issue',
          action: 'Check if previous bug fix was incomplete',
          details: 'This test has been previously classified as a product issue multiple times. Verify the root cause was fully addressed.'
        });
      }
    }

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recommendations;
  }

  // ============================================
  // ANALYSIS CACHING SYSTEM
  // ============================================
  const ANALYSIS_CACHE_KEY = 'afi_analysis_cache_v1';
  const CACHE_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

  function getCachedAnalysis(testCaseId) {
    try {
      const cache = JSON.parse(localStorage.getItem(ANALYSIS_CACHE_KEY) || '{}');
      const entry = cache[testCaseId];
      if (entry && Date.now() - entry.timestamp < CACHE_EXPIRY_MS) {
        console.log('AFI: Using cached analysis for', testCaseId);
        return entry.data;
      }
    } catch (e) {
      console.log('AFI: Cache read error:', e);
    }
    return null;
  }

  function setCachedAnalysis(testCaseId, data) {
    try {
      const cache = JSON.parse(localStorage.getItem(ANALYSIS_CACHE_KEY) || '{}');
      // Clean old entries
      const now = Date.now();
      Object.keys(cache).forEach(key => {
        if (now - cache[key].timestamp > CACHE_EXPIRY_MS) {
          delete cache[key];
        }
      });
      // Add new entry
      cache[testCaseId] = { timestamp: now, data };
      localStorage.setItem(ANALYSIS_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
      console.log('AFI: Cache write error:', e);
    }
  }

  /**
   * Parse history API response (JSON data from Aalam API)
   */
  function parseHistoryApiResponse(apiData) {
    const result = {
      totalExecutions: 0,
      passCount: 0,
      failCount: 0,
      consecutiveFails: 0,
      passRate: '0%',
      failureRate: 0,
      isFrequentlyFailing: false,
      isIntermittent: false,
      isConsistentFailure: false,
      lastNResults: [],
      previousClassifications: { product: 0, automation: 0, unknown: 0 }
    };

    try {
      // Handle different API response formats
      const data = Array.isArray(apiData) ? apiData : (apiData.data || apiData.results || apiData.history || [apiData]);
      
      if (Array.isArray(data)) {
        result.totalExecutions = data.length;
        
        let consecutiveFails = 0;
        data.forEach((item, idx) => {
          const status = (item.status || item.finalStatus || item.result || '').toLowerCase();
          const isPassed = status.includes('pass') || status.includes('success') || status === 'passed';
          const isFailed = status.includes('fail') || status.includes('error') || status === 'failed';
          
          if (isPassed) result.passCount++;
          if (isFailed) result.failCount++;
          
          // Track consecutive fails from recent runs
          if (idx < 10) {
            result.lastNResults.push({
              date: item.date || item.timestamp || item.executionDate || '',
              status: isPassed ? 'pass' : (isFailed ? 'fail' : 'unknown'),
              build: item.build || item.buildNumber || ''
            });
          }
          
          // Count consecutive fails from the start (most recent)
          if (idx === consecutiveFails && isFailed) {
            consecutiveFails++;
          }
        });
        
        result.consecutiveFails = consecutiveFails;
        result.passRate = result.totalExecutions > 0 
          ? Math.round((result.passCount / result.totalExecutions) * 100) + '%'
          : '0%';
        result.failureRate = result.totalExecutions > 0 
          ? Math.round((result.failCount / result.totalExecutions) * 100)
          : 0;
        result.isFrequentlyFailing = result.failCount > result.passCount || consecutiveFails >= 3;
        result.isIntermittent = result.passCount > 0 && result.failCount > 0;
        result.isConsistentFailure = consecutiveFails >= 3;
      }
    } catch (e) {
      console.error('AFI: Error parsing history API response:', e);
    }

    return result;
  }

  /**
   * Parse "Past Final Results" page to get historical patterns
   * Returns: { totalExecutions, passCount, failCount, consecutiveFails, lastNResults, previousClassifications }
   */
  function parseHistoricalResults(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    const result = {
      totalExecutions: 0,
      passCount: 0,
      failCount: 0,
      consecutiveFails: 0,
      failureRate: 0,
      lastNResults: [],
      previousClassifications: {
        product: 0,
        automation: 0,
        unknown: 0
      },
      isIntermittent: false,
      isConsistentFailure: false,
      hasProductIssueHistory: false
    };

    // Find all result rows/entries
    const resultRows = doc.querySelectorAll('tr, .result-row, [class*="history"], [class*="result"]');
    let lastResults = [];
    
    resultRows.forEach(row => {
      const text = row.innerText.toLowerCase();
      
      // Skip header rows
      if (text.includes('date') && text.includes('status')) return;
      
      // Detect pass/fail
      const isPass = /\bpass\b|\bsuccess\b|\bpassed\b/.test(text) || 
                     row.querySelector('.pass, .success, [class*="pass"], [class*="success"]');
      const isFail = /\bfail\b|\berror\b|\bfailed\b/.test(text) || 
                     row.querySelector('.fail, .error, [class*="fail"], [class*="error"]');
      
      if (isPass || isFail) {
        result.totalExecutions++;
        if (isPass) {
          result.passCount++;
          lastResults.push('P');
        }
        if (isFail) {
          result.failCount++;
          lastResults.push('F');
        }
        
        // Check for previous classifications
        if (text.includes('product issue') || text.includes('product bug') || text.includes('product-issue')) {
          result.previousClassifications.product++;
        } else if (text.includes('automation issue') || text.includes('automation bug') || text.includes('flaky') || text.includes('automation-issue')) {
          result.previousClassifications.automation++;
        }
      }
    });

    // Also check for colored status indicators
    const passIndicators = doc.querySelectorAll('.pass, .passed, .success, [class*="pass"], [style*="green"]');
    const failIndicators = doc.querySelectorAll('.fail, .failed, .error, [class*="fail"], [style*="red"]');
    
    if (passIndicators.length + failIndicators.length > result.totalExecutions) {
      result.passCount = Math.max(result.passCount, passIndicators.length);
      result.failCount = Math.max(result.failCount, failIndicators.length);
      result.totalExecutions = result.passCount + result.failCount;
    }

    // Calculate consecutive fails from most recent
    result.lastNResults = lastResults.slice(-10); // Last 10 results
    let consecutiveFails = 0;
    for (let i = lastResults.length - 1; i >= 0; i--) {
      if (lastResults[i] === 'F') consecutiveFails++;
      else break;
    }
    result.consecutiveFails = consecutiveFails;

    // Calculate failure rate
    if (result.totalExecutions > 0) {
      result.failureRate = Math.round((result.failCount / result.totalExecutions) * 100);
    }

    // Determine patterns
    result.isIntermittent = result.passCount > 0 && result.failCount > 0 && result.failureRate < 80;
    result.isConsistentFailure = result.failureRate >= 80 || result.consecutiveFails >= 3;
    result.hasProductIssueHistory = result.previousClassifications.product > 0;

    return result;
  }

  /**
   * Find all rows in the current report with the same feature name and check pass/fail status
   * Used to detect "Momentary Issues" - when same feature has both passing and failing rows
   */
  function analyzeFeatureRows(currentFeatureName, currentRowId) {
    const result = {
      featureName: currentFeatureName,
      totalRows: 0,
      passedRows: 0,
      failedRows: 0,
      sameFeatureHasPassedRows: false,
      passedRowDetails: [],
      failedRowDetails: []
    };

    if (!currentFeatureName || currentFeatureName.trim() === '') {
      return result;
    }

    // Find all rows in the report
    const allReportRows = document.querySelectorAll('[id^="reportrows_"], [id^="report_"], .report-row, tr[id*="row"]');
    
    allReportRows.forEach(row => {
      // Get the feature name for this row
      let rowFeatureName = '';
      const featureEl = row.closest('[class*="featurename"]') || 
                       row.querySelector('.featurename') ||
                       row.closest('[id^="report_"]')?.querySelector('.featurename');
      if (featureEl) {
        rowFeatureName = (featureEl.innerText || featureEl.textContent || '').trim();
      }
      
      // Also try parent containers
      if (!rowFeatureName) {
        const container = row.closest('[id^="report_"]') || row.closest('.report-container');
        if (container) {
          const featureInContainer = container.querySelector('.featurename, [class*="feature-name"], .reportname');
          if (featureInContainer) rowFeatureName = (featureInContainer.innerText || '').trim();
        }
      }

      // Check if same feature
      if (rowFeatureName && rowFeatureName === currentFeatureName) {
        result.totalRows++;
        const rowText = (row.innerText || row.textContent || '').toLowerCase();
        const rowId = row.id || 'unknown';
        
        // Check if row is passed or failed
        const hasPassIndicator = row.querySelector('.pass, .success, [class*="pass"], [class*="success"], [style*="green"]') ||
                                  /\b(pass|passed|success)\b/i.test(rowText);
        const hasFailIndicator = row.querySelector('.fail, .error, [class*="fail"], [class*="error"], [style*="red"]') ||
                                  /\b(fail|failed|failure|error)\b/i.test(rowText);
        
        // Determine status - fail takes precedence if both indicators exist
        const isPassed = hasPassIndicator && !hasFailIndicator;
        const isFailed = hasFailIndicator;
        
        if (isPassed && rowId !== currentRowId) {
          result.passedRows++;
          result.passedRowDetails.push({
            rowId: rowId,
            text: rowText.substring(0, 100)
          });
        } else if (isFailed) {
          result.failedRows++;
          result.failedRowDetails.push({
            rowId: rowId,
            text: rowText.substring(0, 100)
          });
        }
      }
    });

    // If there are passed rows under the same feature, it's likely a momentary issue
    result.sameFeatureHasPassedRows = result.passedRows > 0;

    console.log('🔍 Feature Row Analysis:', result);
    return result;
  }

  /**
   * Generate insight based on analysis results
   */
  function generateInsight(inReportAnalysis, historyAnalysis, rowData) {
    let html = '';
    let verdict = 'Unable to Determine';
    let confidence = 'Low confidence - insufficient data';
    let bgColor = '#333';
    let borderColor = '#666';
    
    const signals = {
      automation: 0,
      product: 0,
      reasons: []
    };

    // Include initial classification from main panel analysis (with significant weight)
    if (rowData && rowData.analysis) {
      html += '<strong>🎯 Initial Analysis (from main panel):</strong><br>';
      html += `• Verdict: ${rowData.analysis.verdict || 'Unknown'}<br>`;
      html += `• Category: ${rowData.analysis.category || 'Unknown'}<br>`;
      html += `• Confidence: ${rowData.analysis.confidence || 0}%<br>`;
      
      if (rowData.analysis.verdict === 'PRODUCT_ISSUE') {
        signals.product += 3;
        signals.reasons.push(`Initial analysis classified as Product Issue (Category: ${rowData.analysis.category || 'Unknown'})`);
      } else if (rowData.analysis.verdict === 'AUTOMATION_ISSUE') {
        signals.automation += 3;
        signals.reasons.push(`Initial analysis classified as Automation Issue (Category: ${rowData.analysis.category || 'Unknown'})`);
      } else if (rowData.analysis.verdict === 'NEEDS_REVIEW') {
        signals.reasons.push('Initial analysis marked as Needs Review');
      }
      
      // Add category-based signals
      const category = (rowData.analysis.category || '').toLowerCase();
      if (category.includes('timing') || category.includes('wait') || category.includes('locator') || category.includes('element')) {
        signals.automation += 1;
        signals.reasons.push(`Category "${rowData.analysis.category}" suggests automation issue`);
      } else if (category.includes('assertion') || category.includes('validation') || category.includes('server') || category.includes('backend')) {
        signals.product += 1;
        signals.reasons.push(`Category "${rowData.analysis.category}" suggests product issue`);
      }
      
      html += '<br>';
    }

    // Analyze same-feature rows for Momentary Issue detection
    if (rowData && rowData.featureName) {
      const featureAnalysis = analyzeFeatureRows(rowData.featureName, rowData.rowId);
      
      if (featureAnalysis.totalRows > 1) {
        html += '<strong>🔄 Same Feature Analysis:</strong><br>';
        html += `• Feature: ${featureAnalysis.featureName.substring(0, 50)}${featureAnalysis.featureName.length > 50 ? '...' : ''}<br>`;
        html += `• Total rows with same feature: ${featureAnalysis.totalRows}<br>`;
        html += `• Passed: ${featureAnalysis.passedRows}, Failed: ${featureAnalysis.failedRows}<br>`;
        
        if (featureAnalysis.sameFeatureHasPassedRows) {
          html += '• <span style="color:#5bc0de; font-weight:bold;">⚡ MOMENTARY ISSUE DETECTED</span><br>';
          html += '• <span style="color:#5bc0de">Same feature has passing tests - likely intermittent/flaky</span><br>';
          signals.automation += 3;
          signals.reasons.push(`Momentary Issue - same feature "${featureAnalysis.featureName.substring(0, 30)}..." has ${featureAnalysis.passedRows} passing row(s)`);
        } else if (featureAnalysis.failedRows > 0 && featureAnalysis.passedRows === 0) {
          html += '• <span style="color:#d9534f">All rows under this feature are failing</span><br>';
          signals.product += 1;
          signals.reasons.push('All rows under same feature are failing - possible product issue');
        }
        html += '<br>';
      }
    }

    // Analyze "In This Report" data
    if (inReportAnalysis) {
      html += '<strong>📄 In This Report Analysis:</strong><br>';
      html += `• Total runs found: ${inReportAnalysis.totalRuns}<br>`;
      html += `• Pass: ${inReportAnalysis.passCount}, Fail: ${inReportAnalysis.failCount}<br>`;
      
      if (inReportAnalysis.hasMultipleRuns && inReportAnalysis.passCount > 0 && inReportAnalysis.failCount > 0) {
        html += '• <span style="color:#f0ad4e">Mixed results (some pass, some fail)</span><br>';
        signals.automation += 2;
        signals.reasons.push('Mixed pass/fail in same report indicates flaky test');
      }
      
      if (inReportAnalysis.firstRunPassed && inReportAnalysis.secondRunFailed) {
        html += '• <span style="color:#f0ad4e">First run passed, subsequent run failed</span><br>';
        signals.automation += 3;
        signals.reasons.push('First run pass + second run fail = classic flaky test pattern');
      }
      html += '<br>';
    }

    // Analyze historical data
    if (historyAnalysis && !historyAnalysis.unavailable) {
      html += '<strong>📜 Historical Analysis:</strong><br>';
      html += `• Total executions: ${historyAnalysis.totalExecutions}<br>`;
      html += `• Overall: ${historyAnalysis.passCount} pass, ${historyAnalysis.failCount} fail (${historyAnalysis.failureRate}% failure rate)<br>`;
      html += `• Consecutive recent fails: ${historyAnalysis.consecutiveFails}<br>`;
      
      if (historyAnalysis.lastNResults && historyAnalysis.lastNResults.length > 0) {
        html += `• Last ${historyAnalysis.lastNResults.length} results: ${historyAnalysis.lastNResults.join(' → ')}<br>`;
      }

      // Check for intermittent failures (Automation signal)
      if (historyAnalysis.isIntermittent) {
        html += '• <span style="color:#f0ad4e">Intermittent failures detected</span><br>';
        signals.automation += 2;
        signals.reasons.push('Intermittent pass/fail pattern suggests automation instability');
      }

      // Check for consistent failures (Product signal)
      if (historyAnalysis.isConsistentFailure) {
        html += '• <span style="color:#d9534f">Consistent/repeated failures</span><br>';
        signals.product += 2;
        signals.reasons.push('Consistent failures suggest actual product issue');
      }

      // Check previous classifications
      if (historyAnalysis.previousClassifications && historyAnalysis.previousClassifications.product > 0) {
        html += `• <span style="color:#d9534f">Previously marked as Product Issue: ${historyAnalysis.previousClassifications.product} time(s)</span><br>`;
        signals.product += 3;
        signals.reasons.push('Previously classified as Product Issue');
      }
      if (historyAnalysis.previousClassifications && historyAnalysis.previousClassifications.automation > 0) {
        html += `• <span style="color:#5bc0de">Previously marked as Automation Issue: ${historyAnalysis.previousClassifications.automation} time(s)</span><br>`;
        signals.automation += 3;
        signals.reasons.push('Previously classified as Automation Issue');
      }

      // Low failure rate with recent fail
      if (historyAnalysis.failureRate < 30 && historyAnalysis.failCount > 0) {
        html += '• <span style="color:#5bc0de">Low historical failure rate (<30%)</span><br>';
        signals.automation += 1;
        signals.reasons.push('Low failure rate suggests environmental/timing issue');
      }

      // High failure rate
      if (historyAnalysis.failureRate > 70) {
        html += '• <span style="color:#d9534f">High historical failure rate (>70%)</span><br>';
        signals.product += 2;
        signals.reasons.push('High failure rate suggests real product issue');
      }
      
      html += '<br>';
    } else if (historyAnalysis && historyAnalysis.unavailable) {
      html += '<strong>📜 Historical Analysis:</strong><br>';
      html += '• <span style="color:#888">Not available - Review manually via the link above</span><br><br>';
    }

    // Check error message patterns from rowData (errorDetails, failureText, reasonText)
    const errorText = [
      rowData?.errorDetails || '',
      rowData?.failureText || '',
      rowData?.reasonText || ''
    ].join(' ').toLowerCase();
    
    if (errorText.length > 0) {
      html += '<strong>🔎 Error Pattern Analysis:</strong><br>';
      
      // Automation issue patterns
      const automationPatterns = [
        { pattern: /timeout|timed out|waiting.*\d+.*second/i, reason: 'Timeout error - timing/wait issue' },
        { pattern: /element not found|no such element|stale element|not available/i, reason: 'Element not found - selector/timing issue' },
        { pattern: /connection refused|network error/i, reason: 'Connection error - environment issue' },
        { pattern: /session.*closed|browser.*closed/i, reason: 'Session closed - resource/cleanup issue' },
        { pattern: /flaky|intermittent/i, reason: 'Known flaky test' },
        { pattern: /retry|retrying/i, reason: 'Retry mechanism triggered - possible flakiness' }
      ];
      
      // Product issue patterns
      const productPatterns = [
        { pattern: /assertion.*fail|expected.*but.*got|mismatch/i, reason: 'Assertion failure - actual vs expected mismatch' },
        { pattern: /null.*pointer|undefined.*error|cannot read property/i, reason: 'Null/undefined error - possible product bug' },
        { pattern: /500|internal server error|server error/i, reason: 'Server error - backend issue' },
        { pattern: /permission denied|unauthorized|403|401/i, reason: 'Auth error - product config issue' },
        { pattern: /not found.*404|404.*not found/i, reason: '404 error - missing resource/endpoint' },
        { pattern: /validation.*fail|invalid.*data/i, reason: 'Validation failure - data/logic issue' }
      ];
      
      let foundPatterns = false;
      automationPatterns.forEach(p => {
        if (p.pattern.test(errorText)) {
          signals.automation += 1;
          signals.reasons.push(p.reason);
          html += `• <span style="color:#5bc0de">${p.reason}</span><br>`;
          foundPatterns = true;
        }
      });
      
      productPatterns.forEach(p => {
        if (p.pattern.test(errorText)) {
          signals.product += 1;
          signals.reasons.push(p.reason);
          html += `• <span style="color:#d9534f">${p.reason}</span><br>`;
          foundPatterns = true;
        }
      });
      
      if (!foundPatterns) {
        html += '• No specific patterns matched<br>';
      }
      html += '<br>';
    }

    // ============================================
    // VIDEO ANALYSIS (Failure vs Ideal Comparison)
    // ============================================
    const hasFailureVideo = !!(rowData?.failureVideoLink);
    const hasIdealVideo = !!(rowData?.idealVideoLink);
    
    html += '<strong>🎬 Video Analysis:</strong><br>';
    
    if (hasFailureVideo || hasIdealVideo) {
      html += '<div style="display:flex;flex-wrap:wrap;gap:8px;margin:6px 0;">';
      
      // Failure Video badge
      if (hasFailureVideo) {
        html += `<div style="background:#4a1a1a;border:1px solid #d9534f;border-radius:6px;padding:6px 10px;">
          <span style="color:#d9534f;">📹 Failure Video</span>
          <a href="${rowData.failureVideoLink}" target="_blank" style="color:#58a6ff;margin-left:6px;font-size:11px;">Watch →</a>
        </div>`;
      } else {
        html += `<div style="background:#2a2a2a;border:1px solid #666;border-radius:6px;padding:6px 10px;">
          <span style="color:#888;">📹 No Failure Video</span>
        </div>`;
      }
      
      // Ideal Video badge
      if (hasIdealVideo) {
        html += `<div style="background:#1a3a1a;border:1px solid #5cb85c;border-radius:6px;padding:6px 10px;">
          <span style="color:#5cb85c;">✅ Ideal Video</span>
          <a href="${rowData.idealVideoLink}" target="_blank" style="color:#58a6ff;margin-left:6px;font-size:11px;">Watch →</a>
        </div>`;
      } else {
        html += `<div style="background:#2a2a2a;border:1px solid #666;border-radius:6px;padding:6px 10px;">
          <span style="color:#888;">❌ No Ideal Video</span>
        </div>`;
      }
      
      html += '</div>';
      
      // Video comparison insights
      if (hasFailureVideo && hasIdealVideo) {
        html += '• <span style="color:#5cb85c; font-weight:bold;">✅ BOTH VIDEOS AVAILABLE - Manual Comparison Possible</span><br>';
        html += '• <span style="color:#aaa;">Compare failure video with ideal video to identify divergence point</span><br>';
        signals.reasons.push('Both failure and ideal videos available for comparison');
        
        // Add video comparison recommendation
        html += `<div style="margin-top:8px;padding:8px;background:#1a2a3a;border-radius:6px;border-left:3px solid #58a6ff;">
          <span style="color:#58a6ff;font-weight:bold;">💡 Video Comparison Tips:</span><br>
          <span style="color:#aaa;font-size:12px;">
            1. Watch both videos side-by-side<br>
            2. Identify the exact step where behavior diverges<br>
            3. Check if UI elements appeared differently<br>
            4. Look for unexpected popups/modals in failure video
          </span>
        </div>`;
      } else if (hasFailureVideo && !hasIdealVideo) {
        html += '• <span style="color:#f0ad4e;">⚠️ Only failure video available - no baseline for comparison</span><br>';
        html += '• <span style="color:#aaa;">Review failure video to identify error state</span><br>';
        signals.reasons.push('Failure video available but no ideal video for comparison');
      } else if (!hasFailureVideo && hasIdealVideo) {
        html += '• <span style="color:#f0ad4e;">⚠️ Only ideal video available - cannot see actual failure</span><br>';
        html += '• <span style="color:#aaa;">Ideal video shows expected behavior, but failure state unknown</span><br>';
      }
      
      html += '<br>';
    } else {
      html += '• <span style="color:#888;">No videos available - manual verification via DOM recommended</span><br><br>';
    }

    // ============================================
    // ADVANCED METRICS (New Enhanced Analysis)
    // ============================================
    
    // Get feature analysis for stability calculation
    let featureAnalysis = null;
    if (rowData && rowData.featureName) {
      featureAnalysis = analyzeFeatureRows(rowData.featureName, rowData.rowId);
    }
    
    // Calculate Flakiness Score
    const flakinessScore = calculateFlakinessScore(historyAnalysis, inReportAnalysis);
    
    // Detect Trend
    const trend = detectTrend(historyAnalysis);
    
    // Calculate Stability Score
    const stabilityScore = calculateStabilityScore(historyAnalysis, inReportAnalysis, flakinessScore, trend, featureAnalysis);
    
    // Add Advanced Metrics Section
    html += '<strong>📈 Advanced Metrics:</strong><br>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:10px;margin:8px 0;">';
    
    // Flakiness Score Badge
    const flakinessColor = flakinessScore.score >= 70 ? '#d9534f' : (flakinessScore.score >= 40 ? '#f0ad4e' : '#5cb85c');
    html += `<div style="background:${flakinessColor}22;border:1px solid ${flakinessColor};border-radius:8px;padding:8px 12px;text-align:center;">`;
    html += `<div style="font-size:18px;font-weight:bold;color:${flakinessColor}">${flakinessScore.score}%</div>`;
    html += `<div style="font-size:11px;color:#aaa;">Flakiness Score</div>`;
    html += '</div>';
    
    // Stability Score Badge
    html += `<div style="background:${stabilityScore.color}22;border:1px solid ${stabilityScore.color};border-radius:8px;padding:8px 12px;text-align:center;">`;
    html += `<div style="font-size:18px;font-weight:bold;color:${stabilityScore.color}">${stabilityScore.grade}</div>`;
    html += `<div style="font-size:11px;color:#aaa;">Stability (${stabilityScore.score}%)</div>`;
    html += '</div>';
    
    // Trend Badge
    if (trend.trend !== 'unknown') {
      html += `<div style="background:${trend.color}22;border:1px solid ${trend.color};border-radius:8px;padding:8px 12px;text-align:center;">`;
      html += `<div style="font-size:18px;">${trend.icon}</div>`;
      html += `<div style="font-size:11px;color:#aaa;">${trend.trend.charAt(0).toUpperCase() + trend.trend.slice(1)}</div>`;
      html += '</div>';
    }
    
    html += '</div>';
    
    // Trend details
    if (trend.trend !== 'unknown') {
      html += `• <span style="color:${trend.color}">${trend.description}</span><br>`;
    }
    
    // Flakiness interpretation
    html += `• Flakiness: <span style="color:${flakinessColor}">${flakinessScore.reason}</span> (${flakinessScore.confidence} confidence)<br>`;
    
    html += '<br>';

    // Summary of all signals
    html += '<strong>📊 Signal Summary:</strong><br>';
    if (signals.reasons.length > 0) {
      signals.reasons.forEach(reason => {
        const isAutomation = reason.toLowerCase().includes('automation') || 
                            reason.toLowerCase().includes('timing') || 
                            reason.toLowerCase().includes('flaky') ||
                            reason.toLowerCase().includes('timeout') ||
                            reason.toLowerCase().includes('element') ||
                            reason.toLowerCase().includes('environment');
        const color = isAutomation ? '#5bc0de' : '#d9534f';
        html += `• <span style="color:${color}">${reason}</span><br>`;
      });
    } else {
      html += '• No strong signals detected - manual review recommended<br>';
    }
    html += '<br>';

    if (signals.automation > signals.product) {
      verdict = '🤖 AUTOMATION ISSUE';
      bgColor = '#1a3a4a';
      borderColor = '#5bc0de';
      const diff = signals.automation - signals.product;
      if (diff >= 3) confidence = 'High confidence';
      else if (diff >= 1) confidence = 'Medium confidence';
      else confidence = 'Low confidence';
    } else if (signals.product > signals.automation) {
      verdict = '🐛 PRODUCT ISSUE';
      bgColor = '#4a1a1a';
      borderColor = '#d9534f';
      const diff = signals.product - signals.automation;
      if (diff >= 3) confidence = 'High confidence';
      else if (diff >= 1) confidence = 'Medium confidence';
      else confidence = 'Low confidence';
    } else if (signals.automation === signals.product && signals.automation > 0) {
      verdict = '⚖️ NEEDS MANUAL REVIEW';
      bgColor = '#4a4a1a';
      borderColor = '#f0ad4e';
      confidence = 'Equal signals for both - manual inspection recommended';
    }

    confidence += ` (Automation: ${signals.automation}, Product: ${signals.product})`;

    // Generate Smart Recommendations
    const recommendations = generateSmartRecommendations(signals, flakinessScore, trend, stabilityScore, historyAnalysis, rowData);

    return { 
      html, 
      verdict, 
      confidence, 
      bgColor, 
      borderColor, 
      signals,
      // New advanced metrics
      flakinessScore,
      trend,
      stabilityScore,
      recommendations
    };
  }

  /**
   * Create and open a detailed deep analysis report page
   */
  function openDeepAnalysisReport(rowData, inReportAnalysis, historyAnalysis, insight, inThisReportLink, pastFinalLink) {
    const reportHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deep Analysis Report - ${rowData.caseName || rowData.testCase || 'Test Case'}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #e0e0e0;
      margin: 0;
      padding: 20px;
      min-height: 100vh;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    .header {
      background: linear-gradient(135deg, #0f3460 0%, #16213e 100%);
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 20px;
      border: 1px solid #1f4287;
    }
    .header h1 {
      margin: 0 0 8px 0;
      color: #fff;
      font-size: 24px;
    }
    .header .subtitle {
      color: #888;
      font-size: 14px;
    }
    .card {
      background: #1e1e2e;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
      border: 1px solid #333;
    }
    .card h2 {
      margin: 0 0 16px 0;
      color: #fff;
      font-size: 18px;
      padding-bottom: 10px;
      border-bottom: 1px solid #333;
    }
    .verdict-box {
      padding: 20px;
      border-radius: 12px;
      text-align: center;
      margin-bottom: 20px;
    }
    .verdict-box.automation {
      background: linear-gradient(135deg, #1a3a4a 0%, #0d2636 100%);
      border: 2px solid #5bc0de;
    }
    .verdict-box.product {
      background: linear-gradient(135deg, #4a1a1a 0%, #360d0d 100%);
      border: 2px solid #d9534f;
    }
    .verdict-box.unknown {
      background: linear-gradient(135deg, #4a4a1a 0%, #36360d 100%);
      border: 2px solid #f0ad4e;
    }
    .verdict-text {
      font-size: 28px;
      font-weight: bold;
      margin-bottom: 8px;
    }
    .confidence {
      font-size: 14px;
      color: #aaa;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }
    .stat-box {
      background: #252535;
      padding: 16px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-value {
      font-size: 24px;
      font-weight: bold;
      color: #fff;
    }
    .stat-label {
      font-size: 12px;
      color: #888;
      margin-top: 4px;
    }
    .signal-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .signal-list li {
      padding: 10px 12px;
      margin-bottom: 8px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .signal-list li.automation {
      background: rgba(91, 192, 222, 0.1);
      border-left: 3px solid #5bc0de;
    }
    .signal-list li.product {
      background: rgba(217, 83, 79, 0.1);
      border-left: 3px solid #d9534f;
    }
    .test-info {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 8px;
      font-size: 14px;
    }
    .test-info dt {
      color: #888;
    }
    .test-info dd {
      margin: 0;
      color: #e0e0e0;
      word-break: break-word;
    }
    .error-box {
      background: #2a1a1a;
      border: 1px solid #d9534f;
      border-radius: 8px;
      padding: 12px;
      font-family: monospace;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 200px;
      overflow-y: auto;
    }
    .links-section a {
      display: inline-block;
      padding: 10px 20px;
      background: #0f3460;
      color: #58a6ff;
      text-decoration: none;
      border-radius: 6px;
      margin-right: 10px;
      margin-bottom: 10px;
      border: 1px solid #1f4287;
      transition: all 0.2s;
    }
    .links-section a:hover {
      background: #1f4287;
      transform: translateY(-2px);
    }
    .history-pattern {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      margin-top: 10px;
    }
    .history-pattern span {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
    }
    .history-pattern span.pass {
      background: #28a745;
      color: #fff;
    }
    .history-pattern span.fail {
      background: #d9534f;
      color: #fff;
    }
    .timestamp {
      text-align: center;
      color: #666;
      font-size: 12px;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #333;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Deep Analysis Report</h1>
      <div class="subtitle">Automated Failure Intelligence Analysis</div>
    </div>

    <!-- Verdict Box -->
    <div class="verdict-box ${insight.signals.automation > insight.signals.product ? 'automation' : insight.signals.product > insight.signals.automation ? 'product' : 'unknown'}">
      <div class="verdict-text">${insight.verdict}</div>
      <div class="confidence">${insight.confidence}</div>
    </div>

    <!-- Test Case Info -->
    <div class="card">
      <h2>Test Case Information</h2>
      <dl class="test-info">
        <dt>Test Case:</dt>
        <dd>${rowData.caseName || rowData.testCase || 'N/A'}</dd>
        <dt>Category:</dt>
        <dd>${rowData.analysis?.category || rowData.category || 'N/A'}</dd>
        <dt>Initial Analysis:</dt>
        <dd>${rowData.analysis?.verdict || rowData.classification || 'N/A'}</dd>
        <dt>Confidence:</dt>
        <dd>${rowData.analysis?.confidence ? rowData.analysis.confidence + '%' : 'N/A'}</dd>
      </dl>
      ${(rowData.failureText || rowData.reasonText || rowData.errorDetails) ? `
      <h3 style="margin-top:16px;color:#d9534f;">Error Details:</h3>
      <div class="error-box">${rowData.failureText || rowData.reasonText || rowData.errorDetails}</div>
      ` : ''}
      ${rowData.analysis?.suggestion ? `
      <h3 style="margin-top:16px;color:#5bc0de;">Suggestion:</h3>
      <div style="background:#1a1f35;padding:12px;border-radius:6px;border-left:3px solid #5bc0de;color:#e6edf3;">💡 ${rowData.analysis.suggestion}</div>
      ` : ''}
    </div>

    <!-- Analysis Sources -->
    <div class="card links-section">
      <h2>Source Links</h2>
      ${inThisReportLink ? `<a href="${inThisReportLink}" target="_blank">View In This Report</a>` : '<span style="color:#888">In This Report: Not available</span>'}
      ${pastFinalLink ? `<a href="${pastFinalLink}" target="_blank">View Past Final Results</a>` : '<span style="color:#888">Past Final Results: Not available</span>'}
      ${rowData.domLink ? `<a href="${rowData.domLink}" target="_blank" style="background:#1f4287;">🖼️ View DOM Snapshot</a>` : '<span style="color:#888">DOM Snapshot: Not available</span>'}
    </div>

    <!-- Video Comparison Section -->
    <div class="card">
      <h2>🎬 Video Analysis & Comparison</h2>
      <div style="display:flex;gap:16px;flex-wrap:wrap;">
        <!-- Failure Video -->
        <div style="flex:1;min-width:200px;background:#2a1a1a;border-radius:8px;padding:16px;border:1px solid ${rowData.failureVideoLink ? '#d9534f' : '#444'};">
          <h3 style="color:${rowData.failureVideoLink ? '#d9534f' : '#666'};margin:0 0 10px 0;font-size:14px;">
            📹 Failure Video
          </h3>
          ${rowData.failureVideoLink ? `
            <p style="color:#aaa;font-size:12px;margin-bottom:10px;">Shows the actual test execution that failed</p>
            <a href="${rowData.failureVideoLink}" target="_blank" 
               style="display:inline-block;padding:8px 16px;background:#d9534f;color:#fff;text-decoration:none;border-radius:6px;font-size:12px;">
              ▶ Watch Failure Video
            </a>
          ` : `
            <p style="color:#666;font-size:12px;margin-bottom:10px;">No failure video available for this test</p>
            <span style="color:#888;font-size:11px;">Unable to verify visual failure state</span>
          `}
        </div>
        
        <!-- Ideal Video -->
        <div style="flex:1;min-width:200px;background:#1a2a1a;border-radius:8px;padding:16px;border:1px solid ${rowData.idealVideoLink ? '#5cb85c' : '#444'};">
          <h3 style="color:${rowData.idealVideoLink ? '#5cb85c' : '#666'};margin:0 0 10px 0;font-size:14px;">
            ✅ Ideal Test Case Video
          </h3>
          ${rowData.idealVideoLink ? `
            <p style="color:#aaa;font-size:12px;margin-bottom:10px;">Shows the expected correct test execution</p>
            <a href="${rowData.idealVideoLink}" target="_blank" 
               style="display:inline-block;padding:8px 16px;background:#5cb85c;color:#fff;text-decoration:none;border-radius:6px;font-size:12px;">
              ▶ Watch Ideal Video
            </a>
          ` : `
            <p style="color:#666;font-size:12px;margin-bottom:10px;">No ideal video available for comparison</p>
            <span style="color:#888;font-size:11px;">Cannot compare against baseline behavior</span>
          `}
        </div>
      </div>
      
      <!-- Comparison Guidance -->
      ${rowData.failureVideoLink && rowData.idealVideoLink ? `
        <div style="margin-top:16px;padding:16px;background:linear-gradient(135deg,#1a3a4a 0%,#16213e 100%);border-radius:8px;border:1px solid #5bc0de;">
          <h4 style="color:#5bc0de;margin:0 0 12px 0;">💡 Video Comparison Guidelines</h4>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
            <div style="background:#252535;padding:10px;border-radius:6px;">
              <span style="color:#f0ad4e;font-weight:bold;">1. Side-by-Side View</span>
              <p style="color:#aaa;font-size:11px;margin:4px 0 0 0;">Open both videos and compare step-by-step</p>
            </div>
            <div style="background:#252535;padding:10px;border-radius:6px;">
              <span style="color:#f0ad4e;font-weight:bold;">2. Find Divergence Point</span>
              <p style="color:#aaa;font-size:11px;margin:4px 0 0 0;">Identify exactly when behavior differs</p>
            </div>
            <div style="background:#252535;padding:10px;border-radius:6px;">
              <span style="color:#f0ad4e;font-weight:bold;">3. Check UI State</span>
              <p style="color:#aaa;font-size:11px;margin:4px 0 0 0;">Look for unexpected modals, alerts, or errors</p>
            </div>
            <div style="background:#252535;padding:10px;border-radius:6px;">
              <span style="color:#f0ad4e;font-weight:bold;">4. Verify Timing</span>
              <p style="color:#aaa;font-size:11px;margin:4px 0 0 0;">Check if failure video shows loading delays</p>
            </div>
          </div>
          <div style="margin-top:12px;padding:10px;background:#2a3a2a;border-radius:6px;border-left:3px solid #5cb85c;">
            <span style="color:#5cb85c;font-weight:bold;">🎯 What to Look For:</span>
            <ul style="color:#aaa;font-size:11px;margin:6px 0 0 0;padding-left:16px;">
              <li><strong>Automation Issue Signs:</strong> Loading spinner stuck, element not visible yet, click on wrong position</li>
              <li><strong>Product Issue Signs:</strong> Error modal appears, page crashes, unexpected content displayed</li>
            </ul>
          </div>
          
          <!-- AI Video Analysis Section -->
          <div style="margin-top:16px;padding:16px;background:linear-gradient(135deg,#2a1a4a 0%,#1a1a3e 100%);border-radius:8px;border:1px solid #a855f7;">
            <h4 style="color:#a855f7;margin:0 0 12px 0;">🤖 AI-Powered Video Analysis</h4>
            <p style="color:#aaa;font-size:12px;margin-bottom:12px;">
              Use Claude AI to automatically analyze test context and provide verdict.
            </p>
            
            <!-- Auto AI Analysis Button (uses API) -->
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
              <button id="afi-open-claude" style="background:linear-gradient(135deg,#ff7e5f 0%,#feb47b 100%);color:#fff;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:bold;display:flex;align-items:center;gap:8px;box-shadow:0 4px 12px rgba(255,126,95,0.3);">
                <span>🌐</span> Open in Claude.ai (FREE)
              </button>
              <button id="afi-generate-ai-prompt" style="background:linear-gradient(135deg,#a855f7 0%,#6366f1 100%);color:#fff;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:bold;display:flex;align-items:center;gap:8px;">
                <span>🧠</span> Generate Prompt (Manual)
              </button>
              <button id="afi-auto-ai-analyze" style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#fff;border:none;padding:10px 16px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:bold;display:flex;align-items:center;gap:6px;">
                <span>⚡</span> API (Advanced)
              </button>
            </div>
            
            <!-- Open Claude.ai Info -->
            <div id="afi-claude-info" style="display:none;margin-bottom:16px;padding:16px;background:linear-gradient(135deg,#2a1a1a 0%,#1a1a2e 100%);border-radius:8px;border:1px solid #ff7e5f;">
              <div style="color:#ff7e5f;font-weight:bold;font-size:14px;margin-bottom:8px;">✅ Prompt Copied to Clipboard!</div>
              <p style="color:#aaa;font-size:12px;margin-bottom:12px;">Claude.ai is opening in a new tab. Just paste (Ctrl+V / Cmd+V) and press Enter.</p>
              <div style="background:#1a1a2e;padding:12px;border-radius:6px;border-left:3px solid #5cb85c;">
                <span style="color:#5cb85c;font-weight:bold;">Steps:</span>
                <ol style="color:#aaa;font-size:11px;margin:8px 0 0 16px;padding:0;">
                  <li>Paste the prompt in Claude.ai (already copied!)</li>
                  <li>Press Enter to send</li>
                  <li>Get professional AI analysis for FREE</li>
                </ol>
              </div>
            </div>
            
            <!-- Auto AI Result Container -->
            <div id="afi-auto-ai-result" style="display:none;margin-bottom:16px;padding:16px;background:#1a2a1a;border-radius:8px;border:1px solid #10b981;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <span style="color:#10b981;font-weight:bold;font-size:16px;">🤖 Claude AI Analysis Result</span>
                <button id="afi-close-ai-result" style="background:#d9534f;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:12px;">✕</button>
              </div>
              <div id="afi-ai-result-content"></div>
            </div>
            
            <!-- Manual Prompt Container -->
            <div id="afi-ai-prompt-container" style="display:none;margin-top:16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <span style="color:#a855f7;font-weight:bold;">📋 Copy this prompt to Claude/ChatGPT:</span>
                <button id="afi-copy-ai-prompt" style="background:#5cb85c;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;">📋 Copy</button>
              </div>
              <textarea id="afi-ai-prompt-text" readonly style="width:100%;height:300px;background:#1a1a2e;color:#e0e0e0;border:1px solid #444;border-radius:6px;padding:12px;font-family:monospace;font-size:11px;resize:vertical;"></textarea>
              <p style="color:#888;font-size:11px;margin-top:8px;">
                💡 <strong>Tip:</strong> Paste this prompt in <a href="https://claude.ai" target="_blank" style="color:#58a6ff;">Claude</a> or 
                <a href="https://chat.openai.com" target="_blank" style="color:#58a6ff;">ChatGPT</a> with vision capabilities to get AI-powered video analysis.
              </p>
            </div>
          </div>
        </div>
      ` : rowData.failureVideoLink ? `
        <div style="margin-top:16px;padding:12px;background:#3a2a1a;border-radius:6px;border-left:3px solid #f0ad4e;">
          <span style="color:#f0ad4e;">⚠️ Limited Analysis:</span>
          <span style="color:#aaa;font-size:12px;"> Only failure video available. Cannot compare against expected behavior baseline.</span>
        </div>
        <!-- AI Prompt Section for single video -->
        <div style="margin-top:16px;padding:16px;background:linear-gradient(135deg,#2a1a4a 0%,#1a1a3e 100%);border-radius:8px;border:1px solid #a855f7;">
          <h4 style="color:#a855f7;margin:0 0 12px 0;">🤖 AI Analysis (Single Video Mode)</h4>
          <p style="color:#aaa;font-size:12px;margin-bottom:12px;">Use AI to analyze the failure context.</p>
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
            <button id="afi-auto-ai-analyze" style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:bold;">⚡ Auto AI Analysis</button>
            <button id="afi-generate-ai-prompt" style="background:linear-gradient(135deg,#a855f7 0%,#6366f1 100%);color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:bold;">🧠 Generate Prompt</button>
          </div>
          <div id="afi-auto-ai-result" style="display:none;margin-bottom:16px;padding:16px;background:#1a2a1a;border-radius:8px;border:1px solid #10b981;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <span style="color:#10b981;font-weight:bold;">🤖 Claude AI Result</span>
              <button id="afi-close-ai-result" style="background:#d9534f;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">✕</button>
            </div>
            <div id="afi-ai-result-content"></div>
          </div>
          <div id="afi-ai-prompt-container" style="display:none;margin-top:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="color:#a855f7;font-weight:bold;">📋 Copy this prompt:</span>
              <button id="afi-copy-ai-prompt" style="background:#5cb85c;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;">📋 Copy</button>
            </div>
            <textarea id="afi-ai-prompt-text" readonly style="width:100%;height:250px;background:#1a1a2e;color:#e0e0e0;border:1px solid #444;border-radius:6px;padding:12px;font-family:monospace;font-size:11px;resize:vertical;"></textarea>
          </div>
        </div>
      ` : rowData.idealVideoLink ? `
        <div style="margin-top:16px;padding:12px;background:#3a2a1a;border-radius:6px;border-left:3px solid #f0ad4e;">
          <span style="color:#f0ad4e;">⚠️ Limited Analysis:</span>
          <span style="color:#aaa;font-size:12px;"> Only ideal video available. Cannot see actual failure state.</span>
        </div>
        <!-- AI Prompt Section for ideal video only -->
        <div style="margin-top:16px;padding:16px;background:linear-gradient(135deg,#2a1a4a 0%,#1a1a3e 100%);border-radius:8px;border:1px solid #a855f7;">
          <h4 style="color:#a855f7;margin:0 0 12px 0;">🤖 AI Analysis (Context Mode)</h4>
          <p style="color:#aaa;font-size:12px;margin-bottom:12px;">Generate a prompt for AI to analyze based on test context and error logs.</p>
          <button id="afi-generate-ai-prompt" style="background:linear-gradient(135deg,#a855f7 0%,#6366f1 100%);color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:bold;">🧠 Generate AI Prompt</button>
          <div id="afi-ai-prompt-container" style="display:none;margin-top:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="color:#a855f7;font-weight:bold;">📋 Copy this prompt:</span>
              <button id="afi-copy-ai-prompt" style="background:#5cb85c;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;">📋 Copy</button>
            </div>
            <textarea id="afi-ai-prompt-text" readonly style="width:100%;height:250px;background:#1a1a2e;color:#e0e0e0;border:1px solid #444;border-radius:6px;padding:12px;font-family:monospace;font-size:11px;resize:vertical;"></textarea>
          </div>
        </div>
      ` : `
        <div style="margin-top:16px;padding:12px;background:#2a2a2a;border-radius:6px;border-left:3px solid #666;">
          <span style="color:#888;">📋 No videos available -</span>
          <span style="color:#aaa;font-size:12px;"> Use DOM snapshot and error logs for analysis.</span>
        </div>
        <!-- AI Prompt Section for no video -->
        <div style="margin-top:16px;padding:16px;background:linear-gradient(135deg,#2a1a4a 0%,#1a1a3e 100%);border-radius:8px;border:1px solid #a855f7;">
          <h4 style="color:#a855f7;margin:0 0 12px 0;">🤖 AI Analysis (Text Mode)</h4>
          <p style="color:#aaa;font-size:12px;margin-bottom:12px;">Generate a prompt for AI to analyze based on error logs, DOM snapshot, and test context.</p>
          <button id="afi-generate-ai-prompt" style="background:linear-gradient(135deg,#a855f7 0%,#6366f1 100%);color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:bold;">🧠 Generate AI Prompt</button>
          <div id="afi-ai-prompt-container" style="display:none;margin-top:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="color:#a855f7;font-weight:bold;">📋 Copy this prompt:</span>
              <button id="afi-copy-ai-prompt" style="background:#5cb85c;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;">📋 Copy</button>
            </div>
            <textarea id="afi-ai-prompt-text" readonly style="width:100%;height:250px;background:#1a1a2e;color:#e0e0e0;border:1px solid #444;border-radius:6px;padding:12px;font-family:monospace;font-size:11px;resize:vertical;"></textarea>
          </div>
        </div>
      `}
    </div>

    <!-- In This Report Analysis -->
    ${inReportAnalysis ? `
    <div class="card">
      <h2>In This Report Analysis</h2>
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-value">${inReportAnalysis.totalRuns}</div>
          <div class="stat-label">Total Runs</div>
        </div>
        <div class="stat-box">
          <div class="stat-value" style="color:#28a745">${inReportAnalysis.passCount}</div>
          <div class="stat-label">Passed</div>
        </div>
        <div class="stat-box">
          <div class="stat-value" style="color:#d9534f">${inReportAnalysis.failCount}</div>
          <div class="stat-label">Failed</div>
        </div>
      </div>
      ${inReportAnalysis.hasMultipleRuns && inReportAnalysis.passCount > 0 && inReportAnalysis.failCount > 0 ? 
        '<p style="color:#f0ad4e">⚠️ <strong>Flaky Test Signal:</strong> Mixed pass/fail results in the same report run</p>' : ''}
      ${inReportAnalysis.firstRunPassed && inReportAnalysis.secondRunFailed ? 
        '<p style="color:#f0ad4e">⚠️ <strong>Classic Flaky Pattern:</strong> First run passed, subsequent run failed</p>' : ''}
    </div>
    ` : ''}

    <!-- Historical Analysis -->
    ${historyAnalysis ? `
    <div class="card">
      <h2>Historical Analysis</h2>
      ${historyAnalysis.unavailable ? `
      <div style="padding:20px;text-align:center;color:#888;">
        <p style="font-size:18px;margin-bottom:15px;color:#f0ad4e;">Review Manually</p>
        <p style="font-size:13px;margin-bottom:10px;">API endpoints are not reachable.</p>
        <p style="font-size:12px;">Click <strong>"View Past Final Results"</strong> above to check the test history manually.</p>
        ${historyAnalysis.testCaseId ? `<p style="font-size:11px;color:#666;margin-top:12px;">Test Case ID: ${historyAnalysis.testCaseId}</p>` : ''}
      </div>
      ` : `
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-value">${historyAnalysis.totalExecutions}</div>
          <div class="stat-label">Total Executions</div>
        </div>
        <div class="stat-box">
          <div class="stat-value" style="color:#28a745">${historyAnalysis.passCount}</div>
          <div class="stat-label">Passed</div>
        </div>
        <div class="stat-box">
          <div class="stat-value" style="color:#d9534f">${historyAnalysis.failCount}</div>
          <div class="stat-label">Failed</div>
        </div>
        <div class="stat-box">
          <div class="stat-value" style="color:${historyAnalysis.failureRate > 50 ? '#d9534f' : '#f0ad4e'}">${historyAnalysis.failureRate}%</div>
          <div class="stat-label">Failure Rate</div>
        </div>
        <div class="stat-box">
          <div class="stat-value" style="color:#d9534f">${historyAnalysis.consecutiveFails}</div>
          <div class="stat-label">Consecutive Fails</div>
        </div>
      </div>
      ${historyAnalysis.note ? `<p style="font-size:11px;color:#888;margin-top:10px;font-style:italic;">ℹ️ ${historyAnalysis.note}</p>` : ''}
      `}
      
      ${historyAnalysis.lastNResults && historyAnalysis.lastNResults.length > 0 ? `
      <h3 style="margin-top:16px;">Recent History Pattern:</h3>
      <div class="history-pattern">
        ${historyAnalysis.lastNResults.map(r => `<span class="${r === 'P' ? 'pass' : 'fail'}">${r}</span>`).join('')}
      </div>
      <p style="font-size:12px;color:#888;margin-top:8px;">P = Pass, F = Fail (most recent on right)</p>
      ` : ''}

      ${historyAnalysis.previousClassifications && historyAnalysis.previousClassifications.product > 0 ? 
        `<p style="color:#d9534f;margin-top:16px;">📌 <strong>Previously classified as Product Issue:</strong> ${historyAnalysis.previousClassifications.product} time(s)</p>` : ''}
      ${historyAnalysis.previousClassifications && historyAnalysis.previousClassifications.automation > 0 ? 
        `<p style="color:#5bc0de;margin-top:8px;">📌 <strong>Previously classified as Automation Issue:</strong> ${historyAnalysis.previousClassifications.automation} time(s)</p>` : ''}
      
      ${historyAnalysis.isIntermittent ? '<p style="color:#f0ad4e;margin-top:16px;">⚠️ <strong>Intermittent Failure Pattern Detected</strong> - Suggests automation instability</p>' : ''}
      ${historyAnalysis.isConsistentFailure ? '<p style="color:#d9534f;margin-top:8px;">🔴 <strong>Consistent Failure Pattern Detected</strong> - Suggests actual product issue</p>' : ''}
    </div>
    ` : ''}

    <!-- Advanced Metrics (New) -->
    <div class="card">
      <h2>📈 Advanced Metrics</h2>
      <div class="stats-grid">
        <div class="stat-box" style="border:2px solid ${insight.flakinessScore ? (insight.flakinessScore.score >= 70 ? '#d9534f' : (insight.flakinessScore.score >= 40 ? '#f0ad4e' : '#5cb85c')) : '#666'}">
          <div class="stat-value" style="color:${insight.flakinessScore ? (insight.flakinessScore.score >= 70 ? '#d9534f' : (insight.flakinessScore.score >= 40 ? '#f0ad4e' : '#5cb85c')) : '#888'}">${insight.flakinessScore ? insight.flakinessScore.score + '%' : 'N/A'}</div>
          <div class="stat-label">Flakiness Score</div>
        </div>
        <div class="stat-box" style="border:2px solid ${insight.stabilityScore ? insight.stabilityScore.color : '#666'}">
          <div class="stat-value" style="color:${insight.stabilityScore ? insight.stabilityScore.color : '#888'}">${insight.stabilityScore ? insight.stabilityScore.grade : 'N/A'}</div>
          <div class="stat-label">Stability Grade (${insight.stabilityScore ? insight.stabilityScore.score + '%' : 'N/A'})</div>
        </div>
        <div class="stat-box" style="border:2px solid ${insight.trend ? insight.trend.color : '#666'}">
          <div class="stat-value" style="font-size:32px;">${insight.trend && insight.trend.icon ? insight.trend.icon : '❓'}</div>
          <div class="stat-label">Trend: ${insight.trend ? (insight.trend.trend.charAt(0).toUpperCase() + insight.trend.trend.slice(1)) : 'Unknown'}</div>
        </div>
      </div>
      ${insight.flakinessScore ? `<p style="margin-top:12px;color:#aaa;font-size:13px;">🎲 <strong>Flakiness:</strong> ${insight.flakinessScore.reason} <span style="color:#666">(${insight.flakinessScore.confidence} confidence)</span></p>` : ''}
      ${insight.trend && insight.trend.trend !== 'unknown' ? `<p style="margin-top:6px;color:${insight.trend.color};font-size:13px;">${insight.trend.icon} <strong>Trend:</strong> ${insight.trend.description}</p>` : ''}
    </div>

    <!-- Smart Recommendations -->
    ${insight.recommendations && insight.recommendations.length > 0 ? `
    <div class="card" style="border-color:#1f4287;">
      <h2>💡 Smart Recommendations</h2>
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${insight.recommendations.map(rec => `
          <div style="background:${rec.priority === 'critical' ? '#4a1a1a' : rec.priority === 'high' ? '#3a2a1a' : '#1a2a3a'};border-radius:8px;padding:14px;border-left:4px solid ${rec.priority === 'critical' ? '#d9534f' : rec.priority === 'high' ? '#f0ad4e' : '#5bc0de'};">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
              <span style="font-size:18px;">${rec.icon}</span>
              <span style="font-weight:bold;color:#fff;">${rec.title}</span>
              <span style="font-size:10px;padding:2px 8px;border-radius:4px;background:${rec.priority === 'critical' ? '#d9534f' : rec.priority === 'high' ? '#f0ad4e' : '#5bc0de'};color:#fff;text-transform:uppercase;">${rec.priority}</span>
            </div>
            <p style="margin:0 0 6px 0;color:#58a6ff;font-weight:500;">➤ ${rec.action}</p>
            <p style="margin:0;color:#888;font-size:12px;">${rec.details}</p>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <!-- Analysis Signals -->
    <div class="card">
      <h2>Analysis Signals</h2>
      <div class="stats-grid" style="margin-bottom:20px;">
        <div class="stat-box" style="border-left:3px solid #5bc0de;">
          <div class="stat-value" style="color:#5bc0de">${insight.signals.automation}</div>
          <div class="stat-label">Automation Signals</div>
        </div>
        <div class="stat-box" style="border-left:3px solid #d9534f;">
          <div class="stat-value" style="color:#d9534f">${insight.signals.product}</div>
          <div class="stat-label">Product Signals</div>
        </div>
      </div>
      <ul class="signal-list">
        ${insight.signals.reasons.map(reason => {
          const isAutomation = reason.toLowerCase().includes('flaky') || 
                               reason.toLowerCase().includes('timing') || 
                               reason.toLowerCase().includes('timeout') ||
                               reason.toLowerCase().includes('intermittent') ||
                               reason.toLowerCase().includes('automation') ||
                               reason.toLowerCase().includes('environment');
          return `<li class="${isAutomation ? 'automation' : 'product'}">${reason}</li>`;
        }).join('')}
      </ul>
    </div>

    <!-- API Configuration Section (Option 2) -->
    <div class="card" style="border-color:#6366f1;">
      <details>
        <summary style="cursor:pointer;color:#a855f7;font-weight:bold;font-size:16px;padding:8px 0;">
          ⚙️ AI API Configuration (Advanced - Option 2)
        </summary>
        <div style="margin-top:16px;">
          <p style="color:#aaa;font-size:13px;margin-bottom:16px;">
            Configure an AI API for automatic analysis without manual copy-paste.
            <br><span style="color:#5cb85c;font-size:12px;font-weight:bold;">✨ Google Gemini and Groq offer FREE tiers!</span>
          </p>
          
          <div style="display:grid;gap:12px;">
            <div>
              <label style="color:#888;font-size:12px;display:block;margin-bottom:4px;">AI Provider</label>
              <select id="afi-ai-provider" style="width:100%;padding:10px;background:#1a1a2e;color:#e0e0e0;border:1px solid #444;border-radius:6px;">
                <option value="gemini" selected>🆓 Gemini Pro (Google) - FREE TIER</option>
                <option value="groq">🆓 Groq (Llama/Mixtral) - FREE TIER</option>
                <option value="openrouter">OpenRouter (Multiple Models)</option>
                <option value="claude">Claude (Anthropic) - Paid</option>
                <option value="openai">GPT-4 (OpenAI) - Paid</option>
              </select>
            </div>
            
            <div>
              <label style="color:#888;font-size:12px;display:block;margin-bottom:4px;">API Key</label>
              <input type="password" id="afi-ai-api-key" placeholder="Enter your API key" 
                     style="width:100%;padding:10px;background:#1a1a2e;color:#e0e0e0;border:1px solid #444;border-radius:6px;">
            </div>
            
            <div style="display:flex;gap:10px;">
              <button id="afi-save-api-key" style="flex:1;padding:10px;background:#5cb85c;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">
                💾 Save API Key
              </button>
              <button id="afi-test-api" style="flex:1;padding:10px;background:#6366f1;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">
                🧪 Test Connection
              </button>
            </div>
            
            <div id="afi-api-status" style="padding:10px;border-radius:6px;display:none;"></div>
          </div>
          
          <div style="margin-top:16px;padding:12px;background:#1a2a1a;border-radius:6px;border-left:3px solid #5cb85c;">
            <span style="color:#5cb85c;font-weight:bold;">🆓 FREE API Keys (Recommended):</span>
            <ul style="color:#aaa;font-size:12px;margin:8px 0 0 0;padding-left:16px;">
              <li><a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:#58a6ff;">Google Gemini</a> - 60 req/min FREE (Best option!)</li>
              <li><a href="https://console.groq.com/keys" target="_blank" style="color:#58a6ff;">Groq</a> - Fast inference, generous free tier</li>
              <li><a href="https://openrouter.ai/keys" target="_blank" style="color:#58a6ff;">OpenRouter</a> - Some free models available</li>
            </ul>
          </div>
          
          <div style="margin-top:12px;padding:12px;background:#1a1a2e;border-radius:6px;border-left:3px solid #6366f1;">
            <span style="color:#6366f1;font-weight:bold;">💰 Paid API Keys:</span>
            <ul style="color:#aaa;font-size:12px;margin:8px 0 0 0;padding-left:16px;">
              <li><a href="https://console.anthropic.com/" target="_blank" style="color:#58a6ff;">Claude API</a> - anthropic.com</li>
              <li><a href="https://platform.openai.com/api-keys" target="_blank" style="color:#58a6ff;">OpenAI API</a> - platform.openai.com</li>
            </ul>
          </div>
          
          <p style="color:#f0ad4e;font-size:11px;margin-top:12px;">
            ⚠️ API keys are stored locally in your browser. They are never sent to any server except the AI provider's API.
          </p>
        </div>
      </details>
    </div>

    <div class="timestamp">
      Generated on ${new Date().toLocaleString()} by Automation Failure Intelligence v3.6 (Claude AI Integration)
    </div>
  </div>

  <script>
    // AI Video Analysis Prompt Generator
    (function() {
      const testContext = {
        caseName: ${JSON.stringify(rowData.caseName || 'Unknown Test Case')},
        failureText: ${JSON.stringify(rowData.failureText || '')},
        reasonText: ${JSON.stringify(rowData.reasonText || '')},
        caseDescription: ${JSON.stringify(rowData.caseDescription || '')},
        failureVideoLink: ${JSON.stringify(rowData.failureVideoLink || '')},
        idealVideoLink: ${JSON.stringify(rowData.idealVideoLink || '')},
        domLink: ${JSON.stringify(rowData.domLink || '')},
        initialVerdict: ${JSON.stringify(rowData.analysis?.verdict || 'UNKNOWN')},
        category: ${JSON.stringify(rowData.analysis?.category || '')},
        confidence: ${JSON.stringify(rowData.analysis?.confidence || 0)},
        deepVerdict: ${JSON.stringify(insight.verdict || '')},
        deepConfidence: ${JSON.stringify(insight.confidence || '')}
      };

      function generateAIPrompt() {
        // Build video links section
        let videoLinksSection = '### Step 0: Open These Links in Your Browser (You Have Access!)\\n\\n';
        
        if (testContext.failureVideoLink) {
          videoLinksSection += '1. **📹 Open Failure Video:** [Click here](' + testContext.failureVideoLink + ')\\n';
          videoLinksSection += '   - Watch the video and note where the test fails\\n';
          videoLinksSection += '   - Look for any error messages, popups, or unexpected behavior\\n\\n';
        } else {
          videoLinksSection += '1. ❌ No failure video available\\n\\n';
        }
        
        if (testContext.idealVideoLink) {
          videoLinksSection += '2. **✅ Open Ideal Video:** [Click here](' + testContext.idealVideoLink + ')\\n';
          videoLinksSection += '   - Watch to understand how it SHOULD work\\n';
          videoLinksSection += '   - Compare with failure video to find divergence point\\n\\n';
        } else {
          videoLinksSection += '2. ❌ No ideal video available\\n\\n';
        }
        
        if (testContext.domLink) {
          videoLinksSection += '3. **🖼️ Open DOM Snapshot:** [Click here](' + testContext.domLink + ')\\n';
          videoLinksSection += '   - Review the page HTML at point of failure\\n';
          videoLinksSection += '   - Look for error messages, freeze layers, or unexpected elements\\n\\n';
        } else {
          videoLinksSection += '3. ❌ No DOM snapshot available\\n\\n';
        }

        const prompt = \`# AI Video Analysis Request - Automation Test Failure

## ⚠️ IMPORTANT: ACCESS THE RESOURCES FIRST!

**I cannot directly access internal/corporate URLs. Please help me analyze by doing the following:**

\${videoLinksSection}
### After Watching, Tell Me What You Observed:
- At what step did the failure occur?
- Did you see any error popups or messages?
- Was there a loading/timing issue visible?
- How did it differ from the ideal video?

---

## Test Case Information
- **Test Name:** \${testContext.caseName}
- **Initial Analysis Verdict:** \${testContext.initialVerdict} (\${testContext.confidence}% confidence)
- **Deep Analysis Verdict:** \${testContext.deepVerdict}
- **Category:** \${testContext.category}

## Error Details
**Failure Message:** \${testContext.failureText || 'Not provided'}

**Reason:** \${testContext.reasonText || 'Not provided'}

**Test Description:** \${testContext.caseDescription || 'Not provided'}

## Resource URLs (for your reference)

### 📹 FAILURE VIDEO
\${testContext.failureVideoLink || '❌ No failure video available'}

### ✅ IDEAL VIDEO  
\${testContext.idealVideoLink || '❌ No ideal video available'}

\${testContext.domLink ? '### 🖼️ DOM Snapshot\\n' + testContext.domLink : ''}

---

## My Analysis Approach

Once you describe what you observed in the videos, I will:

1. **Identify the divergence point** - exactly when/where behavior differs
2. **Classify the root cause** as:
   - **AUTOMATION ISSUE** (timing, locator, test data, environment)
   - **PRODUCT ISSUE** (bug, server error, feature failure)
3. **Provide actionable recommendations**

### Classification Indicators I'll Look For:

**AUTOMATION ISSUE signs:**
- ⏱️ Test clicked before element was ready
- 🎯 Wrong element or position clicked
- 🔄 Page still loading when test proceeded
- 💾 Test data setup problem

**PRODUCT ISSUE signs:**
- 🐛 Application error/crash
- ❌ Expected functionality didn't work
- 🔴 Server error (500, timeout)
- 🚫 Feature not working as designed

---

## Response Format

After you share your observations, I'll respond with:

\\\`\\\`\\\`
## 🎯 AI VIDEO ANALYSIS VERDICT

**Classification:** [AUTOMATION_ISSUE / PRODUCT_ISSUE / NEEDS_MANUAL_REVIEW]
**Confidence:** [HIGH / MEDIUM / LOW]
**Divergence Point:** [Where failure differs from ideal]
**Root Cause:** [What caused the failure]
**Evidence:** [Key observations]
**Recommendation:** [Specific fix or bug report]
\\\`\\\`\\\`

---

**Please open the links above and describe what you see, or if you cannot access them, share any additional context about this failure.**\`;

        return prompt;
      }

      // ============================================
      // Open in Claude.ai button (FREE - no API key needed!)
      // ============================================
      const openClaudeBtn = document.getElementById('afi-open-claude');
      const claudeInfoDiv = document.getElementById('afi-claude-info');
      
      if (openClaudeBtn) {
        openClaudeBtn.addEventListener('click', async function() {
          const prompt = generateAIPrompt();
          try {
            await navigator.clipboard.writeText(prompt);
            if (claudeInfoDiv) claudeInfoDiv.style.display = 'block';
            window.open('https://claude.ai/new', '_blank');
            openClaudeBtn.innerHTML = '<span>✅</span> Opened! Paste in Claude.ai';
            openClaudeBtn.style.background = 'linear-gradient(135deg,#5cb85c 0%,#28a745 100%)';
            setTimeout(() => {
              openClaudeBtn.innerHTML = '<span>🌐</span> Open in Claude.ai (FREE)';
              openClaudeBtn.style.background = 'linear-gradient(135deg,#ff7e5f 0%,#feb47b 100%)';
            }, 5000);
          } catch(e) {
            // Fallback if clipboard fails
            const promptContainer = document.getElementById('afi-ai-prompt-container');
            const promptTextarea = document.getElementById('afi-ai-prompt-text');
            if (promptTextarea) promptTextarea.value = prompt;
            if (promptContainer) promptContainer.style.display = 'block';
            window.open('https://claude.ai/new', '_blank');
            alert('Prompt shown below! Copy it and paste in Claude.ai');
          }
        });
      }

      // Event handlers
      const generateBtn = document.getElementById('afi-generate-ai-prompt');
      const promptContainer = document.getElementById('afi-ai-prompt-container');
      const promptTextarea = document.getElementById('afi-ai-prompt-text');
      const copyBtn = document.getElementById('afi-copy-ai-prompt');

      if (generateBtn) {
        generateBtn.addEventListener('click', function() {
          const prompt = generateAIPrompt();
          promptTextarea.value = prompt;
          promptContainer.style.display = 'block';
          generateBtn.innerHTML = '<span>✅</span> Prompt Generated!';
          generateBtn.style.background = 'linear-gradient(135deg,#5cb85c 0%,#28a745 100%)';
          setTimeout(() => {
            generateBtn.innerHTML = '<span>🧠</span> Regenerate Prompt';
            generateBtn.style.background = 'linear-gradient(135deg,#a855f7 0%,#6366f1 100%)';
          }, 2000);
        });
      }

      if (copyBtn) {
        copyBtn.addEventListener('click', function() {
          promptTextarea.select();
          document.execCommand('copy');
          copyBtn.textContent = '✅ Copied!';
          copyBtn.style.background = '#28a745';
          setTimeout(() => {
            copyBtn.textContent = '📋 Copy';
            copyBtn.style.background = '#5cb85c';
          }, 2000);
        });
      }

      // ============================================
      // AUTO AI ANALYSIS (Via PostMessage to Content Script)
      // ============================================
      const autoAiBtn = document.getElementById('afi-auto-ai-analyze');
      const aiResultContainer = document.getElementById('afi-auto-ai-result');
      const aiResultContent = document.getElementById('afi-ai-result-content');
      const closeAiResultBtn = document.getElementById('afi-close-ai-result');

      // Helper function to make API calls via the parent window (content script)
      function callAIApi(provider, endpoint, headers, payload) {
        return new Promise((resolve, reject) => {
          const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
          
          // Listen for response
          function handleResponse(event) {
            if (!event.data || event.data.source !== 'AFI_CONTENT_SCRIPT') return;
            if (event.data.type !== 'AI_API_RESPONSE') return;
            if (event.data.requestId !== requestId) return;
            
            window.removeEventListener('message', handleResponse);
            
            if (event.data.success) {
              resolve(event.data.data);
            } else {
              reject(new Error(event.data.error || 'API call failed'));
            }
          }
          
          window.addEventListener('message', handleResponse);
          
          // Send request to parent window (where content script is running)
          if (window.opener) {
            window.opener.postMessage({
              source: 'AFI_REPORT_PAGE',
              type: 'AI_API_CALL',
              requestId: requestId,
              provider: provider,
              endpoint: endpoint,
              headers: headers,
              payload: payload
            }, '*');
          } else {
            reject(new Error('Cannot communicate with extension. Please reopen from the analysis panel.'));
          }
          
          // Timeout after 60 seconds
          setTimeout(() => {
            window.removeEventListener('message', handleResponse);
            reject(new Error('Request timeout - no response from extension'));
          }, 60000);
        });
      }

      if (autoAiBtn) {
        autoAiBtn.addEventListener('click', async function() {
          const apiKey = localStorage.getItem('afi_ai_api_key');
          const provider = localStorage.getItem('afi_ai_provider') || 'gemini';
          
          if (!apiKey) {
            alert('⚠️ API Key Not Found!\\n\\nPlease configure your API key in the settings below.\\n\\n🆓 Recommended FREE options:\\n• Google Gemini - aistudio.google.com\\n• Groq - console.groq.com');
            return;
          }
          
          // Get provider display name
          const providerNames = {
            'gemini': 'Gemini',
            'groq': 'Groq',
            'openrouter': 'OpenRouter',
            'claude': 'Claude',
            'openai': 'OpenAI'
          };
          const providerName = providerNames[provider] || provider;
          
          // Update button to show loading
          autoAiBtn.disabled = true;
          autoAiBtn.innerHTML = '<span>⏳</span> Analyzing with ' + providerName + '...';
          autoAiBtn.style.background = 'linear-gradient(135deg,#f0ad4e 0%,#ec971f 100%)';
          
          try {
            const prompt = generateAIPrompt();
            
            // Build request based on provider
            let endpoint, headers, payload;
            
            switch (provider) {
              case 'gemini':
                endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey;
                headers = { 'Content-Type': 'application/json' };
                payload = { 
                  contents: [{ parts: [{ text: prompt }] }],
                  generationConfig: { maxOutputTokens: 4096 }
                };
                break;
              case 'groq':
                endpoint = 'https://api.groq.com/openai/v1/chat/completions';
                headers = { 
                  'Content-Type': 'application/json', 
                  'Authorization': 'Bearer ' + apiKey 
                };
                payload = { 
                  model: 'llama-3.1-70b-versatile', 
                  max_tokens: 4096, 
                  messages: [{ role: 'user', content: prompt }] 
                };
                break;
              case 'openrouter':
                endpoint = 'https://openrouter.ai/api/v1/chat/completions';
                headers = { 
                  'Content-Type': 'application/json', 
                  'Authorization': 'Bearer ' + apiKey,
                  'HTTP-Referer': window.location.href,
                  'X-Title': 'Automation Failure Intelligence'
                };
                payload = { 
                  model: 'meta-llama/llama-3.1-8b-instruct:free', 
                  max_tokens: 4096, 
                  messages: [{ role: 'user', content: prompt }] 
                };
                break;
              case 'claude':
                endpoint = 'https://api.anthropic.com/v1/messages';
                headers = {
                  'Content-Type': 'application/json',
                  'x-api-key': apiKey,
                  'anthropic-version': '2023-06-01',
                  'anthropic-dangerous-direct-browser-access': 'true'
                };
                payload = {
                  model: 'claude-sonnet-4-20250514',
                  max_tokens: 4096,
                  messages: [{ role: 'user', content: prompt }]
                };
                break;
              case 'openai':
                endpoint = 'https://api.openai.com/v1/chat/completions';
                headers = { 
                  'Content-Type': 'application/json', 
                  'Authorization': 'Bearer ' + apiKey 
                };
                payload = { 
                  model: 'gpt-4-turbo-preview', 
                  max_tokens: 4096, 
                  messages: [{ role: 'user', content: prompt }] 
                };
                break;
              default:
                throw new Error('Unknown provider: ' + provider);
            }
            
            // Call AI API via content script
            const data = await callAIApi(provider, endpoint, headers, payload);
            
            // Parse response based on provider
            let aiResponse;
            switch (provider) {
              case 'claude':
                aiResponse = data.content?.[0]?.text || 'No response received';
                break;
              case 'gemini':
                aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response received';
                break;
              default: // OpenAI, Groq, OpenRouter use same format
                aiResponse = data.choices?.[0]?.message?.content || 'No response received';
            }
            
            // Parse and display the AI response
            displayAIResult(aiResponse);
            
            autoAiBtn.innerHTML = '<span>✅</span> Analysis Complete!';
            autoAiBtn.style.background = 'linear-gradient(135deg,#10b981 0%,#059669 100%)';
            
          } catch (error) {
            console.error('AI Analysis Error:', error);
            aiResultContainer.style.display = 'block';
            aiResultContainer.style.background = '#2a1a1a';
            aiResultContainer.style.borderColor = '#d9534f';
            aiResultContent.innerHTML = \`
              <div style="color:#d9534f;font-weight:bold;margin-bottom:8px;">❌ AI Analysis Failed</div>
              <div style="color:#aaa;font-size:12px;">\${error.message}</div>
              <p style="color:#888;font-size:11px;margin-top:12px;">
                💡 <strong>Troubleshooting:</strong><br>
                • Check if your API key is valid<br>
                • For FREE options, try Google Gemini or Groq<br>
                • Use "Test Connection" to verify your key<br>
                • Try the "Generate Prompt" option to use manually
              </p>
            \`;
            
            autoAiBtn.innerHTML = '<span>❌</span> Failed - Try Again';
            autoAiBtn.style.background = 'linear-gradient(135deg,#d9534f 0%,#c9302c 100%)';
          } finally {
            autoAiBtn.disabled = false;
            setTimeout(() => {
              autoAiBtn.innerHTML = '<span>⚡</span> Auto AI Analysis';
              autoAiBtn.style.background = 'linear-gradient(135deg,#10b981 0%,#059669 100%)';
            }, 3000);
          }
        });
      }

      if (closeAiResultBtn) {
        closeAiResultBtn.addEventListener('click', function() {
          aiResultContainer.style.display = 'none';
        });
      }

      function displayAIResult(response) {
        aiResultContainer.style.display = 'block';
        aiResultContainer.style.background = '#1a2a1a';
        aiResultContainer.style.borderColor = '#10b981';
        
        // Try to parse structured verdict from response
        let verdictMatch = response.match(/\\*\\*Classification:\\*\\*\\s*(AUTOMATION_ISSUE|PRODUCT_ISSUE|NEEDS_MANUAL_REVIEW)/i);
        let confidenceMatch = response.match(/\\*\\*Confidence:\\*\\*\\s*(HIGH|MEDIUM|LOW)/i);
        
        let verdictBadge = '';
        if (verdictMatch) {
          const verdict = verdictMatch[1].toUpperCase();
          const confidence = confidenceMatch ? confidenceMatch[1].toUpperCase() : 'UNKNOWN';
          const verdictColor = verdict.includes('AUTOMATION') ? '#5bc0de' : 
                               verdict.includes('PRODUCT') ? '#d9534f' : '#f0ad4e';
          verdictBadge = \`
            <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
              <div style="background:\${verdictColor}22;border:2px solid \${verdictColor};border-radius:8px;padding:12px 20px;text-align:center;">
                <div style="font-size:14px;font-weight:bold;color:\${verdictColor};">\${verdict.replace('_', ' ')}</div>
                <div style="font-size:11px;color:#888;">AI Verdict</div>
              </div>
              <div style="background:#444;border-radius:8px;padding:12px 20px;text-align:center;">
                <div style="font-size:14px;font-weight:bold;color:#fff;">\${confidence}</div>
                <div style="font-size:11px;color:#888;">Confidence</div>
              </div>
            </div>
          \`;
        }
        
        // Convert markdown-style formatting to HTML
        let formattedResponse = response
          .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong style="color:#58a6ff;">$1</strong>')
          .replace(/\\n/g, '<br>')
          .replace(/---/g, '<hr style="border-color:#444;margin:16px 0;">')
          .replace(/^- /gm, '• ');
        
        aiResultContent.innerHTML = \`
          \${verdictBadge}
          <div style="background:#1a1a2e;border-radius:8px;padding:16px;max-height:400px;overflow-y:auto;font-size:13px;line-height:1.6;color:#e0e0e0;">
            \${formattedResponse}
          </div>
          <div style="margin-top:12px;display:flex;gap:8px;">
            <button onclick="navigator.clipboard.writeText(document.getElementById('afi-ai-raw-response').value);this.textContent='✅ Copied!';" 
                    style="background:#5cb85c;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-size:12px;">
              📋 Copy Full Response
            </button>
          </div>
          <textarea id="afi-ai-raw-response" style="display:none;">\${response}</textarea>
        \`;
      }

      // ============================================
      // API Configuration Handlers (Option 2)
      // ============================================
      const apiKeyInput = document.getElementById('afi-ai-api-key');
      const providerSelect = document.getElementById('afi-ai-provider');
      const saveApiKeyBtn = document.getElementById('afi-save-api-key');
      const testApiBtn = document.getElementById('afi-test-api');
      const apiStatusDiv = document.getElementById('afi-api-status');

      // Load saved API key if exists
      const savedKey = localStorage.getItem('afi_ai_api_key');
      const savedProvider = localStorage.getItem('afi_ai_provider');
      if (savedKey && apiKeyInput) {
        apiKeyInput.value = '••••••••••••••••'; // Masked display
        apiKeyInput.dataset.hasKey = 'true';
      }
      if (savedProvider && providerSelect) {
        providerSelect.value = savedProvider;
      }

      if (saveApiKeyBtn) {
        saveApiKeyBtn.addEventListener('click', function() {
          const key = apiKeyInput.value;
          const provider = providerSelect.value;
          
          if (!key || key === '••••••••••••••••') {
            showApiStatus('⚠️ Please enter a valid API key', '#f0ad4e');
            return;
          }
          
          localStorage.setItem('afi_ai_api_key', key);
          localStorage.setItem('afi_ai_provider', provider);
          
          apiKeyInput.value = '••••••••••••••••';
          apiKeyInput.dataset.hasKey = 'true';
          showApiStatus('✅ API key saved successfully!', '#5cb85c');
        });
      }

      if (testApiBtn) {
        testApiBtn.addEventListener('click', async function() {
          const key = localStorage.getItem('afi_ai_api_key');
          const provider = providerSelect.value;
          
          if (!key) {
            showApiStatus('⚠️ No API key saved. Please save your API key first.', '#f0ad4e');
            return;
          }
          
          showApiStatus('🔄 Testing connection...', '#5bc0de');
          testApiBtn.disabled = true;
          
          try {
            // Simple test request to verify API key
            let testEndpoint, testHeaders, testPayload;
            
            switch (provider) {
              case 'claude':
                testEndpoint = 'https://api.anthropic.com/v1/messages';
                testHeaders = {
                  'Content-Type': 'application/json',
                  'x-api-key': key,
                  'anthropic-version': '2023-06-01',
                  'anthropic-dangerous-direct-browser-access': 'true'
                };
                testPayload = {
                  model: 'claude-3-haiku-20240307',
                  max_tokens: 10,
                  messages: [{ role: 'user', content: 'Say "OK"' }]
                };
                break;
              case 'openai':
                testEndpoint = 'https://api.openai.com/v1/chat/completions';
                testHeaders = {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + key
                };
                testPayload = {
                  model: 'gpt-3.5-turbo',
                  max_tokens: 10,
                  messages: [{ role: 'user', content: 'Say OK' }]
                };
                break;
              case 'gemini':
                testEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + key;
                testHeaders = { 'Content-Type': 'application/json' };
                testPayload = {
                  contents: [{ parts: [{ text: 'Say OK' }] }]
                };
                break;
              case 'groq':
                testEndpoint = 'https://api.groq.com/openai/v1/chat/completions';
                testHeaders = {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + key
                };
                testPayload = {
                  model: 'llama-3.1-8b-instant',
                  max_tokens: 10,
                  messages: [{ role: 'user', content: 'Say OK' }]
                };
                break;
              case 'openrouter':
                testEndpoint = 'https://openrouter.ai/api/v1/chat/completions';
                testHeaders = {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + key,
                  'HTTP-Referer': window.location.href,
                  'X-Title': 'Automation Failure Intelligence'
                };
                testPayload = {
                  model: 'meta-llama/llama-3.1-8b-instruct:free',
                  max_tokens: 10,
                  messages: [{ role: 'user', content: 'Say OK' }]
                };
                break;
            }
            
            // Use the callAIApi helper to route through content script
            await callAIApi(provider, testEndpoint, testHeaders, testPayload);
            showApiStatus('✅ Connection successful! API key is valid.', '#5cb85c');
            
          } catch (error) {
            showApiStatus('❌ Connection failed: ' + error.message, '#d9534f');
            console.error('API Test Error:', error);
          } finally {
            testApiBtn.disabled = false;
          }
        });
      }

      function showApiStatus(message, color) {
        if (apiStatusDiv) {
          apiStatusDiv.style.display = 'block';
          apiStatusDiv.style.background = color + '22';
          apiStatusDiv.style.border = '1px solid ' + color;
          apiStatusDiv.style.color = color;
          apiStatusDiv.innerHTML = message;
        }
      }
    })();
  </script>
</body>
</html>`;

    // Open in new tab
    const blob = new Blob([reportHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  async function performDeepAnalysis(rowData, index) {
    const resultEl = document.getElementById(`afi-row-${index}`);
    const btn = resultEl?.querySelector('.afi-deep-analyze');
    
    // Progress update helper
    const updateProgress = (step, message) => {
      if (btn) {
        btn.textContent = `⏳ ${step}/6: ${message}`;
      }
      console.log(`AFI Progress [${step}/6]: ${message}`);
    };
    
    if (btn) {
      btn.textContent = '⏳ Initializing...';
      btn.disabled = true;
    }

    try {
      const row = document.getElementById(rowData.rowId) || rowData.element;
      if (!row) {
        throw new Error('Row element not found');
      }

      // Check cache first
      const testCaseIdForCache = rowData.rowId || rowData.caseName || '';
      const cachedResult = getCachedAnalysis(testCaseIdForCache);
      if (cachedResult) {
        console.log('AFI: Using cached analysis result');
        if (btn) btn.textContent = '⚡ Loading from cache...';
        await sleep(300);
        
        // Restore from cache
        const { inReportAnalysis, historyAnalysis, insight, inThisReportLink, pastFinalLink } = cachedResult;
        
        // Display cached result
        let analysisHtml = '<div class="afi-deep-result" style="margin-top:12px;padding:12px;background:#252535;border-radius:8px;border:1px solid #444;">';
        analysisHtml += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
        analysisHtml += '<span style="color:#f0ad4e;">⚡ <strong>Deep Analysis (Cached)</strong></span>';
        analysisHtml += '<button class="afi-close-deep" style="background:none;border:none;color:#888;cursor:pointer;font-size:18px;">×</button>';
        analysisHtml += '</div>';
        analysisHtml += insight.html;
        analysisHtml += '<br><br><div style="padding:10px;border-radius:5px;background:' + insight.bgColor + ';border:1px solid ' + insight.borderColor + '">';
        analysisHtml += '<strong>🎯 Verdict: ' + insight.verdict + '</strong><br>';
        analysisHtml += '<span style="font-size:12px">' + insight.confidence + '</span>';
        analysisHtml += '</div>';
        analysisHtml += '<br><button class="afi-open-report" style="background:#0f3460;color:#58a6ff;border:1px solid #1f4287;padding:8px 16px;border-radius:5px;cursor:pointer;width:100%;margin-top:10px;">📊 Open Full Analysis Report</button>';
        analysisHtml += '</div>';
        
        const existingDeep = resultEl.querySelector('.afi-deep-result');
        if (existingDeep) existingDeep.remove();
        resultEl.insertAdjacentHTML('beforeend', analysisHtml);
        
        // Add event handlers
        const reportBtn = resultEl.querySelector('.afi-open-report');
        if (reportBtn) {
          reportBtn.addEventListener('click', () => {
            openDeepAnalysisReport(rowData, inReportAnalysis, historyAnalysis, insight, inThisReportLink, pastFinalLink);
          });
        }
        const closeBtn = resultEl.querySelector('.afi-close-deep');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            const deepResult = resultEl.querySelector('.afi-deep-result');
            if (deepResult) deepResult.remove();
          });
        }
        
        openDeepAnalysisReport(rowData, inReportAnalysis, historyAnalysis, insight, inThisReportLink, pastFinalLink);
        
        if (btn) {
          btn.textContent = '🔬 Deep Analyze';
          btn.disabled = false;
        }
        return;
      }

      updateProgress(1, 'Locating row...');
      
      // Scroll to row
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.style.outline = '3px solid #4CAF50';
      await sleep(500);

      updateProgress(2, 'Finding Case History...');
      
      // Find Case History menu
      const menuItems = row.querySelectorAll('li');
      let caseHistoryItem = null;
      
      menuItems.forEach(item => {
        if (item.innerText.trim().includes('Case History')) {
          caseHistoryItem = item;
        }
      });

      if (!caseHistoryItem) {
        throw new Error('Case History menu not found. Click on the row to expand it first.');
      }

      // Try to find the test case ID from the row's data attributes or ID
      let rowTestCaseId = null;
      // Check row's ID attribute
      const rowId = row.id || row.getAttribute('id');
      if (rowId) {
        const idMatch = rowId.match(/(\d{4,})/);
        if (idMatch) {
          rowTestCaseId = idMatch[1];
          console.log('AFI Debug: Found test case ID from row ID:', rowTestCaseId);
        }
      }
      // Check for data attributes on the row
      if (!rowTestCaseId && row.dataset) {
        for (const key of Object.keys(row.dataset)) {
          if (key.toLowerCase().includes('testcase') || key.toLowerCase().includes('caseid') || key.toLowerCase().includes('id')) {
            const val = row.dataset[key];
            const idMatch = val && val.match(/(\d{4,})/);
            if (idMatch) {
              rowTestCaseId = idMatch[1];
              console.log('AFI Debug: Found test case ID from row data attr ' + key + ':', rowTestCaseId);
              break;
            }
          }
        }
      }
      // Check Case History menu item's parent for ID
      if (!rowTestCaseId) {
        const parentWithId = caseHistoryItem.closest('[id*="Test_Cases"], [data-testcaseid]');
        if (parentWithId) {
          const parentId = parentWithId.id || parentWithId.getAttribute('data-testcaseid');
          if (parentId) {
            const idMatch = parentId.match(/(\d{4,})/);
            if (idMatch) {
              rowTestCaseId = idMatch[1];
              console.log('AFI Debug: Found test case ID from parent element:', rowTestCaseId);
            }
          }
        }
      }
      // Check for any links in the row that contain Aalam URL pattern
      if (!rowTestCaseId) {
        const allLinks = row.querySelectorAll('a[href*="/history/testcaseid/"], a[href*="testcaseid"]');
        for (const link of allLinks) {
          const href = link.href;
          const idMatch = href.match(/testcaseid\/(\d+)/i) || href.match(/testcaseid[=\/](\d+)/i);
          if (idMatch) {
            rowTestCaseId = idMatch[1];
            console.log('AFI Debug: Found test case ID from link href:', rowTestCaseId, href);
            break;
          }
        }
      }
      // Check Case History item's children and ng-click attributes for test case ID
      if (!rowTestCaseId) {
        const elementsWithNgClick = row.querySelectorAll('[ng-click*="History"], [ng-click*="history"]');
        for (const el of elementsWithNgClick) {
          const ngClick = el.getAttribute('ng-click');
          console.log('AFI Debug: Found ng-click in row:', ngClick);
          const idMatch = ngClick && ngClick.match(/(\d{4,})/);
          if (idMatch) {
            rowTestCaseId = idMatch[1];
            console.log('AFI Debug: Found test case ID from ng-click:', rowTestCaseId);
            break;
          }
        }
      }
      // Try to get test case ID from AngularJS scope
      if (!rowTestCaseId && typeof angular !== 'undefined') {
        try {
          const scope = angular.element(caseHistoryItem).scope();
          if (scope) {
            // Common variable names used in AngularJS for test data
            const potentialIds = [
              scope.testCaseId, scope.testcaseid, scope.caseId, scope.caseid,
              scope.test?.id, scope.case?.id, scope.item?.testCaseId, scope.item?.id,
              scope.$parent?.testCaseId, scope.$parent?.test?.id
            ].filter(Boolean);
            for (const id of potentialIds) {
              if (typeof id === 'number' || (typeof id === 'string' && id.match(/^\d+$/))) {
                rowTestCaseId = String(id);
                console.log('AFI Debug: Found test case ID from Angular scope:', rowTestCaseId);
                break;
              }
            }
          }
        } catch (e) {
          console.log('AFI Debug: Could not access Angular scope:', e.message);
        }
      }
      // Also log the Case History item's ID for debugging
      console.log('AFI Debug: Case History item ID:', caseHistoryItem.id, 'Parent ID:', caseHistoryItem.parentElement?.id);

      // Hover to show submenu
      caseHistoryItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      await sleep(500);

      // Find submenu items - check multiple locations
      let submenuItems = caseHistoryItem.querySelectorAll('ul li, li');
      if (submenuItems.length === 0) {
        // Try looking in the row
        submenuItems = row.querySelectorAll('ul ul li');
      }
      if (submenuItems.length === 0) {
        // Try looking for any visible submenu near the element
        submenuItems = row.querySelectorAll('li ul li, .submenu li, [class*="submenu"] li');
      }
      
      let inThisReportLink = null;
      let pastFinalLink = null;
      let pastFinalElement = null;

      // Debug: log what we found
      console.log('AFI Debug: Found submenu items:', submenuItems.length);

      submenuItems.forEach(item => {
        const text = item.innerText.toLowerCase().trim();
        console.log('AFI Debug: Submenu item text:', text);
        
        if (text.includes('in this report')) {
          // Try multiple ways to find the anchor
          let anchor = item.querySelector('a');
          if (!anchor && item.tagName === 'A') anchor = item;
          if (!anchor) anchor = item.closest('a');
          if (anchor && anchor.href) {
            inThisReportLink = anchor.href;
            console.log('AFI Debug: Found In This Report link:', inThisReportLink);
          }
        }
        if (text.includes('past final result')) {
          pastFinalElement = item;
          // Try multiple ways to find the anchor
          let anchor = item.querySelector('a');
          if (!anchor && item.tagName === 'A') anchor = item;
          if (!anchor) anchor = item.closest('a');
          
          console.log('AFI Debug: Past Final Result element:', item.outerHTML.substring(0, 500));
          
          if (anchor && anchor.href) {
            pastFinalLink = anchor.href;
            console.log('AFI Debug: Found Past Final Results link:', pastFinalLink);
          } else {
            // Try to extract URL from various attributes
            const searchElements = [item, anchor, ...item.querySelectorAll('div, span, a')].filter(Boolean);
            
            for (const el of searchElements) {
              // Log all attributes for debugging
              const allAttrs = el.getAttributeNames ? el.getAttributeNames() : [];
              console.log('AFI Debug: Element attributes:', allAttrs.join(', '), 'for', el.tagName);
              
              // Check ng-click attribute (AngularJS)
              const ngClick = el.getAttribute && el.getAttribute('ng-click');
              if (ngClick) {
                console.log('AFI Debug: Found ng-click:', ngClick);
                // ng-click might contain function call like: showHistorySheet(22814, 'final')
                // Extract test case ID from ng-click
                const idMatch = ngClick.match(/showHistorySheet\s*\(\s*(\d+)/i) || 
                               ngClick.match(/showHistory\s*\(\s*(\d+)/i) ||
                               ngClick.match(/\(\s*(\d{4,})/);
                if (idMatch) {
                  const testCaseId = idMatch[1];
                  // Construct Aalam URL
                  pastFinalLink = `https://aalam-legacy.csez.zohocorpin.com/Qap/#/history/testcaseid/${testCaseId}?belongsTo=finalStatus&automationType=default&repository=ZOHOCRM`;
                  console.log('AFI Debug: Constructed Aalam URL from ng-click:', pastFinalLink);
                  break;
                }
              }
              
              // Check onclick attribute string for URL patterns
              const onclickAttr = el.getAttribute && el.getAttribute('onclick');
              if (onclickAttr) {
                console.log('AFI Debug: Found onclick attr:', onclickAttr.substring(0, 200));
                const urlMatch = onclickAttr.match(/https?:\/\/[^'"\s]+|\/[^'"\s]+\?[^'"\s]+/);
                if (urlMatch) {
                  pastFinalLink = urlMatch[0];
                  console.log('AFI Debug: Extracted URL from onclick:', pastFinalLink);
                  break;
                }
              }
              
              // Check data attributes for URLs or test case IDs
              if (el.dataset) {
                for (const key of Object.keys(el.dataset)) {
                  const val = el.dataset[key];
                  if (val && (val.includes('http') || val.includes('/Qap/'))) {
                    pastFinalLink = val;
                    console.log('AFI Debug: Found URL in data-' + key + ':', pastFinalLink);
                    break;
                  }
                  // Check for test case ID in data attributes
                  if (key.toLowerCase().includes('testcase') || key.toLowerCase().includes('caseid')) {
                    const idMatch = val.match(/\d{4,}/);
                    if (idMatch) {
                      pastFinalLink = `https://aalam-legacy.csez.zohocorpin.com/Qap/#/history/testcaseid/${idMatch[0]}?belongsTo=finalStatus&automationType=default&repository=ZOHOCRM`;
                      console.log('AFI Debug: Constructed Aalam URL from data attr:', pastFinalLink);
                      break;
                    }
                  }
                }
              }
              
              if (pastFinalLink) break;
            }
            
            // If still no link, try to extract via click interception
            if (!pastFinalLink) {
              console.log('AFI Debug: No URL found, attempting click-based extraction');
              // Find the clickable element - could be the anchor or the div
              const clickableEl = anchor || item.querySelector('.floatDivOptions') || item;
              
              // Intercept window.open calls
              const originalOpen = window.open;
              let capturedUrl = null;
              window.open = function(url, ...args) {
                capturedUrl = url;
                console.log('AFI Debug: Intercepted window.open URL:', url);
                // Restore immediately
                window.open = originalOpen;
                return null; // Don't actually open
              };
              
              // Simulate click to trigger the navigation
              try {
                clickableEl.click();
                // Give a tiny moment for any sync handlers
                if (capturedUrl) {
                  pastFinalLink = capturedUrl;
                  console.log('AFI Debug: Captured Past Final Results link via click:', pastFinalLink);
                }
              } catch (e) {
                console.log('AFI Debug: Click extraction failed:', e);
              }
              
              // Restore window.open in case it wasn't triggered
              window.open = originalOpen;
              
              if (!pastFinalLink && clickableEl) {
                pastFinalElement = clickableEl;
              }
            }
          }
        }
      });

      // Fallback: If pastFinalLink is still not found and we have rowTestCaseId, construct the URL
      if (!pastFinalLink && rowTestCaseId) {
        pastFinalLink = `https://aalam-legacy.csez.zohocorpin.com/Qap/#/history/testcaseid/${rowTestCaseId}?belongsTo=finalStatus&automationType=default&repository=ZOHOCRM`;
        console.log('AFI Debug: Using rowTestCaseId fallback to construct Aalam URL:', pastFinalLink);
      }

      // Fallback: Extract test case ID from inThisReportLink URL
      if (!pastFinalLink && inThisReportLink) {
        console.log('AFI Debug: Attempting to extract test case ID from In This Report link:', inThisReportLink);
        // The URL contains patterns like: caseId=TestCaseId_test_CheckJourneyForChildSegment_41847_0
        // We need to extract the numeric ID (41847)
        const caseIdMatch = inThisReportLink.match(/caseId=TestCaseId[^&]*?_(\d+)_\d+/i) ||
                           inThisReportLink.match(/caseId=[^&]*?(\d{4,})/i) ||
                           inThisReportLink.match(/testcaseid[^&]*?(\d{4,})/i);
        if (caseIdMatch) {
          const extractedTestCaseId = caseIdMatch[1];
          pastFinalLink = `https://aalam-legacy.csez.zohocorpin.com/Qap/#/history/testcaseid/${extractedTestCaseId}?belongsTo=finalStatus&automationType=default&repository=ZOHOCRM`;
          console.log('AFI Debug: Extracted test case ID from In This Report link:', extractedTestCaseId, '-> Aalam URL:', pastFinalLink);
        }
      }

      // Build analysis result
      let analysisHtml = '<div class="afi-deep-result">';
      analysisHtml += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
      analysisHtml += '<strong>🔬 Deep Analysis Result:</strong>';
      analysisHtml += '<button class="afi-close-deep" style="background:#d9534f;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px;">✕ Close</button>';
      analysisHtml += '</div>';
      
      updateProgress(3, 'Analyzing report data...');
      
      // Fetch and analyze historical data
      let historyAnalysis = null;
      let inReportAnalysis = null;
      
      // Extract test case ID for API calls
      let testCaseIdForApi = null;
      if (inThisReportLink) {
        const caseIdMatch = inThisReportLink.match(/caseId=TestCaseId[^&]*?_(\d+)_\d+/i) ||
                           inThisReportLink.match(/caseId=[^&]*?(\d{4,})/i);
        if (caseIdMatch) {
          testCaseIdForApi = caseIdMatch[1];
          console.log('AFI Debug: Extracted test case ID for API:', testCaseIdForApi);
        }
      }
      
      // Analyze "In This Report" - look at the current row's data in the DOM
      if (inThisReportLink) {
        analysisHtml += `✅ <a href="${inThisReportLink}" target="_blank" style="color:#58a6ff">View In This Report</a><br>`;
        
        try {
          // Extract the report name and base URL for API calls
          const reportUrlMatch = inThisReportLink.match(/reportsnew\/([^?]+)/);
          const reportName = reportUrlMatch ? reportUrlMatch[1] : null;
          const baseUrl = inThisReportLink.split('#')[0];
          
          // Extract the full case ID from the link
          const fullCaseIdMatch = inThisReportLink.match(/caseId=([^&]+)/);
          const fullCaseId = fullCaseIdMatch ? decodeURIComponent(fullCaseIdMatch[1]) : null;
          
          console.log('AFI Debug: Report name:', reportName, 'Full case ID:', fullCaseId);
          
          // Try to find all runs for this test case in the current page DOM
          let runElements = [];
          if (fullCaseId) {
            // Look for all rows with this test case ID
            const allRows = document.querySelectorAll('[id*="' + testCaseIdForApi + '"], [class*="' + testCaseIdForApi + '"]');
            runElements = Array.from(allRows);
            console.log('AFI Debug: Found rows with test case ID:', runElements.length);
          }
          
          // If we can't find by ID, look at visible row data
          let passCount = 0;
          let failCount = 1; // We know at least 1 failed (this one)
          let totalRuns = 1;
          
          // Check the URL for run indicator - patterns like _0, _1, _2 at end of case ID
          if (fullCaseId) {
            const runNumMatch = fullCaseId.match(/_(\d+)$/);
            if (runNumMatch) {
              const runNum = parseInt(runNumMatch[1]);
              // If run number > 0, there were previous runs
              totalRuns = runNum + 1; // Run numbers are typically 0-indexed
              console.log('AFI Debug: Detected run number from case ID:', runNum, '-> Total runs:', totalRuns);
            }
          }
          
          // Check if belongsTo parameter indicates this is in "final" failures
          const belongsToMatch = inThisReportLink.match(/belongsTo=([^&]+)/);
          const belongsTo = belongsToMatch ? belongsToMatch[1] : 'all';
          
          // Look at the current page for run count info
          const pageContent = document.body.innerHTML;
          
          // Pattern: Look for "1st run", "2nd run" etc in the page context
          const firstRunPassed = pageContent.match(/1st\s*run[^<]*pass|first\s*run[^<]*pass/i);
          const secondRunFailed = pageContent.match(/2nd\s*run[^<]*fail|second\s*run[^<]*fail/i);
          
          // If this is final failure and total runs > 1, assume (totalRuns - 1) passed
          if (belongsTo === 'all' && totalRuns > 1) {
            passCount = totalRuns - 1; // Previous runs might have passed
          }
          
          inReportAnalysis = {
            runs: [],
            firstRunPassed: passCount > 0 || !!firstRunPassed,
            secondRunFailed: failCount > 0 || !!secondRunFailed,
            hasMultipleRuns: totalRuns > 1,
            totalRuns: totalRuns,
            passCount: passCount,
            failCount: failCount
          };
          
          // Try to fetch actual run data from Qap API via background script (bypasses CORS)
          if (reportName && fullCaseId) {
            const qapBaseUrl = baseUrl || window.location.origin;
            const apiUrls = [
              `${qapBaseUrl}/Qap/api/reports/${reportName}/cases?caseId=${encodeURIComponent(fullCaseId)}`,
              `${qapBaseUrl}/Qap/api/v1/reports/${reportName}?caseId=${encodeURIComponent(fullCaseId)}`,
              `${qapBaseUrl}/Qap/getTestCaseRuns?reportName=${reportName}&caseId=${encodeURIComponent(fullCaseId)}`,
              `${qapBaseUrl}/Qap/api/reportsnew/${reportName}?caseId=${encodeURIComponent(fullCaseId)}&belongsTo=all`
            ];
            
            for (const apiUrl of apiUrls) {
              try {
                console.log('AFI Debug: Trying In This Report API via background script:', apiUrl);
                
                // Use background script to bypass CORS
                const bgResponse = await new Promise((resolve) => {
                  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                    chrome.runtime.sendMessage(
                      { action: 'fetchUrl', url: apiUrl },
                      (response) => {
                        if (chrome.runtime.lastError) {
                          console.log('AFI Debug: Background script error for In This Report:', chrome.runtime.lastError.message);
                          resolve(null);
                        } else {
                          resolve(response);
                        }
                      }
                    );
                  } else {
                    resolve(null);
                  }
                });
                
                if (bgResponse && bgResponse.success && bgResponse.data) {
                  const apiData = bgResponse.data;
                  console.log('AFI Debug: Got In This Report API data:', apiData);
                    
                  // Parse the API response
                  const runsData = Array.isArray(apiData) ? apiData : (apiData.data || apiData.runs || apiData.results || []);
                  if (runsData.length > 0) {
                    let apiPassCount = 0;
                    let apiFailCount = 0;
                    runsData.forEach(run => {
                      const status = (run.status || run.finalStatus || run.result || '').toLowerCase();
                      if (status.includes('pass') || status.includes('success')) apiPassCount++;
                      else if (status.includes('fail') || status.includes('error')) apiFailCount++;
                    });
                    
                    inReportAnalysis = {
                      runs: runsData,
                      firstRunPassed: apiPassCount > 0,
                      secondRunFailed: apiFailCount > 0,
                      hasMultipleRuns: runsData.length > 1,
                      totalRuns: runsData.length,
                      passCount: apiPassCount,
                      failCount: apiFailCount
                    };
                    console.log('AFI Debug: In This Report analysis (from API):', inReportAnalysis);
                    break; // Found data, exit loop
                  }
                }
              } catch (apiErr) {
                // Continue to next API pattern
                console.log('AFI Debug: API pattern failed:', apiErr.message);
              }
            }
          }
          
          console.log('AFI Debug: Final In This Report analysis:', inReportAnalysis);
        } catch (e) {
          console.error('AFI: Failed to analyze In This Report from DOM:', e);
          inReportAnalysis = { totalRuns: 0, passCount: 0, failCount: 0 };
        }
      } else {
        analysisHtml += '⚠️ "In This Report" link not found<br>';
      }

      updateProgress(4, 'Fetching history data...');
      
      // Analyze "Past Final Results" - compare historical patterns
      if (pastFinalLink) {
        analysisHtml += `✅ <a href="${pastFinalLink}" target="_blank" style="color:#58a6ff">View Past Final Results</a><br>`;
        
        // Extract test case ID from the pastFinalLink
        const testCaseIdMatch = pastFinalLink.match(/testcaseid\/(\d+)/i);
        const testCaseId = testCaseIdMatch ? testCaseIdMatch[1] : testCaseIdForApi;
        
        if (testCaseId) {
          try {
            // First, try to find historical data in the current page's DOM/Angular scope
            let foundInDom = false;
            
            // Try to get data from Angular scope on the current page
            if (typeof angular !== 'undefined') {
              try {
                const historyElements = document.querySelectorAll('[ng-repeat*="history"], [ng-repeat*="result"], [ng-repeat*="execution"], .history-row, .execution-row, [data-history]');
                if (historyElements.length > 0) {
                  let passCount = 0, failCount = 0;
                  historyElements.forEach(el => {
                    const scope = angular.element(el).scope();
                    if (scope) {
                      const item = scope.history || scope.result || scope.execution || scope.item || scope.$parent?.history;
                      if (item) {
                        const status = (item.status || item.finalStatus || item.result || '').toLowerCase();
                        if (status.includes('pass') || status.includes('success')) passCount++;
                        else if (status.includes('fail') || status.includes('error')) failCount++;
                      }
                    }
                    // Also check text content
                    const text = el.textContent.toLowerCase();
                    if (text.includes('passed') || text.includes('success')) passCount++;
                    else if (text.includes('failed') || text.includes('fail')) failCount++;
                  });
                  
                  if (passCount > 0 || failCount > 0) {
                    const total = passCount + failCount;
                    historyAnalysis = {
                      totalExecutions: total,
                      passCount,
                      failCount,
                      consecutiveFails: 0,
                      failureRate: total > 0 ? Math.round((failCount / total) * 100) : 0,
                      passRate: total > 0 ? Math.round((passCount / total) * 100) + '%' : '0%',
                      isFrequentlyFailing: failCount > passCount,
                      isIntermittent: passCount > 0 && failCount > 0,
                      isConsistentFailure: failCount >= 3 && passCount === 0,
                      lastNResults: [],
                      previousClassifications: { product: 0, automation: 0, unknown: 0 }
                    };
                    foundInDom = true;
                    console.log('AFI Debug: Got history from Angular scope in DOM:', historyAnalysis);
                  }
                }
              } catch (e) {
                console.log('AFI Debug: Could not get Angular data:', e);
              }
            }
            
            // If not found in DOM, try API calls via background script (bypasses CORS)
            if (!foundInDom) {
              console.log('AFI Debug: Using background script for cross-origin API calls');
              
              try {
                // Send message to background script to fetch history data
                const bgResponse = await new Promise((resolve) => {
                  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                    chrome.runtime.sendMessage(
                      { action: 'fetchHistoryData', testCaseId: testCaseId },
                      (response) => {
                        if (chrome.runtime.lastError) {
                          console.log('AFI Debug: Background script error:', chrome.runtime.lastError.message);
                          resolve(null);
                        } else {
                          resolve(response);
                        }
                      }
                    );
                  } else {
                    console.log('AFI Debug: chrome.runtime not available');
                    resolve(null);
                  }
                });
                
                if (bgResponse && bgResponse.success && bgResponse.data) {
                  console.log('AFI Debug: Got data from background script:', bgResponse.data);
                  if (bgResponse.data.data) {
                    // API JSON response
                    historyAnalysis = parseHistoryApiResponse(bgResponse.data.data);
                  } else if (bgResponse.data.html) {
                    // HTML response - try to parse it
                    const htmlText = bgResponse.data.html;
                    const passMatches = (htmlText.match(/pass(ed)?/gi) || []).length;
                    const failMatches = (htmlText.match(/fail(ed)?/gi) || []).length;
                    if (passMatches > 0 || failMatches > 0) {
                      const total = passMatches + failMatches;
                      historyAnalysis = {
                        totalExecutions: total,
                        passCount: passMatches,
                        failCount: failMatches,
                        consecutiveFails: 0,
                        failureRate: total > 0 ? Math.round((failMatches / total) * 100) : 0,
                        passRate: total > 0 ? Math.round((passMatches / total) * 100) + '%' : '0%',
                        isFrequentlyFailing: failMatches > passMatches,
                        isIntermittent: passMatches > 0 && failMatches > 0,
                        isConsistentFailure: failMatches >= 3 && passMatches === 0,
                        lastNResults: [],
                        previousClassifications: { product: 0, automation: 0, unknown: 0 },
                        note: 'Data estimated from history page (via background script)'
                      };
                    }
                  }
                }
              } catch (bgError) {
                console.log('AFI Debug: Background script call failed:', bgError);
              }
            } // close if (!foundInDom)

            // If still no data, try DOM-based extraction as fallback
            if (!historyAnalysis || historyAnalysis.totalExecutions === 0) {
              // Try to find historical data by looking at any expanded history panels in the DOM
              console.log('AFI Debug: No API data, attempting DOM-based history extraction');
              
              // Look for any pass/fail indicators in the page
              let domPassCount = 0, domFailCount = 0;
              
              // Check for common history row patterns
              const historyRowSelectors = [
                '.history-row', '.execution-row', '[class*="history"]', 
                '[class*="execution"]', 'tr[class*="pass"]', 'tr[class*="fail"]',
                '.pass-row', '.fail-row', '[data-status]'
              ];
              
              historyRowSelectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                  const text = el.textContent.toLowerCase();
                  const className = (el.className || '').toLowerCase();
                  const dataStatus = (el.getAttribute('data-status') || '').toLowerCase();
                  
                  if (className.includes('pass') || dataStatus.includes('pass') || 
                      (text.includes('pass') && !text.includes('fail'))) {
                    domPassCount++;
                  } else if (className.includes('fail') || dataStatus.includes('fail') ||
                             text.includes('fail')) {
                    domFailCount++;
                  }
                });
              });
              
              // Check for status icons or badges
              const passIcons = document.querySelectorAll('.pass-icon, .success-icon, [class*="pass"][class*="icon"], .status-pass').length;
              const failIcons = document.querySelectorAll('.fail-icon, .error-icon, [class*="fail"][class*="icon"], .status-fail').length;
              domPassCount += passIcons;
              domFailCount += failIcons;
              
              if (domPassCount > 0 || domFailCount > 0) {
                const total = domPassCount + domFailCount;
                historyAnalysis = {
                  totalExecutions: total,
                  passCount: domPassCount,
                  failCount: domFailCount,
                  consecutiveFails: 0,
                  failureRate: total > 0 ? Math.round((domFailCount / total) * 100) : 0,
                  passRate: total > 0 ? Math.round((domPassCount / total) * 100) + '%' : '0%',
                  isFrequentlyFailing: domFailCount > domPassCount,
                  isIntermittent: domPassCount > 0 && domFailCount > 0,
                  isConsistentFailure: domFailCount >= 3 && domPassCount === 0,
                  lastNResults: [],
                  previousClassifications: { product: 0, automation: 0, unknown: 0 },
                  note: 'Data extracted from current page DOM'
                };
                console.log('AFI Debug: Extracted history from page DOM:', historyAnalysis);
              } else {
                // Complete fallback - no data available
                console.log('AFI Debug: No historical data found via any method. Test case ID:', testCaseId, 'Link:', pastFinalLink);
                historyAnalysis = {
                  totalExecutions: 0,
                  passCount: 0,
                  failCount: 0,
                  consecutiveFails: 0,
                  failureRate: 0,
                  passRate: 'Unknown',
                  isFrequentlyFailing: false,
                  isIntermittent: false,
                  isConsistentFailure: false,
                  lastNResults: [],
                  previousClassifications: { product: 0, automation: 0, unknown: 0 },
                  unavailable: true, // Flag to show user a message
                  testCaseId: testCaseId, // Include test case ID for display
                  note: 'Review manually - API endpoints not reachable'
                };
                console.log('AFI Debug: No historical data available, using placeholder');
              }
            } // close if (!historyAnalysis)
            
            console.log('AFI Debug: History analysis:', historyAnalysis);
          } catch (e) {
            console.log('AFI Debug: Could not fetch Past Final Results (expected if API not available):', e.message);
            historyAnalysis = {
              totalExecutions: 0,
              passCount: 0,
              failCount: 0,
              consecutiveFails: 0,
              failureRate: 0,
              passRate: 'Unknown',
              isFrequentlyFailing: false,
              isIntermittent: false,
              isConsistentFailure: false,
              lastNResults: [],
              previousClassifications: { product: 0, automation: 0, unknown: 0 },
              unavailable: true,
              note: 'Review manually - API endpoints not reachable'
            };
          }
        }
      } else if (pastFinalElement) {
        analysisHtml += '⚠️ Past Final Results - No direct link (clicking to open)<br>';
        pastFinalElement.click();
      } else {
        analysisHtml += '⚠️ "Past Final Results" not found<br>';
      }

      updateProgress(5, 'Generating insights...');
      
      // Generate insights based on analysis
      analysisHtml += '<br><hr style="border-color:#444;margin:10px 0;"><br>';
      analysisHtml += '<strong>📊 Automated Analysis:</strong><br><br>';
      
      const insight = generateInsight(inReportAnalysis, historyAnalysis, rowData);
      analysisHtml += insight.html;
      
      analysisHtml += '<br><br><div style="padding:10px;border-radius:5px;background:' + insight.bgColor + ';border:1px solid ' + insight.borderColor + '">';
      analysisHtml += '<strong>🎯 Verdict: ' + insight.verdict + '</strong><br>';
      analysisHtml += '<span style="font-size:12px">' + insight.confidence + '</span>';
      analysisHtml += '</div>';

      // Add button to open full report
      analysisHtml += '<br><button class="afi-open-report" style="background:#0f3460;color:#58a6ff;border:1px solid #1f4287;padding:8px 16px;border-radius:5px;cursor:pointer;width:100%;margin-top:10px;">📊 Open Full Analysis Report</button>';

      analysisHtml += '</div>';

      updateProgress(6, 'Displaying results...');
      
      // Cache the analysis result
      setCachedAnalysis(testCaseIdForCache, {
        inReportAnalysis,
        historyAnalysis,
        insight,
        inThisReportLink,
        pastFinalLink
      });

      // Add result to the card
      const existingDeep = resultEl.querySelector('.afi-deep-result');
      if (existingDeep) existingDeep.remove();
      resultEl.insertAdjacentHTML('beforeend', analysisHtml);

      // Add click handler for report button
      const reportBtn = resultEl.querySelector('.afi-open-report');
      if (reportBtn) {
        reportBtn.addEventListener('click', () => {
          openDeepAnalysisReport(rowData, inReportAnalysis, historyAnalysis, insight, inThisReportLink, pastFinalLink);
        });
      }

      // Add click handler for close button
      const closeBtn = resultEl.querySelector('.afi-close-deep');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          const deepResult = resultEl.querySelector('.afi-deep-result');
          if (deepResult) deepResult.remove();
        });
      }

      // Auto-open the detailed report page
      openDeepAnalysisReport(rowData, inReportAnalysis, historyAnalysis, insight, inThisReportLink, pastFinalLink);

      // Reset outline after delay
      setTimeout(() => row.style.outline = '', 5000);

    } catch (error) {
      console.error('Deep analysis error:', error);
      alert('Deep Analysis Error:\n' + error.message + '\n\nTip: Make sure the row is expanded to see the Case History menu.');
    } finally {
      if (btn) {
        btn.textContent = '🔬 Deep Analyze';
        btn.disabled = false;
      }
    }
  }

  // ============================================
  // MAIN EXECUTION
  // ============================================

  function init() {
    console.log("🔍 Analyzing page for automation failures...");
    
    // Check if this report was already verified
    const verificationStatus = isReportVerified();
    if (verificationStatus) {
      console.log("📋 This report was already verified on:", verificationStatus.verifiedAt);
      showVerifiedOnlyPanel(verificationStatus);
      return;
    }
    
    setTimeout(async () => {
      console.log('🔄 Starting analysis with DOM validation...');
      const results = await analyzeAllFailures();
      console.log(`📊 Analysis complete: ${results.length} failures found`);
      createPanel(results);
      
      // Notify popup to close itself after analysis is complete
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'analysisComplete', resultsCount: results.length });
      }
    }, 2000);
  }

  // Show panel for already verified reports
  function showVerifiedOnlyPanel(verificationStatus) {
    const existingPanel = document.getElementById(CONFIG.panelId);
    if (existingPanel) existingPanel.remove();
    
    const existingBadge = document.getElementById('afi-minimize-badge');
    if (existingBadge) existingBadge.remove();

    const verifiedDate = new Date(verificationStatus.verifiedAt).toLocaleString();
    const feedbackText = verificationStatus.feedbackSubmitted 
      ? '✅ Verified & Feedback Submitted' 
      : '✅ Verified';

    const panel = document.createElement('div');
    panel.id = CONFIG.panelId;
    panel.innerHTML = `
      <style>
        #${CONFIG.panelId} {
          position: fixed;
          top: 10px;
          right: 10px;
          width: 340px;
          background: #1a1a2e;
          color: #eee;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
          z-index: 99999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 13px;
          overflow: hidden;
          border: 2px solid #059669;
        }
        #${CONFIG.panelId} .afi-header {
          background: linear-gradient(135deg, #059669 0%, #047857 100%);
          padding: 14px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        #${CONFIG.panelId} .afi-title {
          font-weight: 600;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        #${CONFIG.panelId} .afi-close {
          background: none;
          border: none;
          color: rgba(255,255,255,0.8);
          font-size: 20px;
          cursor: pointer;
          padding: 0 4px;
        }
        #${CONFIG.panelId} .afi-close:hover { color: #fff; }
      </style>
      <div class="afi-header">
        <span class="afi-title">✅ ${feedbackText}</span>
        <button class="afi-close" id="afi-close-verified" title="Close">✕</button>
      </div>
      <div style="padding: 20px; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 12px;">🎉</div>
        <div style="color: #059669; font-size: 16px; font-weight: 600; margin-bottom: 8px;">
          Report Already Verified
        </div>
        <div style="color: #888; font-size: 12px; margin-bottom: 16px;">
          Verified on: ${verifiedDate}
        </div>
        ${verificationStatus.feedbackSubmitted 
          ? `<div style="background: #059669; color: white; padding: 8px 16px; border-radius: 20px; display: inline-block; font-size: 12px;">
              ✓ Feedback was submitted
            </div>`
          : `<button id="afi-submit-feedback-now" style="
              background: #6366f1;
              color: white;
              border: none;
              padding: 10px 20px;
              border-radius: 8px;
              cursor: pointer;
              font-size: 13px;
              font-weight: 500;
            ">💬 Submit Feedback Now</button>`
        }
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #333;">
          <button id="afi-reanalyze" style="
            background: transparent;
            color: #888;
            border: 1px solid #444;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
          ">🔄 Re-analyze Report</button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    // Close button
    document.getElementById('afi-close-verified').addEventListener('click', () => {
      panel.remove();
    });

    // Submit feedback button (if feedback not yet submitted)
    const feedbackBtn = document.getElementById('afi-submit-feedback-now');
    if (feedbackBtn) {
      feedbackBtn.addEventListener('click', () => {
        showSatisfactionSurvey({});
      });
    }

    // Re-analyze button (clears verification and runs analysis)
    document.getElementById('afi-reanalyze').addEventListener('click', () => {
      // Clear verification for this report
      try {
        const data = localStorage.getItem(VERIFICATION_STORAGE_KEY);
        const verifiedReports = data ? JSON.parse(data) : {};
        delete verifiedReports[getReportKey()];
        localStorage.setItem(VERIFICATION_STORAGE_KEY, JSON.stringify(verifiedReports));
      } catch (e) {
        console.error('Error clearing verification:', e);
      }
      
      panel.remove();
      
      // Run fresh analysis
      setTimeout(async () => {
        console.log('🔄 Starting re-analysis with DOM validation...');
        const results = await analyzeAllFailures();
        console.log(`📊 Re-analysis complete: ${results.length} failures found`);
        createPanel(results);
      }, 500);
    });
  }

  // Do NOT auto-run on page load - wait for user to click "Analyze Page" from extension
  console.log("🔍 Automation Failure Intelligence ready - click 'Analyze Page' from extension to start");

  // ============================================
  // MESSAGE LISTENER FOR BLOB PAGE API CALLS
  // ============================================
  // The Deep Analysis report opens in a new tab as a blob URL
  // It can't access chrome.runtime, so it uses postMessage to communicate
  // This listener handles API calls from the blob page
  window.addEventListener('message', async function(event) {
    // Only handle AFI messages
    if (!event.data || event.data.source !== 'AFI_REPORT_PAGE') return;
    
    console.log('AFI: Received message from report page:', event.data.type);
    
    if (event.data.type === 'AI_API_CALL') {
      const { requestId, provider, endpoint, headers, payload } = event.data;
      
      try {
        // Make the API call via background script
        chrome.runtime.sendMessage({
          type: 'aiApiCall',
          provider: provider,
          endpoint: endpoint,
          headers: headers,
          payload: payload
        }, function(response) {
          // Send response back to the blob page
          if (event.source) {
            event.source.postMessage({
              source: 'AFI_CONTENT_SCRIPT',
              type: 'AI_API_RESPONSE',
              requestId: requestId,
              success: response?.success || false,
              data: response?.data,
              error: response?.error
            }, '*');
          }
        });
      } catch (error) {
        if (event.source) {
          event.source.postMessage({
            source: 'AFI_CONTENT_SCRIPT',
            type: 'AI_API_RESPONSE',
            requestId: requestId,
            success: false,
            error: error.message
          }, '*');
        }
      }
    }
  });

  // Expose API for external use (triggered by popup.js)
  window.AFI = {
    analyze: init,
    getResults: async () => window.AFI_RESULTS || await analyzeAllFailures(),
    openFullReport: async () => openFullReport(window.AFI_RESULTS || await analyzeAllFailures()),
    refresh: init,
    deepAnalyze: performDeepAnalysis
  };

})();
