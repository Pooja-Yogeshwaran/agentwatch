'use strict';
// CA lifecycle. Primary trust path is PER-PROCESS injection via env vars on the
// wrapped child only (proven sufficient for Node in Step 0). System trust-store
// install is an explicit, documented, reversible fallback — never automatic.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const mockttp = require('mockttp');

function caDir() {
  const dir = path.join(os.homedir(), '.agentwatch', 'ca');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const CERT_PATH = () => path.join(caDir(), 'agentwatch-ca.pem');
const KEY_PATH = () => path.join(caDir(), 'agentwatch-ca-key.pem');

// Load a stable CA if present, else generate and persist one. Stability matters
// so an optional one-time system-store install keeps working across sessions.
async function ensureCa() {
  const certPath = CERT_PATH();
  const keyPath = KEY_PATH();
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return { certPath, keyPath, cert: fs.readFileSync(certPath, 'utf8'), key: fs.readFileSync(keyPath, 'utf8') };
  }
  const ca = await mockttp.generateCACertificate({ commonName: 'agentwatch local CA' });
  fs.writeFileSync(certPath, ca.cert, { mode: 0o600 });
  fs.writeFileSync(keyPath, ca.key, { mode: 0o600 });
  return { certPath, keyPath, cert: ca.cert, key: ca.key };
}

// Env vars that inject the CA into the child's runtime WITHOUT touching the
// system store. Covers Node, Python (requests/httpx), Go, curl, and git.
function caEnv(certPath) {
  return {
    NODE_EXTRA_CA_CERTS: certPath,
    SSL_CERT_FILE: certPath,       // OpenSSL / many Go binaries / Python ssl
    REQUESTS_CA_BUNDLE: certPath,  // python requests
    CURL_CA_BUNDLE: certPath,      // curl
    GIT_SSL_CAINFO: certPath,      // git over https
  };
}

// Returns the exact, copy-pasteable commands for the OPTIONAL system-store
// fallback + its removal. We return strings rather than running anything.
function systemStoreCommands(certPath) {
  if (process.platform === 'win32') {
    return {
      install: `certutil -addstore -user -f Root "${certPath}"`,
      uninstall: `certutil -delstore -user Root "agentwatch local CA"`,
      note: 'Adds to the current user\'s Root store (no admin needed). Removal is one command.',
    };
  }
  if (process.platform === 'darwin') {
    return {
      install: `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${certPath}"`,
      uninstall: `sudo security delete-certificate -c "agentwatch local CA"`,
      note: 'Requires admin. Prefer per-process injection unless the agent ignores env vars.',
    };
  }
  return {
    install: `sudo cp "${certPath}" /usr/local/share/ca-certificates/agentwatch-ca.crt && sudo update-ca-certificates`,
    uninstall: `sudo rm /usr/local/share/ca-certificates/agentwatch-ca.crt && sudo update-ca-certificates --fresh`,
    note: 'Debian/Ubuntu paths shown; other distros differ.',
  };
}

// Only invoked by an explicit `agentwatch ca --install`. Never automatic.
function installSystemStore(certPath) {
  if (process.platform !== 'win32') {
    throw new Error('Automatic install only implemented on Windows; run the printed command manually on this OS.');
  }
  execFileSync('certutil', ['-addstore', '-user', '-f', 'Root', certPath], { stdio: 'inherit' });
}

module.exports = { ensureCa, caEnv, systemStoreCommands, installSystemStore, CERT_PATH, KEY_PATH, caDir };
