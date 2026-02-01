const nodemailer = require("nodemailer");
const ExcelJS = require("exceljs");

class EmailNotificationService {
  constructor(config) {
    this.config = config;
    this.transporter = nodemailer.createTransport(config.emailTransport);
  }

  async generateApplicationReport(appliedJobs, skippedJobs) {
    const workbook = new ExcelJS.Workbook();
    const appliedSheet = workbook.addWorksheet("Applied Jobs");
    const skippedSheet = workbook.addWorksheet("Skipped Jobs");

    // Configure sheets...

    const reportPath = "./job_application_report.xlsx";
    await workbook.xlsx.writeFile(reportPath);

    return reportPath;
  }

  async sendApplicationReport(appliedJobs, skippedJobs) {
    const reportPath = await this.generateApplicationReport(
      appliedJobs,
      skippedJobs
    );

    const mailOptions = {
      from: this.config.from,
      to: this.config.to,
      subject: "Job Application Report",
      text: `Applied Jobs: ${appliedJobs.length}\nSkipped Jobs: ${skippedJobs.length}`,
      attachments: [
        {
          filename: "job_application_report.xlsx",
          path: reportPath,
        },
      ],
    };

    await this.transporter.sendMail(mailOptions);
  }
}

module.exports = EmailNotificationService;
