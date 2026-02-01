/**
 * List of companies to skip during job scraping and application
 * 
 * Add company names (case-insensitive) that you want to filter out.
 * Partial matches work - e.g., "accenture" will match "Accenture India", "Accenture Solutions", etc.
 */

const BLOCKED_COMPANIES = [
  // Recruitment agencies
  "rgb",
  "gedu",
  "uplers",
  "Leading Client",
  
  // Mass recruiters / Service companies
  "accenture",
  "accenture solutions",
  "accenture india",
  "accenture pvt",
  "accenture limited",
  "tcs",
  "tata consultancy",
  "tcs limited",
  "wipro",
  "infosys",
  "cognizant",
  "capgemini",
  "hcl",
  "tech mahindra",
  
  // Add more companies here as needed
  // "company name",
];

/**
 * Check if a company should be blocked
 * @param {string} companyName - The company name to check
 * @returns {boolean} - True if company should be blocked
 */
function isCompanyBlocked(companyName) {
  if (!companyName) return false;
  
  const companyLower = companyName.toLowerCase().trim();
  
  return BLOCKED_COMPANIES.some(blockedCompany => 
    companyLower.includes(blockedCompany.toLowerCase())
  );
}

/**
 * Get the matched blocked company pattern
 * @param {string} companyName - The company name to check
 * @returns {string|null} - The matched pattern or null
 */
function getBlockedCompanyMatch(companyName) {
  if (!companyName) return null;
  
  const companyLower = companyName.toLowerCase().trim();
  
  return BLOCKED_COMPANIES.find(blockedCompany => 
    companyLower.includes(blockedCompany.toLowerCase())
  );
}

module.exports = {
  BLOCKED_COMPANIES,
  isCompanyBlocked,
  getBlockedCompanyMatch,
};
