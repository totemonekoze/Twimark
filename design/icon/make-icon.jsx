// Twimark のアイコンを Illustrator で描いて保存し、各大きさに書き出す台本（ExtendScript）。
// 流し方: PowerShell から COM で  $ai = New-Object -ComObject Illustrator.Application; $ai.DoJavaScriptFile(<この台本>, @(<プロジェクトの根>, <出力の形>))
//   出力の形は "preview"（案の PNG を design/icon/preview.png に書くだけ）か "all"（.ai を保存し、すべてを書き出す）。
// 絵: 抹茶の黄緑の地（上が少し明るい縦のグラデーション）に白のしおり。しおりから「T」の形を抜き、T の縦棒は下の切り込みの頂点へ届く。
// アートボードは3つ。1: 角なしの正方形（アプリ・iPhone・PWA の maskable）、2: 角丸の正方形（PWA・ファビコンの SVG・拡張の大）、
// 3: 小さな大きさ用（単色の地と、T を抜かない太めのしおり。16・32 でつぶれないように）
var ROOT = arguments[0];
var MODE = arguments[1] || 'preview';
var S = 1024;
var GAP = 128;

function rgb(hex) {
  var c = new RGBColor();
  c.red = parseInt(hex.substr(1, 2), 16);
  c.green = parseInt(hex.substr(3, 2), 16);
  c.blue = parseInt(hex.substr(5, 2), 16);
  return c;
}
function gradient(doc) {
  var g = doc.gradients.add();
  g.type = GradientType.LINEAR;
  g.gradientStops[0].color = rgb('#A6C96E');
  g.gradientStops[0].rampPoint = 0;
  g.gradientStops[1].color = rgb('#7FA446');
  g.gradientStops[1].rampPoint = 100;
  var gc = new GradientColor();
  gc.gradient = g;
  return gc;
}
// 画面の座標（左上が原点、下へ正）で点を並べる。ox はアートボードの左端
function shape(layer, ox, pts, closed) {
  var p = layer.pathItems.add();
  var list = [];
  for (var i = 0; i < pts.length; i++) list.push([ox + pts[i][0], -pts[i][1]]);
  p.setEntirePath(list);
  p.closed = closed !== false;
  p.stroked = false;
  return p;
}
function roundedRect(layer, ox, size, r) {
  var p = layer.pathItems.roundedRectangle(0, ox, size, size, r, r);
  p.stroked = false;
  return p;
}
// しおり（上が角丸でない四角、下に V の切り込み）。w・h・top はアートボードの中での大きさ
function ribbonPoints(cx, top, w, h, notch) {
  var l = cx - w / 2;
  var r = cx + w / 2;
  var b = top + h;
  return [[l, top], [r, top], [r, b], [cx, b - notch], [l, b]];
}
// しおりから T を抜いた形。T の縦棒は下の切り込みへ抜けるので、1本の線で囲む
function ribbonWithT(layer, ox) {
  var cx = S / 2;
  var top = 236;
  var w = 420;
  var h = 572;
  var notch = 150;
  var barTop = top + 92;
  var barW = 236;
  var barH = 74;
  var stemW = 74;
  var l = cx - w / 2;
  var r = cx + w / 2;
  var b = top + h;
  var bl = cx - barW / 2;
  var br = cx + barW / 2;
  var sl = cx - stemW / 2;
  var sr = cx + stemW / 2;
  var bb = barTop + barH;
  // 縦棒の左右の線が、切り込みの斜めの線と交わる高さ
  var meet = b - notch * ((r - sr) / (r - cx));
  var p = shape(layer, ox, [[l, top], [r, top], [r, b], [sr, meet], [sr, bb], [br, bb], [br, barTop], [bl, barTop], [bl, bb], [sl, bb], [sl, meet], [l, b]]);
  p.filled = true;
  p.fillColor = rgb('#FFFFFF');
  return p;
}

app.coordinateSystem = CoordinateSystem.DOCUMENTCOORDINATESYSTEM;
var doc = app.documents.add(DocumentColorSpace.RGB, S, S);
var ab = doc.artboards;
ab[0].artboardRect = [0, 0, S, -S];
ab[0].name = 'square';
ab.add([S + GAP, 0, 2 * S + GAP, -S]).name = 'rounded';
ab.add([2 * (S + GAP), 0, 3 * S + 2 * GAP, -S]).name = 'small';
var layer = doc.layers[0];
var fill = gradient(doc);

