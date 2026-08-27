const crypto = require('crypto');
const dns = require('dns').promises;

const APP_NAME = (process.env.APP_NAME || 'MailForge').replace(/\s+/g, '');

/**
 * Generates a token like "MailForge_9k2xQ7pL4mQa"
 */
function generateVerificationToken() {
  const random = crypto.randomBytes(9).toString('base64url'); // ~12 chars, url-safe
  return `${APP_NAME}_${random}`;
}

/**
 * The record name people add to their DNS. Using the app-name-prefixed
 * token as the VALUE (not the record name) means a domain can host many
 * verification records from different tools without collisions.
 * Record: TXT  @  "mailforge-site-verification=<token>"
 */
function txtRecordName() {
  return `${APP_NAME.toLowerCase()}-site-verification`;
}

function expectedTxtValue(token) {
  return `${txtRecordName()}=${token}`;
}

/**
 * Looks up TXT records at the domain apex and checks whether any of them
 * match the expected "<prefix>-site-verification=<token>" value.
 */
async function checkTxtRecord(domain, token) {
  const expected = expectedTxtValue(token);
  try {
    const records = await dns.resolveTxt(domain);
    const flat = records.map(chunks => chunks.join(''));
    return flat.some(v => v.trim() === expected);
  } catch (err) {
    // NXDOMAIN, ENODATA, ETIMEOUT, etc - just means "not found (yet)"
    return false;
  }
}

module.exports = {
  generateVerificationToken,
  txtRecordName,
  expectedTxtValue,
  checkTxtRecord,
};
