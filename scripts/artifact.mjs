// Turns the single-file demo build into an Artifact page body:
// node scripts/artifact.mjs <out.html>
import fs from 'node:fs';

const src = fs.readFileSync('dist-demo/index.html', 'utf8');
const out = process.argv[2] || 'dist-demo/artifact.html';

const between = (startMarker, endMarker, from = 0) => {
  const s = src.indexOf(startMarker, from);
  if (s < 0) throw new Error('missing ' + startMarker);
  const e = src.indexOf(endMarker, s + startMarker.length);
  return src.slice(s, e + endMarker.length);
};

const title = between('<title>', '</title>');
const fonts = src.match(/<link\s+rel="stylesheet"\s+href="https:\/\/fonts\.googleapis\.com[^>]*>/)[0];
// the app's CSS (inlined by vite-plugin-singlefile); CSS never contains "</style>"
const css = between('<style rel="stylesheet"', '</style>');
// the app's JS: the module script tag up to its closing tag. Vite escapes
// "</script>" inside the bundle as "<\/script>", so the first real one ends it
// (the bundle itself may contain "</head>", e.g. in the portfolio template).
const sStart = src.indexOf('<script type="module"');
const sEnd = src.indexOf('</script>', sStart) + '</script>'.length;
const js = src.slice(sStart, sEnd);
const html = [title, fonts, css, '<div id="root"></div>', js].join('\n');
fs.writeFileSync(out, html);
console.log(out, (html.length / 1024).toFixed(0) + ' KB');
