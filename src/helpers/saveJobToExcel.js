const XLSX = require("xlsx");
const fs = require("fs/promises");
const path = require("path");
const logger = require("../utils/logger");

function formatArrayForExcel(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr.join(" | ");
}
async function saveAppliedJobToExcel(
  page,
  job,
  eligibility,
  matchPercentage,
  matchedSkills
) {
  try {
    logger.info(`#### Starting to save job information for: ${job.title}`);

    // Extract job information
    const jobInfo = await page.evaluate(() => {
      const getText = (selector) => {
        const element = document.querySelector(selector);
        return element ? element.textContent.trim() : "";
      };

      const getSkills = () => {
        const skillChips = Array.from(
          document.querySelectorAll(".styles_chip__7YCfG")
        );
        return skillChips.map((chip) => chip.textContent.trim());
      };

      const getHighlights = () => {
        const highlights = Array.from(
          document.querySelectorAll(".styles_JDC__job-highlight-list__QZC12 li")
        );
        return highlights.map((h) => h.textContent.trim());
      };

      return {
        description: getText(".styles_JDC__dang-inner-html__h0K4t"),
        skills: getSkills().join(", "),
        highlights: getHighlights().join(" | "),
        role: getText(".styles_details__Y424J:nth-child(1)"),
        industryType: getText(".styles_details__Y424J:nth-child(2)"),
        department: getText(".styles_details__Y424J:nth-child(3)"),
        employmentType: getText(".styles_details__Y424J:nth-child(4)"),
        education: {
          ug: getText(
            ".styles_education__KXFkO .styles_details__Y424J:nth-child(2)"
          )
            .replace("UG:", "")
            .trim(),
          pg: getText(
            ".styles_education__KXFkO .styles_details__Y424J:nth-child(3)"
          )
            .replace("PG:", "")
            .trim(),
        },
      };
    });
    // Create row data
    const rowData = {
      Date: new Date().toISOString(),
      "Job Title": job.title,
      Company: job.company,
      Location: job.location || "N/A",
      "Job URL": job.link,
      Role: jobInfo.role,
      "Industry Type": jobInfo.industryType,
      Department: jobInfo.department,
      "Employment Type": jobInfo.employmentType,
      "Skills Required": jobInfo.skills,
      "Job Highlights": jobInfo.highlights,
      "Job Description": jobInfo.description,
      "Education - UG": jobInfo.education.ug,
      "Education - PG": jobInfo.education.pg,
      "Is Eligible": eligibility ? "Yes" : "No",
      "Matched Percentage": matchPercentage,
      "Matched Skills": formatArrayForExcel(matchedSkills),
    };
    const filesDir = path.join(__dirname, "files");
    await fs.mkdir(filesDir, { recursive: true });

    const excelPath = path.join(filesDir, "job_applications.xlsx");

    // Read existing file or create new workbook
    let workbook;
    try {
      const fileBuffer = await fs.readFile(excelPath);
      workbook = XLSX.read(fileBuffer);
    } catch (error) {
      // File doesn't exist, create new workbook
      workbook = XLSX.utils.book_new();
      workbook.SheetNames = ["Jobs"];
      workbook.Sheets["Jobs"] = XLSX.utils.json_to_sheet([]);
    }

    // Get existing data
    const ws = workbook.Sheets["Jobs"];
    const existingData = XLSX.utils.sheet_to_json(ws);

    // Add new row
    existingData.push(rowData);

    // Update worksheet
    const newWs = XLSX.utils.json_to_sheet(existingData);

    // Set column widths
    const maxWidth = 50;
    const columns = Object.keys(rowData);
    const colWidths = {};
    columns.forEach((col) => {
      colWidths[col] = Math.min(
        Math.max(...existingData.map((row) => String(row[col] || "").length)),
        maxWidth
      );
    });

    newWs["!cols"] = columns.map((col) => ({ wch: colWidths[col] }));

    // Update workbook
    workbook.Sheets["Jobs"] = newWs;

    // Write file
    await fs.writeFile(excelPath, XLSX.write(workbook, { type: "buffer" }));

    logger.info(
      `Successfully updated job information in Excel at: ${excelPath}`
    );
    return excelPath;
  } catch (error) {
    console.error("Error saving job to Excel:", error);
    throw error;
  }
}



async function saveFailedJobToExcel(jobs) {
  if (!jobs || jobs.length === 0) {
    logger.info("No failed jobs to save");
    return null;
  }

  try {
    const filesDir = path.join(__dirname, "files");
    await fs.mkdir(filesDir, { recursive: true });

    const excelPath = path.join(filesDir, "_failed_job_applications.xlsx");
    const wsName = "Failed Jobs";

    // Create row data with current timestamp
    const rowData = jobs.map((job) => ({
      Date: new Date().toISOString(),
      "Job Title": job.title,
      Company: job.company,
      Location: job.location || "N/A",
      "Job URL": job.link,
      Reason: job.reason || "N/A",
      Percentage: job?.matchPercentage ? job?.matchPercentage.toFixed(2) : "NA",
      "Skills Required": job?.matchedSkills
        ? JSON.stringify(job.matchedSkills)
        : "N/A",
      "Job Highlights": job?.highlights || "N/A",
      "Job Description": job?.description || "N/A",
    }));

    let workbook;
    let existingData = [];

    try {
      const fileBuffer = await fs.readFile(excelPath);
      workbook = XLSX.read(fileBuffer, { type: "buffer" });

      if (workbook.SheetNames.includes(wsName)) {
        const existingSheet = workbook.Sheets[wsName];
        existingData = XLSX.utils.sheet_to_json(existingSheet);
      }
    } catch (error) {
      workbook = XLSX.utils.book_new();
    }

    // Filter out duplicates based on Job URL and Job Title
    const newUniqueJobs = rowData.filter(
      (newJob) =>
        !existingData.some(
          (existingJob) =>
            existingJob["Job URL"] === newJob["Job URL"] &&
            existingJob["Job Title"] === newJob["Job Title"]
        )
    );

    if (newUniqueJobs.length === 0) {
      logger.info("No new unique jobs to add");
      return excelPath;
    }

    const combinedData = [...existingData, ...newUniqueJobs];
    const newSheet = XLSX.utils.json_to_sheet(combinedData);

    if (workbook.SheetNames.includes(wsName)) {
      workbook.Sheets[wsName] = newSheet;
    } else {
      XLSX.utils.book_append_sheet(workbook, newSheet, wsName);
    }

    // Set column widths
    newSheet["!cols"] = Object.keys(rowData[0]).map(() => ({ wch: 25 }));

    await fs.writeFile(excelPath, XLSX.write(workbook, { type: "buffer" }));

    logger.info(
      `Successfully saved ${newUniqueJobs.length} new unique jobs to: ${excelPath}`
    );
    return excelPath;
  } catch (error) {
    logger.error("Error saving failed jobs to Excel:", error);
    throw error;
  }
}

module.exports = { saveAppliedJobToExcel, saveFailedJobToExcel };
