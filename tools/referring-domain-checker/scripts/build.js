const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const client = path.join(root, 'dist', 'client');
const server = path.join(root, 'dist', 'server');
const assets = ['index.html', 'styles.css', 'domain-utils.js', 'app.js'];

fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
fs.mkdirSync(client, { recursive: true });
fs.mkdirSync(server, { recursive: true });
for (const asset of assets) fs.copyFileSync(path.join(root, asset), path.join(client, asset));

fs.writeFileSync(path.join(server, 'index.js'), `export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  }
};
`);

console.log('Built Link Ledger for deployment.');
