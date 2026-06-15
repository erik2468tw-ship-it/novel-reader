import https from 'https';
import zlib from 'zlib';

const urls = [
  'https://www.novel543.com/0606693257/dir',
  'https://www.novel543.com/1108693286/dir',
  'https://www.novel543.com/0125693276/dir'
];

for (const url of urls) {
  console.log('\n=== Testing:', url, '===');
  
  const result = await new Promise((resolve) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br'
      }
    }, (res) => {
      console.log('Status:', res.statusCode);
      const encoding = res.headers['content-encoding'];
      console.log('Encoding:', encoding);
      
      let decompressor = res;
      if (encoding === 'br') {
        decompressor = zlib.createBrotliDecompress();
        res.pipe(decompressor);
      } else if (encoding === 'gzip') {
        decompressor = zlib.createGunzip();
        res.pipe(decompressor);
      }
      
      let data = '';
      decompressor.on('data', chunk => data += chunk);
      decompressor.on('end', () => {
        console.log('Length:', data.length);
        
        // Try pattern 1
        const pattern = /href="([^"]+)"[^>]*>\s*第(\d+)章[^<]*/gi;
        let match;
        const links = [];
        while ((match = pattern.exec(data)) !== null) {
          const href = match[1];
          if (href.includes('/dir') || href.includes('ranking') || href.includes('auth')) continue;
          const titleMatch = data.substring(match.index, match.index + 500).match(/第\d+章\s*([^<\n]+)/);
          const title = titleMatch ? titleMatch[1].trim() : `第${match[2]}章`;
          links.push({ title, url: href });
        }
        
        console.log('Found by pattern 1:', links.length);
        if (links.length > 0) {
          links.slice(0, 3).forEach(l => console.log(' ', l.title, l.url));
        }
        
        // Try pattern 2 if no results
        if (links.length === 0) {
          const simplePattern = /href="([^"]+\.html)"/gi;
          while ((match = simplePattern.exec(data)) !== null) {
            const href = match[1];
            if (href.includes('/dir') || href.includes('ranking') || href.includes('auth')) continue;
            const start = Math.max(0, match.index - 100);
            const end = Math.min(data.length, match.index + match[0].length + 200);
            const context = data.substring(start, end);
            const chapterMatch = context.match(/第(\d+)章\s*([^<\n]+)/);
            const title = chapterMatch ? chapterMatch[2].trim().substring(0, 50) : '未知章節';
            links.push({ title, url: href });
          }
          console.log('Found by pattern 2:', links.length);
          if (links.length > 0) {
            links.slice(0, 3).forEach(l => console.log(' ', l.title, l.url));
          }
        }
        
        resolve(links.length);
      });
    });
    
    req.on('error', e => {
      console.log('Error:', e.message);
      resolve(0);
    });
    
    req.setTimeout(30000, () => {
      req.destroy();
      resolve(0);
    });
  });
}

console.log('\nDone');