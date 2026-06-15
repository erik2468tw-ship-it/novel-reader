import https from 'https';
import zlib from 'zlib';

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

function decompress(res) {
  const encoding = res.headers['content-encoding'];
  if (encoding === 'br') {
    return res.pipe(zlib.createBrotliDecompress());
  } else if (encoding === 'gzip') {
    return res.pipe(zlib.createGunzip());
  }
  return res;
}

https.get(url, options, (res) => {
  console.log('Status:', res.statusCode);
  
  let data = '';
  decompress(res).on('data', chunk => data += chunk).on('end', () => {
    console.log('Decompressed length:', data.length);
    
    const links = [];
    const pattern = /href="([^"]+)"[^>]*>\s*第(\d+)章[^<]*/gi;
    let match;
    while ((match = pattern.exec(data)) !== null) {
      const href = match[1];
      if (href.includes('/dir') || href.includes('ranking') || href.includes('auth') || href.includes('signin')) continue;
      const titleMatch = data.substring(match.index, match.index + 500).match(/第\d+章\s*([^<\n]+)/);
      const title = titleMatch ? titleMatch[1].trim() : `第${match[2]}章`;
      links.push({ title, url: href });
    }
    
    console.log('Found:', links.length);
    links.slice(0, 5).forEach(l => console.log(l.title, l.url));
  });
}).on('error', e => console.error('Error:', e.message));