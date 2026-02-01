const fs = require("fs/promises");
const path = require("path");
async function saveJobDescription(page, job) {
  try {
    console.log(`Starting to save job description for: ${job.title}`);

    // Extract all relevant information from the page
    console.log("Attempting to extract job information...");
    const jobInfo = await page.evaluate(() => {
      console.log("Inside page.evaluate()...");

      // Helper function to safely get text content
      const getText = (selector) => {
        const element = document.querySelector(selector);
        console.log(
          `Getting text for selector ${selector}:`,
          element?.textContent || "Not found"
        );
        return element ? element.textContent.trim() : "";
      };

      // Get all skill chips
      const getSkills = () => {
        console.log("Getting skills...");
        const skillChips = Array.from(
          document.querySelectorAll(".styles_chip__7YCfG")
        );
        console.log(`Found ${skillChips.length} skill chips`);
        const skills = skillChips.map((chip) => chip.textContent.trim());
        console.log("Skills found:", skills);
        return skills;
      };

      // Get education details
      const getEducation = () => {
        console.log("Getting education details...");
        const ugElement = document.querySelector(
          ".styles_education__KXFkO .styles_details__Y424J:nth-child(2)"
        );
        const pgElement = document.querySelector(
          ".styles_education__KXFkO .styles_details__Y424J:nth-child(3)"
        );
        const education = {
          ug: ugElement ? ugElement.textContent.replace("UG:", "").trim() : "",
          pg: pgElement ? pgElement.textContent.replace("PG:", "").trim() : "",
        };
        console.log("Education details:", education);
        return education;
      };

      // Get job highlights
      const getHighlights = () => {
        console.log("Getting job highlights...");
        const highlights = Array.from(
          document.querySelectorAll(".styles_JDC__job-highlight-list__QZC12 li")
        );
        console.log(`Found ${highlights.length} highlights`);
        return highlights.map((h) => h.textContent.trim());
      };

      const jobInfo = {
        description: getText(".styles_JDC__dang-inner-html__h0K4t"),
        skills: getSkills(),
        education: getEducation(),
        highlights: getHighlights(),
        role: getText(".styles_details__Y424J:nth-child(1)"),
        industryType: getText(".styles_details__Y424J:nth-child(2)"),
        department: getText(".styles_details__Y424J:nth-child(3)"),
        employmentType: getText(".styles_details__Y424J:nth-child(4)"),
      };

      console.log("Collected job info:", JSON.stringify(jobInfo, null, 2));
      return jobInfo;
    });

    console.log("Job information extracted successfully");
    console.log("Creating formatted content...");

    // Create formatted content for file
    const content = `
  Job Title: ${job.title}
  Date Saved: ${new Date().toISOString()}
  URL: ${job.link || "Not provided"}
  
  === Job Highlights ===
  ${jobInfo.highlights.map((h) => `• ${h}`).join("\n")}
  
  === Job Description ===
  ${jobInfo.description}
  
  === Skills Required ===
  ${jobInfo.skills.join(", ")}
  
  === Education Requirements ===
  Undergraduate: ${jobInfo.education.ug}
  Postgraduate: ${jobInfo.education.pg}
  
  === Additional Details ===
  Role: ${jobInfo.role}
  Industry Type: ${jobInfo.industryType}
  Department: ${jobInfo.department}
  Employment Type: ${jobInfo.employmentType}
      `.trim();

    console.log("Content formatted successfully");

    // Create filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const sanitizedTitle = job.title.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50);
    const fileName = `${sanitizedTitle}_${timestamp}.txt`;
    console.log(`Generated filename: ${fileName}`);

    // Create the directory path
    const dirPath = path.join(__dirname, "job_descriptions");
    console.log(`Directory path: ${dirPath}`);

    // Create directory if it doesn't exist
    console.log("Creating directory if it doesn't exist...");
    await fs.mkdir(dirPath, { recursive: true });

    // Save file
    const filePath = path.join(dirPath, fileName);
    console.log(`Attempting to save file at: ${filePath}`);

    console.log("Writing file...");
    await fs.writeFile(filePath, content, "utf8");

    console.log(`Successfully saved job description at: ${filePath}`);
    return filePath;
  } catch (error) {
    console.error("Detailed error in saveJobDescription:", {
      error: error.message,
      stack: error.stack,
      jobTitle: job?.title || "unknown job",
    });
    throw error;
  }
}
module.exports = saveJobDescription;
