/**
 * Extension Validation Test Script
 * Tests the pattern matching logic against actual failure data from the report page
 */

// Actual failure messages from the report page (WITH case descriptions)
const testCases = [
  {
    row: 1,
    name: "ABM",
    failure: "Explore ABM button not available after waiting 150 seconds - WMS MOCKING APPLIED",
    reason: "ABM not configured properly",
    caseDescription: "1.Create a record in account module 2.Reset and do a plain ABM configuration"
  },
  {
    row: 2,
    name: "ABMSuggestedSegments",
    failure: "Accounts tab in suggested segments element is not present after 15 seconds",
    reason: "Absence Of: Accounts tab in suggested segments",
    caseDescription: "1.Create 10 accounts and deals 2.Configure ABM, verify the accounts list"
  },
  {
    row: 3,
    name: "BasicCase",
    failure: "clicking on Vendors tab",
    reason: "ElementClickInterceptedException - Element is not clickable at point because another element alertFreezeLayer obscures it",
    caseDescription: "1.Create a portal for Vendors with field as Email"
  },
  {
    row: 4,
    name: "BluePrint",
    failure: "while adding an link in blueprint transition",
    reason: "NoSuchElementException - Blueprint stateOption2 in process flow chart not found",
    caseDescription: "1.create a blueprint and add notes and attachments"
  },
  {
    row: 5,
    name: "BuildCustomApp",
    failure: "Error msg - red alert element is not present after 5 seconds",
    reason: "Absence Of: Error msg - red alert",
    // KEY: This case description mentions "special characters" validation
    caseDescription: "1.Validating the max characters and special characters in create application popup 2.Validating the custom tab name"
  },
  {
    row: 6,
    name: "BusinessHours",
    failure: "Shift hrs is not showing in calendar",
    reason: "UnExpected values are found. UnExpected: [[09:00 AM]]",
    caseDescription: "1.create a business hour and create a shift hour"
  },
  // Validation alert test cases
  {
    row: 7,
    name: "KanbanView",
    failure: "Kanban View Name validation error",
    reason: "Kanban View Name cannot be empty",
    caseDescription: "1.Create a kanban view"
  },
  {
    row: 8,
    name: "FormValidation",
    failure: "Form submission failed",
    reason: "This field is required - please enter a value",
    caseDescription: "1.Test form submission"
  },
  {
    row: 9,
    name: "RequiredField",
    failure: "Save button clicked but form not saved",
    reason: "Email field cannot be blank",
    caseDescription: "1.Edit user profile"
  },
  // NEW: Test case with special characters - should be AUTOMATION
  {
    row: 10,
    name: "SpecialCharsTest",
    failure: "Tab Group Name field shows error",
    reason: "do not use special characters",
    caseDescription: "1.Validating special characters in tab group name field"
  },
  // Row 20 from actual report - invalid domain test
  {
    row: 20,
    name: "DashboardAnalytics",
    failure: "While verifying the Validation message for allowed domain input field in Embed URL pop up",
    reason: "NoSuchElementException - Done Button in EmbedURL popup not found",
    caseDescription: "1.Create a dashboard with a chart 2.Click Embed URL from more options 3.Enter the value for allowed domains as !@#$%^& 4.Click Save and check if the validation alert is shown"
  },
  // Row 20 variant - WITH 400 status code (like the actual Full Report shows)
  {
    row: "20b",
    name: "DashboardAnalyticsWithStatus",
    failure: "While verifying the Validation message for allowed domain input field in Embed URL pop up. Failed Requests: https://crmqa.localzoho.com/crm/v2.2/__internal/settings/extensions/voc/configuration Method --GET Status --400",
    reason: "API returned 400 error during validation test",
    caseDescription: "1.Create a dashboard with a chart 2.Click Embed URL from more options 3.Enter the value for allowed domains as !@#$%^& 4.Click Save and check if the validation alert is shown"
  },
  // Alert validation test
  {
    row: 21,
    name: "BusinessHoursAlert",
    failure: "Alert is shown",
    reason: "Due To Presence of: Alert that appears on event popup when event overlaps",
    caseDescription: "1.Create a shift with different timing 2.Create event with time out of shift hour and ensure alert is shown"
  }
];

// Extension's pattern database (same as contentScript.js)
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
      "alertFreezeLayer",
      "overlay",
      "is not clickable at point.*because another element"
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
      "DUPLICATE_DATA"
    ],
    category: "Test Setup/Data Issue",
    suggestion: "Check test preconditions and data setup"
  },
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
      // Special characters patterns
      "do not use special characters",
      "special characters not allowed",
      "special characters are not allowed",
      "invalid characters",
      "please do not use special characters"
    ],
    category: "Input Validation Error",
    suggestion: "Automation provided invalid test data - check input values"
  },
  invalidTestDataIssues: {
    patterns: [
      "Validating.*special characters",
      "special characters.*validation",
      "max characters.*validation",
      "Validating.*max characters"
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
      "NullPointerException",
      "ServiceUnavailable"
    ],
    category: "Server/Backend Error",
    severity: "HIGH"
  },
  functionalityIssues: {
    patterns: [
      "Sorry, something went wrong",
      "Unexpected error"
    ],
    category: "Functionality Error",
    severity: "HIGH"
  },
  validationIssues: {
    patterns: [
      "validation.*should.*show.*but.*not",
      "expected.*validation.*error.*not.*display",
      "validation message.*not.*shown",
      "expected.*alert.*but.*not.*present"
    ],
    category: "Validation Not Triggered",
    severity: "MEDIUM"
  }
};

