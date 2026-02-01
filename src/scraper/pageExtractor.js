async function extractJobsFromPage(page, pageNum) {
  return page.evaluate((currentPage) => {
    const jobElements = document.querySelectorAll(".srp-jobtuple-wrapper");

    return Array.from(jobElements).map((job) => {
      const getText = (selector, defaultValue = "") => {
        const element = job.querySelector(selector);
        return element ? element.innerText.trim() : defaultValue;
      };

      const getTextByTitle = (titleText, defaultValue = "") => {
        const element = job.querySelector(`[title*="${titleText}"]`);
        return element ? element.innerText.trim() : defaultValue;
      };

      const expElement = job.querySelector(".exp-wrap span[title]");
      const experience = expElement
        ? expElement.getAttribute("title").trim()
        : "";

      const salElement = job.querySelector(".sal-wrap span[title]");
      const salary = salElement ? salElement.getAttribute("title").trim() : "";

      const locElement = job.querySelector(".loc-wrap span[title]");
      const location = locElement
        ? locElement.getAttribute("title").trim()
        : "";

      const description = getText(".job-desc", "");
      const skills = Array.from(job.querySelectorAll(".tags-gt .tag-li")).map(
        (skill) => skill.innerText.trim()
      );
      const postedDate = getText(".job-post-day", "");
      const jobType = getTextByTitle("Job Type", "");

      return {
        title: getText(".title"),
        company: getText(".comp-name"),
        experience,
        location,
        salary,
        description,
        postedDate,
        jobType,
        skills,
        link: job.querySelector("a.title")?.href || "",
        pageNumber: currentPage,
      };
    });
  }, pageNum);
}

module.exports = {
  extractJobsFromPage,
};
