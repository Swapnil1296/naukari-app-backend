const skipKeywords = require("../utils/common-constant");

/** Escape special regex characters so term is matched literally (e.g. "node.js" won't match "nodexjs"). */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function filterJobTitle(jobTitle) {
  const hasDeveloperOrEngineer = /develop(er|ment)|engineer/i.test(jobTitle);
  const hasSkipKeyword = skipKeywords.some((keyword) =>
    jobTitle.toLowerCase().includes(keyword)
  );

  return {
    isValidTitle: hasDeveloperOrEngineer && !hasSkipKeyword,
  };
}

function checkFullstackRequirements(jobTitle, description, skillChips) {
  const isFullstack = /fullstack\s*(developer|engineer)/i.test(jobTitle);

  if (isFullstack) {
    const nodeKeywords = ["node", "node.js", "nodejs"];
    const hasNodeKeyword = nodeKeywords.some(
      (keyword) =>
        description.toLowerCase().includes(keyword) ||
        skillChips.some((skill) => skill.toLowerCase().includes(keyword))
    );
    return {
      isValidFullstack: hasNodeKeyword,
    };
  }
  return { isValidFullstack: true };
}

function extractExperienceRequirement(description) {
  if (!description) {
    return {
      isValid: true,
      reason: "No description provided",
    };
  }

  const experiencePatterns = [
    // Pattern for range (2-5 years)
    /(\d+)\s*(?:to|-)\s*(\d+)\s*years?\s*(?:of\s*)?experience/i,
    // Pattern for X+ years
    /(\d+)\+?\s*years?\s*(?:of\s*)?experience/i,
    // Pattern for minimum X years
    /minimum\s*(\d+)\s*years?\s*(?:of\s*)?experience/i,
    // Pattern for at least X years
    /at\s*least\s*(\d+)\s*years?\s*(?:of\s*)?experience/i,
  ];

  let experienceMentioned = false;
  let experienceMatch = null;

  for (const pattern of experiencePatterns) {
    const match = description.match(pattern);
    if (match) {
      experienceMentioned = true;
      const originalMatch = match[0];
      experienceMatch = match[0];

      // Handle range pattern (e.g., "2 to 5 years")
      if (match[2]) {
        const minYears = parseInt(match[1], 10);
        const maxYears = parseInt(match[2], 10);
        const isInRange = minYears >= 1 && minYears <= 3;

        return {
          isValid: isInRange,
          min: minYears,
          max: maxYears,
          originalMatch: originalMatch,
          reason: isInRange
            ? "Experience requirement matched"
            : "Experience requirement NOT matched",
        };
      } else {
        // Handle single number pattern
        const minYears = parseInt(match[1], 10);
        const isInRange = minYears >= 1 && minYears <= 3;

        return {
          isValid: isInRange,
          min: minYears,
          max: null,
          originalMatch: originalMatch,
          reason: isInRange
            ? "Experience requirement matched"
            : "Experience requirement NOT matched",
        };
      }
    }
  }

  if (!experienceMentioned) {
    return {
      isValid: true,
      reason: "No experience requirement mentioned",
    };
  }

  return {
    isValid: false,
    reason:
      "Invalid experience format or experience requirement doesn't match",
    originalMatch: experienceMatch,
  };
}

function bonusForTitle(jobTitle) {
  let bonus = 0;
  const reactPattern = /react\s*js(?:\s+(?:frontend|web))?\s*developer/i;
  if (reactPattern.test(jobTitle)) {
    bonus += 12;
  }

  const nodePattern = /node[.\s]*js(?:\s+(?:backend|server))?\s*developer/i;
  if (nodePattern.test(jobTitle)) {
    bonus -= 50;
  }

  return bonus;
}

const { isCompanyBlocked, getBlockedCompanyMatch } = require("../config/blocked-companies");

