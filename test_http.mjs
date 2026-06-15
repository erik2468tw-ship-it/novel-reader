import https from 'https';

const url = 'https://www.novel543.com/1105676030/dir';

const options = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive'
  }
};

https.get(url, options, (res) => {
  console.log('Status:', res.statusCode);
  
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Data length:', data.length);
    
    // Try pattern matching
    const pattern = /href="([^"]+)"[^>]*>\s*第(\d+)章[^<]*/gi;
    let match;
    const links = [];
    while ((match = pattern.exec(data)) !== null) {
      const href = match[1];
      const chapterNum = match[2];
      if (href.includes('/dir') || href.includes('ranking') || href.includes('auth') || href.includes('signin')) continue;
      const titleMatch = data.substring(match.index, match.index + 500).match(/第\d+章\s*([^<\n]+)/);
      const title = titleMatch ? titleMatch[1].trim() : `第${chapterNum}章`;
      links.push({ title, url: href });
    }
    
    console.log('Found by pattern 1:', links.length);
    
    if (links.length === 0) {
      const simplePattern = /href="([^"]+\.html)"/gi;
      while ((match = simplePattern.exec(data)) !== null) {
        const href = match[1];
        if (href.includes('/dir') || href.includes('ranking') || href.includes('auth') || href.includes('signin')) continue;
        const start = Math.max(0, match.index - 100);
        const end = Math.min(data.length, match.index + match[0].length + 200);
        const context = data.substring(start, end);
        const chapterMatch = context.match(/第(\d+)章\s*([^<\n]+)/);
        const title = chapterMatch ? chapterMatch[2].trim().substring(0, 50) : '未知章節';
        links.push({ title, url: href });
      }
      console.log('Found by pattern 2:', links.length);
    }
    
    // Print first 5
    links.slice(0, 5).forEach(l => console.log(l.title, l.url));
  });
}).on('error', (e) => console.error('Error:', e.message));