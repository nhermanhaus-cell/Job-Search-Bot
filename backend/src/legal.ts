export const privacyHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Privacy — Job Hunt OS</title>
<style>body{font:16px/1.5 system-ui;max-width:720px;margin:40px auto;padding:0 20px;color:#122}h1,h2{font-weight:650}a{color:#0b5}</style>
</head><body>
<h1>Privacy policy</h1>
<p>Job Hunt OS stores your account, resumes, job matches, and optional Gmail classifications so you can hunt and apply from your own devices.</p>
<h2>What we collect</h2>
<ul>
<li>Sign-in identity from Apple or Google (provider subject, optional verified email and name).</li>
<li>Resumes you upload. Original files are envelope-encrypted in private object storage. Structured facts (roles, skills, titles) live in Postgres.</li>
<li>Job search activity and application tracker rows you create.</li>
<li>If you connect Gmail, message metadata and short excerpts needed to classify recruiting mail. Full mailbox access is never requested.</li>
</ul>
<h2>How we use it</h2>
<p>Resume text may be sent to a platform-managed OpenAI model to extract facts already present in the document. Mail classification uses deterministic rules first, then the same model for low-confidence messages. We do not sell your data or use it to train public models.</p>
<h2>Retention</h2>
<p>Account data is kept until you delete the account. Object-store backups may retain encrypted bytes for up to 30 days; after deletion we crypto-shred application keys so those backups are unreadable. Gmail tokens are revoked on disconnect or deletion.</p>
<h2>Your choices</h2>
<p>Export or delete your account in Settings. Deletion revokes Apple, Google, and Gmail grants, shreds object keys, then cascades database records. Contact privacy@jobhuntos.app for access requests.</p>
</body></html>`;

export const termsHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Terms — Job Hunt OS</title>
<style>body{font:16px/1.5 system-ui;max-width:720px;margin:40px auto;padding:0 20px;color:#122}h1,h2{font-weight:650}</style>
</head><body>
<h1>Terms of use</h1>
<p>Job Hunt OS helps you search public job listings, tailor a resume from facts you supply, and optionally classify recruiting email. You must only upload documents you have the right to use. We do not submit applications on your behalf or scrape LinkedIn or Indeed.</p>
<p>Search results come from licensed or official APIs and public boards. Availability varies by source. Gmail tracking is optional and remains disabled for public production until Google approves restricted-scope access.</p>
<p>The service is provided as-is. You can export or delete your account at any time.</p>
</body></html>`;
