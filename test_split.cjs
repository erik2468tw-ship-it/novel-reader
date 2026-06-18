const testStr = '第157章 你不是兇手第157章 你不是兇手雲薇薇的眼眶又紅了，但她沒有哭。\n\n"他跟我說，那是他女兒，叫張淑，小名叫寶兒。\n\n秦舒安靜地聽著，沒有打斷。';

console.log('Original has \\n\\n:', testStr.includes('\n\n'));
console.log('Original parts by \n\\n:', testStr.split('\n\n').length);

const parts = testStr.split('\n');
console.log('Parts count after split \\n:', parts.length);

for(let i=0; i<Math.min(5, parts.length); i++) {
  console.log('['+i+'] len='+parts[i].length+':', JSON.stringify(parts[i]).substring(0,50));
}

// Test filter
const filtered = parts
  .map(para => para.replace(/\t/g, '').replace(/ {2,}/g, ' ').trim())
  .filter(para => para.length > 3 && !para.match(/^[\s\W]+$/));

console.log('\nFiltered count:', filtered.length);
console.log('First filtered:', JSON.stringify(filtered[0]).substring(0,50));