// 1: 角なしの正方形
var bg1 = layer.pathItems.rectangle(0, 0, S, S);
bg1.stroked = false;
bg1.fillColor = fill;
ribbonWithT(layer, 0);

// 2: 角丸の正方形（iOS に近い 22.5% の角丸）
var o2 = S + GAP;
var bg2 = roundedRect(layer, o2, S, S * 0.225);
bg2.fillColor = fill;
ribbonWithT(layer, o2);

// 3: 小さな大きさ用
var o3 = 2 * (S + GAP);
var bg3 = roundedRect(layer, o3, S, S * 0.225);
bg3.fillColor = rgb('#8DB255');
var small = shape(layer, o3, ribbonPoints(S / 2, 196, 520, 660, 190));
small.filled = true;
small.fillColor = rgb('#FFFFFF');

// グラデーションは上から下へ（既定は左から右なので 90 度回す）
for (var k = 0; k < 2; k++) {
  var bg = k === 0 ? bg1 : bg2;
  bg.fillColor = fill;
  bg.rotate(-90, false, false, true, false, Transformation.CENTER);
}

function png(index, size, file, transparent) {
  doc.artboards.setActiveArtboardIndex(index);
  var o = new ExportOptionsPNG24();
  o.artBoardClipping = true;
  o.antiAliasing = true;
  o.transparency = transparent;
  o.horizontalScale = size / S * 100;
  o.verticalScale = size / S * 100;
  doc.exportFile(new File(file), ExportType.PNG24, o);
}

if (MODE === 'preview') {
  png(0, 512, ROOT + '/design/icon/preview-square.png', false);
  png(1, 512, ROOT + '/design/icon/preview-rounded.png', true);
  png(2, 64, ROOT + '/design/icon/preview-small.png', true);
} else {
  var ai = new IllustratorSaveOptions();
  doc.saveAs(new File(ROOT + '/design/icon/twimark-icon.ai'), ai);
  var site = ROOT + '/src/site/icons/';
  var ext = ROOT + '/src/extension/icons/';
  png(0, 1024, ROOT + '/src/mobile/assets/icon.png', false);
  png(0, 180, site + 'apple-touch-icon.png', false);
  png(0, 512, site + 'icon-512-maskable.png', false);
  png(1, 192, site + 'icon-192.png', true);
  png(1, 512, site + 'icon-512.png', true);
  png(2, 32, site + 'favicon-32.png', true);
  png(1, 128, ext + 'icon-128.png', true);
  png(1, 48, ext + 'icon-48.png', true);
  png(2, 32, ext + 'icon-32.png', true);
  png(2, 16, ext + 'icon-16.png', true);
  // ファビコンの SVG は、角丸の正方形のアートボードだけを書き出す
  doc.artboards.setActiveArtboardIndex(1);
  var svg = new ExportOptionsSVG();
  svg.saveMultipleArtboards = true;
  svg.artboardRange = '2';
  svg.embedRasterImages = true;
  svg.cssProperties = SVGCSSPropertyLocation.PRESENTATIONATTRIBUTES;
  svg.fontType = SVGFontType.OUTLINEFONT;
  svg.coordinatePrecision = 1;
  doc.exportFile(new File(site + 'favicon.svg'), ExportType.SVG, svg);
  // Illustrator はアートボードの名前を後ろに付けるので、favicon.svg に直す
  var out = new File(site + 'favicon_rounded.svg');
  var named = new File(site + 'favicon.svg');
  if (named.exists) named.remove();
  if (out.exists) out.rename('favicon.svg');
  // 幅と高さを書き足す（viewBox だけだと、画像として読んだときの大きさが 150 になる）
  named = new File(site + 'favicon.svg');
  named.open('r');
  var text = named.read();
  named.close();
  named.open('w');
  named.write(text.replace(' viewBox="0 0 1024 1024"', ' width="1024" height="1024" viewBox="0 0 1024 1024"'));
  named.close();
}
doc.close(SaveOptions.DONOTSAVECHANGES);
'ok';