// Analysis function (same as extension) - updated with caseDescription support
function analyzeFailure(text, caseDescription = '') {
  const result = {
    verdict: "NEEDS_REVIEW",
    confidence: 0,
    category: "Unknown",
    matchedPattern: null,
    suggestion: "Manual review required"
  };

  // PRIORITY CHECK: If case description mentions test data validation scenarios,
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
    // Invalid input testing
    /give.*invalid/i,
    /provide.*invalid/i,
    /enter.*invalid/i,
    /invalid.*key/i,
    /invalid.*url/i,
    /invalid.*domain/i,
    // Empty/space testing
    /set.*as.*empty/i,
    /provide.*space/i,
    /give.*space/i,
    /space.*alone/i,
    // Max limit/boundary testing
    /max.*limit/i,
    /check.*limit/i,
    /exceed.*limit/i
  ];

  const hasTestDataScenario = testDataPatterns.some(p => p.test(caseDescription));
  
  if (hasTestDataScenario) {
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
      /button.*not found/i,
      /not found$/i,
      /Alert is shown/i,
      /alert.*presence/i,
      /Due To Presence of.*Alert/i,
      /validation message/i,
      /validating/i,
      /allowed domain/i,
      /embed.*url/i
    ];
    
    // For test data scenarios with special characters or invalid input,
    // a 400 status is EXPECTED behavior (validation rejection), not a product issue
    const expectedValidationResponses = [
      /status.*400/i,
      /status --400/i,
      /bad request/i
    ];
    
    const hasAutomationSignal = automationSignalPatterns.some(p => p.test(text));
    const hasExpectedValidationResponse = expectedValidationResponses.some(p => p.test(text));
    
    if (hasAutomationSignal || hasExpectedValidationResponse) {
      result.verdict = "AUTOMATION_ISSUE";
      result.confidence = 90;
      result.category = "Invalid Test Data / Validation Test";
      result.matchedPattern = "Test data validation scenario";
      result.suggestion = "Test uses intentionally invalid input for validation testing - expected behavior";
      return result;
    }
  }

  // Check product patterns first
  for (const [key, patternGroup] of Object.entries(PRODUCT_PATTERNS)) {
    for (const pattern of patternGroup.patterns) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(text)) {
        result.verdict = "PRODUCT_ISSUE";
        result.confidence = 85;
        result.category = patternGroup.category;
        result.matchedPattern = pattern;
        result.severity = patternGroup.severity;
        return result;
      }
    }
  }

  // Check automation patterns
  for (const [key, patternGroup] of Object.entries(AUTOMATION_PATTERNS)) {
    for (const pattern of patternGroup.patterns) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(text)) {
        result.verdict = "AUTOMATION_ISSUE";
        result.confidence = 80;
        result.category = patternGroup.category;
        result.matchedPattern = pattern;
        result.suggestion = patternGroup.suggestion;
        return result;
      }
    }
  }

  return result;
}

// Run validation
console.log("=".repeat(70));
console.log("🔍 AUTOMATION FAILURE INTELLIGENCE - EXTENSION VALIDATION TEST");
console.log("=".repeat(70));
console.log("");

let productCount = 0;
let automationCount = 0;
let needsReviewCount = 0;

testCases.forEach(tc => {
  const combinedText = `${tc.failure} ${tc.reason}`;
  const result = analyzeFailure(combinedText, tc.caseDescription || '');
  
  const emoji = result.verdict === 'PRODUCT_ISSUE' ? '🔴' : 
                result.verdict === 'AUTOMATION_ISSUE' ? '🟡' : '🔵';
  
  if (result.verdict === 'PRODUCT_ISSUE') productCount++;
  else if (result.verdict === 'AUTOMATION_ISSUE') automationCount++;
  else needsReviewCount++;
  
  console.log(`Row ${tc.row}: ${tc.name}`);
  console.log(`  Failure: ${tc.failure.substring(0, 60)}...`);
  if (tc.caseDescription) {
    console.log(`  Case Desc: ${tc.caseDescription.substring(0, 50)}...`);
  }
  console.log(`  ${emoji} Verdict: ${result.verdict}`);
  console.log(`  📁 Category: ${result.category}`);
  console.log(`  🎯 Confidence: ${result.confidence}%`);
  console.log(`  🔎 Matched: "${result.matchedPattern}"`);
  console.log(`  💡 Suggestion: ${result.suggestion}`);
  console.log("");
});

console.log("=".repeat(70));
console.log("📊 SUMMARY");
console.log("=".repeat(70));
console.log(`  🔴 Product Issues:    ${productCount}`);
console.log(`  🟡 Automation Issues: ${automationCount}`);
console.log(`  🔵 Needs Review:      ${needsReviewCount}`);
console.log("");
console.log("✅ Extension validation complete!");
