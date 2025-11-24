#!/usr/bin/env node
/**
 * decode-oob.js
 * Helper script to decode a DIDComm Out-of-Band invitation URL or base64(_url) payload.
 *
 * Usage:
 *   node scripts/decode-oob.js <invitation-url-or-base64>
 *   echo "<url>" | node scripts/decode-oob.js
 *
 * Accepts either:
 *   - Full invitation URL containing "_oob" query param
 *   - Raw base64/base64url encoded invitation JSON string
 *
 * Output:
 *   - Pretty-printed invitation JSON
 *   - Extracted correlationId (dbn:cid) if present
 */

function readInputArg() {
  const argFromCli = process.argv.slice(2).join(' ').trim();
  if (argFromCli) return argFromCli;
  if (!process.stdin.isTTY) {
    return require('fs').readFileSync(0, 'utf8').trim();
  }
  console.error('No input provided. Pass an invitation URL or base64 string.');
  process.exit(1);
}

function extractBase64(source) {
  try {
    if (source.startsWith('http://') || source.startsWith('https://')) {
      const url = new URL(source);
      const val = url.searchParams.get('_oob');
      if (!val) throw new Error('URL missing _oob parameter');
      return val;
    }
    // Otherwise assume raw base64/base64url
    return source;
  } catch (e) {
    throw new Error(`Failed to parse source: ${e.message}`);
  }
}

function decodeBase64Flexible(b64) {
  // Support base64url without padding
  const base64urlToBase64 = (str) => str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - (str.length % 4)) % 4, '=');
  let raw = b64;
  // Detect non-standard chars and convert
  if (/[-_]/.test(b64)) {
    raw = base64urlToBase64(b64);
  }
  try {
    return Buffer.from(raw, 'base64').toString('utf8');
  } catch (e) {
    throw new Error('Failed to decode base64/base64url data');
  }
}

function main() {
  const input = readInputArg();
  let encoded;
  try {
    encoded = extractBase64(input);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  let jsonStr;
  try {
    jsonStr = decodeBase64Flexible(encoded);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  let invitation;
  try {
    invitation = JSON.parse(jsonStr);
  } catch (e) {
    console.error('Decoded string is not valid JSON');
    process.exit(1);
  }
  const correlationId = invitation['dbn:cid'] || null;
  console.log('--- Invitation ---');
  console.log(JSON.stringify(invitation, null, 2));
  console.log('--- Summary ---');
  console.log('Type:', invitation['@type']);
  console.log('ID  :', invitation['@id']);
  console.log('Label:', invitation.label || '(none)');
  console.log('Target DID:', invitation['dbn:target'] || '(none)');
  console.log('Correlation ID:', correlationId || '(none)');
}

if (require.main === module) {
  main();
}
