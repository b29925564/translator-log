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
// the app's JS: from the module script tag to the last </script> before </head>
const sStart = src.indexOf('<script type="module"');
const headEnd = src.indexOf('</head>');
const sEnd = src.lastIndexOf('</script>', headEnd) + '</script>'.length;
const js = src.slice(sStart, sEnd);
const html = [title, fonts, css, '<div id="root"></div>', js].join('\n');
fs.writeFileSync(out, html);
console.log(out, (html.length / 1024).toFixed(0) + ' KB');
