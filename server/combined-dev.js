import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

console.log('Starting Novel Scraper v2 in development mode...');
console.log('Backend: http://localhost:3002');
console.log('Frontend: http://localhost:5173');

// Start Vite dev server
const vite = spawn('npx', ['vite', '--port', '5173'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true
});

// Start Express backend
const server = spawn('node', ['server/index.js'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true
});

// Handle shutdown
process.on('SIGINT', () => {
    vite.kill();
    server.kill();
    process.exit();
});
