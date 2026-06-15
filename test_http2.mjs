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

const req = https.get(url, options, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', JSON.stringify(res.headers, null, 2));
  
  const encoding = res.headers['content-encoding'];
  console.log('Encoding:', encoding);
  
  let data = '';
  
  if (encoding === 'gzip') {
    const gunzip = zlib.createGunzip();
    res.pipe(gunzip);
    gunzip.on('data', chunk => data += chunk);
    gunzip.on('end', () => {
      console.log('Decompressed length:', data.length);
      findLinks(data);
    });
  } else if (encoding === 'br') {
    const brotli = zlib.createBrotliDecompress();
    res.pipe(brotli);
    brotli.on('data', chunk => data += chunk);
    brotli.on('end', () => {
      console.log('Decompressed length:', data.length);
      findLinks(data);
    });
  } else {
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('Raw length:', data.length);
      findLinks(data);
    });
  }
});

req.on('error', e => console.error('Error:', e.message));

function findLinks(html) {
  // Look for all links
  const allLinks = html.match(/href="[^"]+"/g);
  console.log('All href attributes:', allLinks ? allLinks.length : 0);
  if (allLinks) {
    console.log('First 10:', allLinks.slice(0, 10));
  }
  
  // Look for chapter-related content
  const chapterContent = html.match(/第\d+章[^<]*/g);
  console.log('Chapter mentions:', chapterContent ? chapterContent.length : 0);
  if (chapterContent) {
    console.log('First 5:', chapterContent.slice(0, 5));
  }
}