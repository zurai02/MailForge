const crypto = require('crypto');
const dns = require('dns').promises;

function appName() {
  return (process.env.APP_NAME || 'MailForge').replace(/\s+/g, '');
}

/** Generates a token like "MailForge_9k2xQ7pL4mQa" */
function generateVerificationToken() {
  const random = crypto.randomBytes(9).toString('base64url');
  return `${appName()}_${random}`;
}

function txtRecordName() {
  return `${appName().toLowerCase()}-site-verification`;
}

function expectedTxtValue(token) {
  return `${txtRecordName()}=${token}`;
}

/** Real DNS lookup - queries the domain's actual TXT records over the network. */
async function checkTxtRecord(domain, token) {
  const expected = expectedTxtValue(token);
  try {
    const records = await dns.resolveTxt(domain);
    const flat = records.map(chunks => chunks.join(''));
    return flat.some(v => v.trim() === expected);
  } catch (err) {
    return false; // NXDOMAIN / ENODATA / ETIMEOUT -> just "not found yet"
  }
}

module.exports = { generateVerificationToken, txtRecordName, expectedTxtValue, checkTxtRecord };