const skillSets = [
  // === CORE FRAMEWORKS ===
  {
    name: "React",
    primary: ["react", "reactjs", "react.js", "reactjs"],
    related: ["javascript", "components", "jsx"],
    weight: 8,
    requiredTerms: ["react"]
  },
  {
    name: "Next.js",
    primary: ["next.js", "nextjs", "next-js"],
    related: ["ssr", "server side rendering", "static site generation", "app router"],
    weight: 6,
    requiredTerms: ["next.js", "nextjs"]
  },
  {
    name: "Node.js",
    primary: ["node", "node.js", "nodejs", "node js"],
    related: ["backend", "server", "express"],
    weight: 7,
    requiredTerms: ["node"]
  },
  {
    name: "Express.js",
    primary: ["express", "express.js", "expressjs"],
    related: ["rest api", "restful api", "api"],
    weight: 6,
    requiredTerms: ["express"]
  },
  {
    name: "MongoDB",
    primary: ["mongodb", "mongo db", "mongo"],
    related: ["nosql", "database", "mongoose"],
    weight: 6,
    requiredTerms: ["mongodb", "mongo"]
  },
  // === FRONTEND TECHNOLOGIES ===
  {
    name: "TypeScript",
    primary: ["typescript", "ts"],
    related: ["type safety", "static typing"],
    weight: 5,
    requiredTerms: ["typescript", "ts"]
  },
  {
    name: "JavaScript",
    primary: ["javascript", "es6", "es6+", "ecmascript"],
    related: ["js", "vanilla js"],
    weight: 4,
    requiredTerms: ["javascript", "js"]
  },
  {
    name: "HTML5",
    primary: ["html", "html5"],
    related: ["semantic html", "dom"],
    weight: 2,
    requiredTerms: ["html"]
  },
  {
    name: "CSS3",
    primary: ["css", "css3"],
    related: ["styling", "responsive design"],
    weight: 2,
    requiredTerms: ["css"]
  },
  {
    name: "Tailwind CSS",
    primary: ["tailwind", "tailwind css", "tailwindcss"],
    related: ["utility-first css"],
    weight: 3,
    requiredTerms: ["tailwind"]
  },
  {
    name: "SASS/SCSS",
    primary: ["sass", "scss", "sass css"],
    related: ["css preprocessor"],
    weight: 2,
    requiredTerms: ["sass", "scss"]
  },
  // === STATE MANAGEMENT ===
  {
    name: "Redux",
    primary: ["redux", "redux toolkit", "reduxjs"],
    related: ["state management", "global state"],
    weight: 5,
    requiredTerms: ["redux"]
  },
  {
    name: "React Query",
    primary: ["react query", "tanstack query"],
    related: ["data fetching", "server state"],
    weight: 4,
    requiredTerms: ["react query", "tanstack query"]
  },
  {
    name: "Context API",
    primary: ["context api", "react context"],
    related: ["state management", "react hooks"],
    weight: 3,
    requiredTerms: ["context api", "react context"]
  },
  {
    name: "Zustand",
    primary: ["zustand"],
    related: ["state management"],
    weight: 3,
    requiredTerms: ["zustand"]
  },
  {
    name: "MobX",
    primary: ["mobx"],
    related: ["state management"],
    weight: 3,
    requiredTerms: ["mobx"]
  },
  // === TESTING ===
  {
    name: "Jest",
    primary: ["jest"],
    related: ["unit testing", "testing framework"],
    weight: 4,
    requiredTerms: ["jest"]
  },
  {
    name: "React Testing Library",
    primary: ["@testing-library/react", "react testing library", "rtl"],
    related: ["component testing", "testing"],
    weight: 4,
    requiredTerms: ["testing-library", "rtl"]
  },
  {
    name: "Cypress",
    primary: ["cypress", "e2e testing"],
    related: ["end-to-end testing", "integration testing"],
    weight: 3,
    requiredTerms: ["cypress"]
  },
  {
    name: "Mocha/Chai",
    primary: ["mocha", "chai"],
    related: ["testing framework"],
    weight: 2,
    requiredTerms: ["mocha", "chai"]
  },
  // === DEVOPS & CLOUD (NEW) ===
  {
    name: "GitHub",
    primary: ["github", "git hub"],
    related: ["git", "version control", "ci/cd", "github actions"],
    weight: 4,
    requiredTerms: ["github"]
  },
  {
    name: "Git",
    primary: ["git"],
    related: ["version control", "repository", "branch", "commit", "merge", "pull request"],
    weight: 3,
    requiredTerms: ["git"]
  },
  {
    name: "Docker",
    primary: ["docker", "docker container"],
    related: ["containerization", "kubernetes", "container"],
    weight: 5,
    requiredTerms: ["docker"]
  },
  {
    name: "CI/CD",
    primary: ["ci/cd", "cicd", "ci cd", "continuous integration", "continuous deployment"],
    related: ["jenkins", "gitlab ci", "github actions", "pipeline"],
    weight: 4,
    requiredTerms: ["ci/cd", "cicd", "continuous integration", "continuous deployment"]
  },
  {
    name: "AWS",
    primary: ["aws", "amazon web services"],
    related: ["ec2", "s3", "lambda", "dynamodb", "rds", "cloud"],
    weight: 4,
    requiredTerms: ["aws", "amazon web services"]
  },
  {
    name: "Cloud Platforms",
    primary: ["azure", "gcp", "google cloud", "firebase"],
    related: ["cloud hosting", "serverless"],
    weight: 3,
    requiredTerms: ["azure", "gcp", "firebase"]
  },
  {
    name: "Kubernetes",
    primary: ["kubernetes", "k8s"],
    related: ["container orchestration", "docker", "pods"],
    weight: 3,
    requiredTerms: ["kubernetes", "k8s"]
  },
  // === BUILD TOOLS & BUNDLERS ===
  {
    name: "Webpack",
    primary: ["webpack"],
    related: ["bundler", "build tool", "module bundler"],
    weight: 3,
    requiredTerms: ["webpack"]
  },
  {
    name: "Vite",
    primary: ["vite"],
    related: ["build tool", "dev server", "bundler"],
    weight: 3,
    requiredTerms: ["vite"]
  },
  {
    name: "Babel",
    primary: ["babel"],
    related: ["transpiler", "compiler"],
    weight: 2,
    requiredTerms: ["babel"]
  },
  // === APIs & DATA ===
  {
    name: "REST API",
    primary: ["rest api", "restful api", "rest api"],
    related: ["http", "restful", "api integration"],
    weight: 5,
    requiredTerms: ["rest api", "restful"]
  },
  {
    name: "GraphQL",
    primary: ["graphql"],
    related: ["api", "query language", "apollo"],
    weight: 4,
    requiredTerms: ["graphql"]
  },
  {
    name: "REST",
    primary: ["rest"],
    related: ["http methods", "api endpoints"],
    weight: 3,
    requiredTerms: ["rest"]
  },
  {
    name: "Axios",
    primary: ["axios"],
    related: ["http client", "api calls", "fetch"],
    weight: 3,
    requiredTerms: ["axios"]
  },
  {
    name: "Fetch API",
    primary: ["fetch", "fetch api"],
    related: ["http requests", "async/await"],
    weight: 2,
    requiredTerms: ["fetch"]
  },
  // === AUTHENTICATION ===
  {
    name: "JWT",
    primary: ["jwt", "json web token", "jsonwebtoken"],
    related: ["authentication", "token", "oauth"],
    weight: 4,
    requiredTerms: ["jwt", "json web token"]
  },
  {
    name: "OAuth",
    primary: ["oauth", "oauth2", "oauth 2.0"],
    related: ["authentication", "authorization", "social login"],
    weight: 3,
    requiredTerms: ["oauth"]
  },
  {
    name: "Authentication",
    primary: ["authentication", "auth", "login"],
    related: ["user auth", "session management"],
    weight: 3,
    requiredTerms: ["authentication", "auth"]
  },
  // === OTHER FRAMEWORKS & LIBRARIES ===
  {
    name: "React Router",
    primary: ["react router", "react-router"],
    related: ["routing", "navigation"],
    weight: 4,
    requiredTerms: ["react router", "react-router"]
  },
  {
    name: "Material UI",
    primary: ["material ui", "mui", "material-design"],
    related: ["ui framework", "component library"],
    weight: 3,
    requiredTerms: ["material ui", "mui"]
  },
  {
    name: "Ant Design",
    primary: ["ant design", "antd"],
    related: ["ui library", "component library"],
    weight: 3,
    requiredTerms: ["ant design", "antd"]
  },
  {
    name: "Styled Components",
    primary: ["styled-components", "styled components"],
    related: ["css-in-js", "component styling"],
    weight: 3,
    requiredTerms: ["styled-components", "styled components"]
  },
  {
    name: "Form Handling",
    primary: ["react-hook-form", "formik", "redux-form"],
    related: ["form validation", "form management"],
    weight: 3,
    requiredTerms: ["react-hook-form", "formik"]
  },
  // === PERFORMANCE & OPTIMIZATION ===
  {
    name: "Performance Optimization",
    primary: ["performance optimization", "web performance", "load time"],
    related: ["lazy loading", "code splitting", "memoization"],
    weight: 4,
    requiredTerms: ["performance", "optimization", "optimisation"]
  },
  {
    name: "Web Vitals",
    primary: ["web vitals", "lcp", "cls", "fid"],
    related: ["performance metrics", "core web vitals"],
    weight: 2,
    requiredTerms: ["web vitals", "lcp", "cls"]
  },
  // === AGILE & COLLABORATION ===
  {
    name: "Agile/Scrum",
    primary: ["agile", "scrum", "sprint"],
    related: ["jira", "standup", "kanban"],
    weight: 2,
    requiredTerms: ["agile", "scrum"]
  },
  {
    name: "Jira",
    primary: ["jira"],
    related: ["project management", "issue tracking"],
    weight: 1,
    requiredTerms: ["jira"]
  }
];

