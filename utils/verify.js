const crypto = require('crypto');
const dns = require('dns').promises;

const APP_NAME = (process.env.APP_NAME || 'MailForge').replace(/\s+/g, '');

function generateVerificationToken() {
  const random = crypto.randomBytes(9).toString('base64url');
  return `${APP_NAME}_${random}`;
}

function txtRecordName() {
  return `${APP_NAME.toLowerCase()}-site-verification`;
}

function expectedTxtValue(token) {
  return `${txtRecordName()}=${token}`;
}

async function checkTxtRecord(domain, token) {
  const expected = expectedTxtValue(token);
  try {
    const records = await dns.resolveTxt(domain);
    const flat = records.map(chunks => chunks.join(''));
    return flat.some(v => v.trim() === expected);
  } catch (err) {
    return false;
  }
}

module.exports = {
  generateVerificationToken,
  txtRecordName,
  expectedTxtValue,
  checkTxtRecord,
};
