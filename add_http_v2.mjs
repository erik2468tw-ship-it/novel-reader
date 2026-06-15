import { readFileSync, writeFileSync } from 'fs';

const filePath = 'G:/SoftwareDev/novel-reader/server/integrated.js';
let content = readFileSync(filePath, 'utf8');

// Find the getChapterUrlsByHttp function and fix the URL handling
const oldPattern = `const title = titleMatch ? titleMatch[1].trim() : '第' + chapterNum + '章';
                    links.push({ title: title, url: href });`;

const newPattern = `const title = titleMatch ? titleMatch[1].trim() : '第' + chapterNum + '章';
                    // Convert relative URL to absolute URL
                    const fullUrl = href.startsWith('http') ? href : 'https://www.novel543.com' + href;
                    links.push({ title: title, url: fullUrl });`;

if (content.includes(oldPattern)) {
  content = content.replace(oldPattern, newPattern);
  console.log('Fixed URL in first pattern');
} else {
  console.log('First pattern not found');
}

// Also fix the second pattern (fallback pattern)
const oldPattern2 = `const title = chapterMatch ? chapterMatch[2].trim().substring(0, 50) : '未知章節';
                    links.push({ title: title, url: href });`;

const newPattern2 = `const title = chapterMatch ? chapterMatch[2].trim().substring(0, 50) : '未知章節';
                    const fullUrl = href.startsWith('http') ? href : 'https://www.novel543.com' + href;
                    links.push({ title: title, url: fullUrl });`;

if (content.includes(oldPattern2)) {
  content = content.replace(oldPattern2, newPattern2);
  console.log('Fixed URL in second pattern');
} else {
  console.log('Second pattern not found');
}

writeFileSync(filePath, content, 'utf8');
console.log('Done');