/** Build word-boundary regex for a term; escapes special chars and avoids false positives for short terms. */
function buildTermRegex(term) {
  const escaped = escapeRegex(term);
  return new RegExp(`\\b${escaped}\\b`, "i");
}

function findExactSkillMatches(description, skillChips, skillSet) {
  const descriptionLower = description.toLowerCase();
  const chipTexts = skillChips.map((chip) => chip.toLowerCase());

  const hasRequiredTerm = skillSet.requiredTerms.some((term) => {
    const termRegex = buildTermRegex(term);
    return (
      termRegex.test(descriptionLower) ||
      chipTexts.some((chip) => termRegex.test(chip))
    );
  });

  if (!hasRequiredTerm) {
    return { hasPrimaryMatch: false, hasRelatedMatch: false };
  }

  const hasPrimaryMatch = skillSet.primary.some((skill) => {
    const skillRegex = buildTermRegex(skill);
    return (
      skillRegex.test(descriptionLower) ||
      chipTexts.some((chip) => skillRegex.test(chip))
    );
  });

  const hasRelatedMatch =
    !hasPrimaryMatch &&
    skillSet.related.some((skill) => {
      const skillRegex = buildTermRegex(skill);
      return (
        skillRegex.test(descriptionLower) ||
        chipTexts.some((chip) => skillRegex.test(chip))
      );
    });

  return { hasPrimaryMatch, hasRelatedMatch };
}
function filterJobTitleForWebDev(jobTitle) {
  // Convert job title to lowercase for case-insensitive matching
  const lowercaseTitle = jobTitle.toLowerCase();

  // Define patterns for the specific roles we want to match
  const webDevPattern = /\bweb\s+develop(er|ment)\b/i;
  const frontendPattern = /\bfront\s*(-|\s)?\s*end\s+develop(er|ment|ing)|front\s*(-|\s)?\s*end\s+engineer\b/i;
  const reactPattern = /\breact(\s*\.?\s*js)?\s+develop(er|ment|ing)|react(\s*\.?\s*js)?\s+engineer\b/i;
  const nextPattern = /\bnext(\s*\.?\s*js)?\s+develop(er|ment|ing)|next(\s*\.?\s*js)?\s+engineer\b/i;

  // Check if the job title matches any of our target patterns
  const isWebDev = webDevPattern.test(lowercaseTitle);
  const isFrontend = frontendPattern.test(lowercaseTitle);
  const isReactDev = reactPattern.test(lowercaseTitle);
  const isNextDev = nextPattern.test(lowercaseTitle);

  // A valid title must match at least one of our target patterns
  const isValidTitle = isWebDev || isFrontend || isReactDev || isNextDev;

  return {
    isValidTitle,
    matchDetails: {
      isWebDev,
      isFrontend,
      isReactDev,
      isNextDev
    }
  };
}
async function checkRequiredSkills(page, job) {
  try {
    if (isCompanyBlocked(job.company)) {
      const matchedPattern = getBlockedCompanyMatch(job.company);
      return {
        isEligible: false,
        matchPercentage: 0,
        matchedSkills: [],
        skills: [],
        reason: `Company "${job.company}" matched blocked company pattern: ${matchedPattern}`,
      };
    }

    const jobInfo = await page.evaluate(() => {
      const skillChips = Array.from(
        document.querySelectorAll(".styles_chip__7YCfG")
      ).map((chip) => chip.textContent.toLowerCase().trim());

      const descriptionElement = document.querySelector(
        ".styles_JDC__dang-inner-html__h0K4t"
      );
      const description = descriptionElement
        ? descriptionElement.innerText.toLowerCase()
        : "";

      const applicantsElement = Array.from(
        document.querySelectorAll(".styles_jhc__stat__PgY67")
      ).find((el) => el.textContent.includes("Applicants:"));
      const openingsElement = Array.from(
        document.querySelectorAll(".styles_jhc__stat__PgY67")
      ).find((el) => el.textContent.includes("Openings:"));

      const applicantsCount = applicantsElement
        ? parseInt(
            applicantsElement
              .querySelector("span:last-child")
              .textContent.replace(/,/g, ""),
            10
          )
        : Infinity;

      const openingsCount = openingsElement
        ? parseInt(
            openingsElement
              .querySelector("span:last-child")
              .textContent.replace(/,/g, ""),
            10
          )
        : 1;

      const matchScoreDetails = Array.from(
        document.querySelectorAll(".styles_MS__details__iS7mj")
      );

      const keySkillsMatch = matchScoreDetails.some(div => {
        const icon = div.querySelector("i.ni-icon-check_circle");
        const span = div.querySelector("span");
        return icon && span && span.textContent === "Keyskills";
      });

      const workExperienceMatch = matchScoreDetails.some(div => {
        const icon = div.querySelector("i.ni-icon-crossMatchscore");
        const span = div.querySelector("span");
        return icon && span && span.textContent === "Work Experience";
      });

      return {
        skillChips,
        description,
        applicantsCount,
        openingsCount,
        keySkillsMatch,
        workExperienceMatch
      };
    });

    if (jobInfo.workExperienceMatch) {
      return {
        isEligible: false,
        matchPercentage: 0,
        matchedSkills: [],
        // skills: jobInfo.skillChips,
        reason: "Work experience does not match the job requirements",
      };
    }

    // Use the globally defined skillSets instead of redefining
    // const skillSets = [...]; // Removed duplicate definition

    const mernSpecificChecks = [
      // === REACT SPECIFIC ===
      { keyword: "react hooks", bonus: 1.5 },
      { keyword: "functional components", bonus: 1.2 },
      { keyword: "performance optimization", bonus: 1.4 },
      { keyword: "react context", bonus: 1.3 },
      { keyword: "memoization", bonus: 1.2 },
      { keyword: "lazy loading", bonus: 1.1 },
      { keyword: "code splitting", bonus: 1.0 },
      { keyword: "react router", bonus: 1.2 },
      { keyword: "react query", bonus: 1.3 },
      { keyword: "useeffect", bonus: 1.0 },
      { keyword: "usestate", bonus: 1.0 },
      { keyword: "custom hooks", bonus: 1.4 },
      { keyword: "higher order components", bonus: 1.2 },
      { keyword: "props drilling", bonus: 0.8 },
      { keyword: "virtual dom", bonus: 1.0 },
      { keyword: "fiber", bonus: 1.0 },
      // === NODE/EXPRESS SPECIFIC ===
      { keyword: "express.js", bonus: 1.3 },
      { keyword: "expressjs", bonus: 1.3 },
      { keyword: "rest api", bonus: 1.4 },
      { keyword: "restful api", bonus: 1.4 },
      { keyword: "api development", bonus: 1.3 },
      { keyword: "api integration", bonus: 1.2 },
      { keyword: "authentication", bonus: 1.3 },
      { keyword: "jwt authentication", bonus: 1.4 },
      { keyword: "oauth", bonus: 1.2 },
      { keyword: "middleware", bonus: 1.1 },
      { keyword: "mongoose", bonus: 1.3 },
      { keyword: "mongodb", bonus: 1.3 },
      { keyword: "nosql", bonus: 1.2 },
      { keyword: "node.js", bonus: 1.3 },
      { keyword: "async await", bonus: 1.0 },
      { keyword: "promises", bonus: 1.0 },
      { keyword: "event loop", bonus: 1.1 },
      // === DEVOPS/CLOUD (NEW) ===
      { keyword: "github", bonus: 1.2 },
      { keyword: "git", bonus: 1.0 },
      { keyword: "docker", bonus: 1.4 },
      { keyword: "docker container", bonus: 1.5 },
      { keyword: "ci/cd", bonus: 1.4 },
      { keyword: "cicd", bonus: 1.4 },
      { keyword: "continuous integration", bonus: 1.3 },
      { keyword: "continuous deployment", bonus: 1.3 },
      { keyword: "aws", bonus: 1.3 },
      { keyword: "amazon web services", bonus: 1.3 },
      { keyword: "ec2", bonus: 1.2 },
      { keyword: "s3", bonus: 1.1 },
      { keyword: "lambda", bonus: 1.2 },
      { keyword: "kubernetes", bonus: 1.3 },
      { keyword: "k8s", bonus: 1.2 },
      { keyword: "jenkins", bonus: 1.2 },
      { keyword: "github actions", bonus: 1.3 },
      { keyword: "pipeline", bonus: 1.1 },
      // === STATE MANAGEMENT ===
      { keyword: "redux", bonus: 1.4 },
      { keyword: "redux toolkit", bonus: 1.5 },
      { keyword: "zustand", bonus: 1.2 },
      { keyword: "mobx", bonus: 1.2 },
      { keyword: "context api", bonus: 1.2 },
      // === TESTING ===
      { keyword: "jest", bonus: 1.3 },
      { keyword: "unit testing", bonus: 1.2 },
      { keyword: "integration testing", bonus: 1.3 },
      { keyword: "e2e testing", bonus: 1.3 },
      { keyword: "cypress", bonus: 1.2 },
      { keyword: "testing library", bonus: 1.2 },
      // === TYPESCRIPT/TOOLS ===
      { keyword: "typescript", bonus: 1.3 },
      { keyword: "next.js", bonus: 1.4 },
      { keyword: "nextjs", bonus: 1.4 },
      { keyword: "webpack", bonus: 1.1 },
      { keyword: "vite", bonus: 1.2 },
      { keyword: "tailwind css", bonus: 1.2 },
      { keyword: "graphql", bonus: 1.3 },
    ];

    const CORE_MERN_SKILLS = ["React", "Node.js", "Express.js", "MongoDB"];
    const DISQUALIFYING_CHIPS = [
      "angular", "vue", "vue.js", "vuejs", "php", ".net", "django", "laravel",
      "spring", "j2ee", "hibernate", "jms", "jpa", "sybase", "memsql"
    ];
    const JAVA_STACK_DESCRIPTION_TERMS = ["java", "j2ee", "spring", "hibernate", "jms", "jpa"];
    const MIN_JOB_REQUIRED_SCORE = 8;
    const DEMAND_MATCH_ELIGIBILITY_PCT = 45;

    const descriptionLower = jobInfo.description.toLowerCase();
    const chipTexts = jobInfo.skillChips.map((chip) => chip.toLowerCase());

    const javaStackInDescription = JAVA_STACK_DESCRIPTION_TERMS.filter(
      (term) => buildTermRegex(term).test(descriptionLower)
    ).length;

    for (const skillSet of skillSets) {
      maxPossibleScore += skillSet.weight;

      const hasRequiredTerm = skillSet.requiredTerms.some((term) => {
        const termRegex = buildTermRegex(term);
        return (
          termRegex.test(descriptionLower) ||
          chipTexts.some((chip) => termRegex.test(chip))
        );
      });

      if (!hasRequiredTerm) continue;

      jobRequiredScore += skillSet.weight;

      const primaryInChips = skillSet.primary.some((skill) => {
        const skillRegex = buildTermRegex(skill);
        return chipTexts.some((chip) => skillRegex.test(chip));
      });
      const primaryInDesc = skillSet.primary.some((skill) => {
        const skillRegex = buildTermRegex(skill);
        return skillRegex.test(descriptionLower);
      });
      const hasPrimaryMatch = primaryInChips || primaryInDesc;

      if (hasPrimaryMatch) {
        const baseWeight = skillSet.weight;
        const chipBonus = primaryInChips ? baseWeight * 0.15 : 0;
        const add = baseWeight + chipBonus;
        totalScore += add;
        totalSkillScore += baseWeight;
        matchedSkills.push(skillSet.name);
        if (CORE_MERN_SKILLS.includes(skillSet.name)) coreMernPrimaryCount += 1;
      } else {
        const relatedInChips = skillSet.related.some((skill) => {
          const skillRegex = buildTermRegex(skill);
          return chipTexts.some((chip) => skillRegex.test(chip));
        });
        const relatedInDesc = skillSet.related.some((skill) => {
          const skillRegex = buildTermRegex(skill);
          return skillRegex.test(descriptionLower);
        });
        const hasRelatedMatch = relatedInChips || relatedInDesc;

        if (hasRelatedMatch) {
          const baseWeight = skillSet.weight * 0.5;
          const chipBonus = relatedInChips ? baseWeight * 0.2 : 0;
          const add = baseWeight + chipBonus;
          totalScore += add;
          totalSkillScore += baseWeight;
          matchedSkills.push(`${skillSet.name} (related)`);
        }
      }
    }

    const disqualifyingChipCount =
      DISQUALIFYING_CHIPS.filter((q) =>
        chipTexts.some((chip) => chip.includes(q))
      ).length +
      (chipTexts.some((c) => c === "java" || c === "c#" || c === "csharp")
        ? 1
        : 0);
    const isDisqualifiedByChips = disqualifyingChipCount >= 2;

    let bonusScore = 0;
    mernSpecificChecks.forEach((check) => {
      if (descriptionLower.includes(check.keyword.toLowerCase())) {
        bonusScore += check.bonus;
      }
    });

    const mernKeywordTriplets = [
      // === MERN STACK COMBINATIONS ===
      ["react", "javascript", "frontend"],
      ["react", "typescript", "frontend"],
      ["react", "hooks", "components"],
      ["react", "performance", "optimization"],
      ["frontend", "react", "developer"],
      // === NODE/EXPRESS COMBINATIONS ===
      ["node", "express", "api"],
      ["node", "mongodb", "backend"],
      ["express", "mongodb", "rest api"],
      ["node.js", "rest api", "backend"],
      ["nodejs", "express", "mongoose"],
      // === DEVOPS COMBINATIONS (NEW) ===
      ["docker", "container", "deployment"],
      ["ci/cd", "github", "pipeline"],
      ["aws", "ec2", "cloud"],
      ["docker", "kubernetes", "orchestration"],
      ["github", "actions", "ci/cd"],
      ["docker", "ci/cd", "pipeline"],
      // === FULLSTACK COMBINATIONS ===
      ["react", "node", "fullstack"],
      ["react", "node.js", "full stack"],
      ["mern", "stack", "developer"],
      ["frontend", "backend", "api"],
      ["javascript", "node", "react"],
    ];

    for (const [keyword1, keyword2, keyword3] of mernKeywordTriplets) {
      if (
        descriptionLower.includes(keyword1) &&
        descriptionLower.includes(keyword2) &&
        descriptionLower.includes(keyword3)
      ) {
        bonusScore += 1.0;
      }
    }

    const titleBonus = bonusForTitle(job.title);
    bonusScore += titleBonus;
    totalScore += bonusScore;

    const rawFormulaPct =
      (totalScore / (maxPossibleScore + mernKeywordTriplets.length)) * 100;
    const demandBasedPct =
      jobRequiredScore >= MIN_JOB_REQUIRED_SCORE
        ? Math.min((totalSkillScore / jobRequiredScore) * 100, 100)
        : rawFormulaPct;
    const finalMatchPercentage = Math.min(
      demandBasedPct >= 0 ? demandBasedPct : rawFormulaPct,
      100
    );

    const isFullstackOrMernTitle = /\b(fullstack|full stack|mern)\b/i.test(
      job.title
    );
    const hasEnoughCoreMern = coreMernPrimaryCount >= 2;
    const coreMernOk = !isFullstackOrMernTitle || hasEnoughCoreMern;

    const applicantLimit = Math.max(1300 * jobInfo.openingsCount, 100);
    const applicantOk =
      jobInfo.applicantsCount === undefined ||
      jobInfo.applicantsCount < applicantLimit;

    const matchThreshold =
      jobRequiredScore >= MIN_JOB_REQUIRED_SCORE
        ? DEMAND_MATCH_ELIGIBILITY_PCT
        : 25;
    let isEligible =
      finalMatchPercentage >= matchThreshold &&
      coreMernOk &&
      !isDisqualifiedByChips &&
      !isJavaStackRole &&
      applicantOk;

    let ineligibilityReason = "";
    if (isJavaStackRole)
      ineligibilityReason =
        "Job is Java/J2EE/Spring stack (not MERN/React/Node)";
    else if (isDisqualifiedByChips)
      ineligibilityReason =
        "Job key skills are heavily non-MERN (e.g. Angular/Vue/PHP/Java)";
    else if (!coreMernOk)
      ineligibilityReason =
        "Fullstack/MERN title but profile has fewer than 2 core MERN skills (React, Node, Express, MongoDB)";
    else if (finalMatchPercentage < matchThreshold)
      ineligibilityReason =
        jobRequiredScore >= MIN_JOB_REQUIRED_SCORE
          ? `Demand-based match ${finalMatchPercentage.toFixed(1)}% below threshold ${DEMAND_MATCH_ELIGIBILITY_PCT}%`
          : `Match ${finalMatchPercentage.toFixed(1)}% below threshold`;

    if (isJavaStackRole) {
      return {
        isEligible: false,
        matchPercentage: finalMatchPercentage,
        matchedSkills: [],
        reason: ineligibilityReason,
        score: {
          total: totalScore,
          max: maxPossibleScore,
          jobRequiredScore,
          demandBasedPct:
            jobRequiredScore >= MIN_JOB_REQUIRED_SCORE
              ? (totalSkillScore / jobRequiredScore) * 100
              : null,
        },
      };
    }

    if (isDisqualifiedByChips) {
      return {
        isEligible: false,
        matchPercentage: finalMatchPercentage,
        matchedSkills,
        reason: ineligibilityReason,
        score: {
          total: totalScore,
          max: maxPossibleScore,
          jobRequiredScore,
          demandBasedPct:
            jobRequiredScore >= MIN_JOB_REQUIRED_SCORE
              ? (totalSkillScore / jobRequiredScore) * 100
              : null,
        },
      };
    }

    // const titleCheck = filterJobTitle(job.title);
    // if (!titleCheck.isValidTitle) {
    //   return {
    //     isEligible: false,
    //     matchPercentage: finalMatchPercentage,
    //     matchedSkills,
    //     // skills: jobInfo.skillChips,
    //     reason: "Job title not suitable",
    //   };
    // }

    const fullstackCheck = checkFullstackRequirements(
      job.title,
      jobInfo.description,
      jobInfo.skillChips
    );
    if (!fullstackCheck.isValidFullstack) {
      return {
        isEligible: false,
        matchPercentage: finalMatchPercentage,
        matchedSkills,
        // skills: jobInfo.skillChips,
        reason: "Fullstack job lacks Node.js requirement",
      };
    }

    const experienceRequirement = extractExperienceRequirement(
      jobInfo?.description
    );

    if (!experienceRequirement.isValid) {
      return {
        isEligible: false,
        matchPercentage: finalMatchPercentage,
        matchedSkills,
        // skills: jobInfo.skillChips,
        reason: `Experience requirement not suitable: ${experienceRequirement.reason}`,
      };
    }

    if (!jobInfo.keySkillsMatch) {
      const isHighMatch = finalMatchPercentage >= 35;
      return {
        isEligible: isHighMatch,
        matchPercentage: finalMatchPercentage,
        matchedSkills: [],
        // skills: jobInfo.skillChips,
        reason: isHighMatch
          ? "High skill match despite key skills mismatch"
          : "Key skills do not match the job requirements",
      };
    }

    if (jobInfo.keySkillsMatch) {
      const titleCheck = filterJobTitleForWebDev(job.title);
      const lowMatchPercentage = finalMatchPercentage < 40;

      if (titleCheck.isValidTitle && lowMatchPercentage) {
        if (finalMatchPercentage < 20) {
          totalScore += 20
        } else if (finalMatchPercentage > 20 && finalMatchPercentage < 30) {

          totalScore += 15;
        } else {
          totalScore += 10;
        }
      }

      const finalMatchPercentageWithBonus = Math.min(
        (totalScore / (maxPossibleScore + mernKeywordTriplets.length)) * 100,
        100
      );

      const isEligibleWithBonus =
        finalMatchPercentageWithBonus >= 35 &&
        coreMernOk &&
        applicantOk;

      return {
        isEligible: isEligibleWithBonus,
        matchPercentage: finalMatchPercentageWithBonus,
        initialMatchPercentage: finalMatchPercentage,
        matchedSkills,
        score: {
          total: totalScore,
          max: maxPossibleScore,
          jobRequiredScore,
          demandBasedPct:
            jobRequiredScore >= MIN_JOB_REQUIRED_SCORE
              ? (totalSkillScore / jobRequiredScore) * 100
              : null,
        },
        reason: lowMatchPercentage && titleCheck.isValidTitle
          ? "Low match percentage boosted due to key skills match and suitable title"
          : jobInfo.applicantsCount > applicantLimit ? `applied members:${jobInfo.applicantsCount} are greater than the limit:${applicantLimit}` : `Job has required key skills (Match: ${finalMatchPercentageWithBonus.toFixed(1)}%)`,
      };
    }

    return {
      isEligible,
      matchPercentage: finalMatchPercentage,
      matchedSkills,
      score: {
        total: totalScore,
        max: maxPossibleScore,
        bonus: bonusScore,
        jobRequiredScore,
        demandBasedPct:
          jobRequiredScore >= MIN_JOB_REQUIRED_SCORE
            ? (totalSkillScore / jobRequiredScore) * 100
            : null,
      },
      reason: isEligible ? "" : ineligibilityReason,
    };

  } catch (error) {
    console.error("Error in checkRequiredSkills:", error);
    return {
      isEligible: false,
      matchPercentage: 0,
      matchedSkills: [],
      skills: [],
      score: {
        total: 0,
        max: 0,
        bonus: 0,
      },
      reason: "Error in checkRequiredSkills",
    };
  }
}

module.exports = checkRequiredSkills;