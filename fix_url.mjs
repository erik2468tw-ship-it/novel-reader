import { readFileSync, writeFileSync } from 'fs';

const filePath = 'G:/SoftwareDev/novel-reader/server/integrated.js';
let content = readFileSync(filePath, 'utf8');

// Find and replace the dirUrl construction
const oldLine = "const dirUrl = novelUrl.endsWith('/dir') ? novelUrl : novelUrl + '/dir';";
const newLine = `const baseUrl = novelUrl.endsWith('/') ? novelUrl.slice(0, -1) : novelUrl;
    const dirUrl = baseUrl + '/dir';`;

if (content.includes(oldLine)) {
  content = content.replace(oldLine, newLine);
  console.log('Fixed dirUrl construction');
} else {
  console.log('Old line not found');
}

writeFileSync(filePath, content, 'utf8');
console.log('Done');