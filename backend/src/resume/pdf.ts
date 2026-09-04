import PDFDocument from "pdfkit";

type ResumeContent = {
  name?: string | null;
  email?: string | null;
  summary?: string | null;
  skills?: string[];
  experience?: {
    company: string;
    title: string;
    dates?: string;
    bullets?: string[];
  }[];
  target?: { title?: string; company?: string };
};

export function renderResumePdf(content: ResumeContent): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 44, bottom: 44, left: 52, right: 52 },
      info: { Title: `${content.name || "Candidate"} Resume` },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(22).text(content.name || "Candidate");
    if (content.email) {
      doc.moveDown(0.2).font("Helvetica").fontSize(9).fillColor("#44545a").text(content.email);
    }
    if (content.target?.title) {
      doc.moveDown(0.8).font("Helvetica-Bold").fontSize(13).fillColor("#153d3a").text(content.target.title);
    }
    if (content.summary) {
      section(doc, "SUMMARY");
      doc.font("Helvetica").fontSize(10).fillColor("#17252a").text(content.summary, { lineGap: 2 });
    }
    if (content.skills?.length) {
      section(doc, "SKILLS");
      doc.font("Helvetica").fontSize(9.5).text(content.skills.join("  •  "), { lineGap: 2 });
    }
    if (content.experience?.length) {
      section(doc, "EXPERIENCE");
      for (const item of content.experience) {
        doc.font("Helvetica-Bold").fontSize(11).fillColor("#17252a").text(item.title, { continued: true });
        doc.font("Helvetica").text(`  |  ${item.company}`);
        if (item.dates) {
          doc.fontSize(9).fillColor("#5d6b70").text(item.dates);
        }
        for (const bullet of item.bullets ?? []) {
          doc.moveDown(0.2).font("Helvetica").fontSize(9.5).fillColor("#17252a").text(`•  ${bullet}`, {
            indent: 8,
            lineGap: 1,
          });
        }
        doc.moveDown(0.55);
      }
    }
    doc.end();
  });
}

function section(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.85);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#153d3a").text(title, { characterSpacing: 1 });
  doc.moveTo(doc.x, doc.y + 2).lineTo(560, doc.y + 2).strokeColor("#c8d0ce").lineWidth(0.6).stroke();
  doc.moveDown(0.45);
}
