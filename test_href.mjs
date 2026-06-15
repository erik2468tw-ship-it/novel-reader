import https from 'https';
import zlib from 'zlib';

const url = 'https://www.novel543.com/0125693276/dir';

const req = https.get(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0',
    'Accept-Encoding': 'br'
  }
}, (res) => {
  const decompressor = zlib.createBrotliDecompress();
  res.pipe(decompressor);
  let data = '';
  decompressor.on('data', chunk => data += chunk);
  decompressor.on('end', () => {
    const matches = data.match(/href="([^"]+)"/g);
    console.log('Total hrefs:', matches ? matches.length : 0);
    console.log('First 10 hrefs:');
    if (matches) matches.slice(0, 10).forEach(m => console.log(m));
  });
});
req.on('error', e => console.log(e.message));