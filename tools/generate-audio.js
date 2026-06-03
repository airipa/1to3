/**
 * 多引擎语音下载器 - 生成自含音频的十国外语页面
 *
 * 使用方法:
 *   node generate-audio.js
 *
 * 如果你的服务器在国外或能访问 Google，会自动下载所有音频。
 * 如果被墙，可以设置代理:
 *   Windows: set HTTPS_PROXY=http://127.0.0.1:7890 && node generate-audio.js
 *   Mac/Linux: HTTPS_PROXY=http://127.0.0.1:7890 node generate-audio.js
 *
 * 输出: audio-data.js (base64 编码的所有问候语音频)
 * 之后把 audio-data.js 和 hello10-final.html 放一起即可
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const url = require('url');

// ===== 配置 =====
const OUTPUT_JS = './audio-data.js';

// 从环境变量读取代理
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || '';

// 语言列表
const LANGS = [
  { id: 'zh', text: '你好', lang: 'zh-CN' },
  { id: 'en', text: 'Hello', lang: 'en' },
  { id: 'es', text: 'Hola', lang: 'es' },
  { id: 'hi', text: 'नमस्ते', lang: 'hi' },
  { id: 'ar', text: 'السلام عليكم', lang: 'ar' },
  { id: 'pt', text: 'Olá', lang: 'pt' },
  { id: 'bn', text: 'নমস্কার', lang: 'bn' },
  { id: 'ru', text: 'Здравствуйте', lang: 'ru' },
  { id: 'ja', text: 'こんにちは', lang: 'ja' },
  { id: 'ko', text: '안녕하세요', lang: 'ko' },
  { id: 'de', text: 'Guten Tag', lang: 'de' },
  { id: 'fr', text: 'Bonjour', lang: 'fr' },
  { id: 'vi', text: 'Xin chào', lang: 'vi' },
  { id: 'it', text: 'Ciao', lang: 'it' },
  { id: 'th_m', text: 'สวัสดีครับ', lang: 'th', label: '♂ Thai Male' },
  { id: 'th_f', text: 'สวัสดีค่ะ', lang: 'th', label: '♀ Thai Female' },
];

function downloadWithProxy(targetUrl, proxyUrl) {
  return new Promise((resolve, reject) => {
    const parsedTarget = url.parse(targetUrl);
    let options, client;

    if (proxyUrl) {
      const parsedProxy = url.parse(proxyUrl);
      client = parsedProxy.protocol === 'https:' ? https : http;
      options = {
        hostname: parsedProxy.hostname,
        port: parsedProxy.port || (parsedProxy.protocol === 'https:' ? 443 : 80),
        method: 'CONNECT',
        path: parsedTarget.host + ':443',
        headers: { 'Host': parsedTarget.host + ':443', 'User-Agent': 'Mozilla/5.0' },
      };
      const req = client.request(options);
      req.on('connect', (res, socket) => {
        if (res.statusCode !== 200) {
          reject(new Error('Proxy CONNECT failed: ' + res.statusCode));
          return;
        }
        const targetReq = https.request({
          host: parsedTarget.host,
          path: parsedTarget.path + (parsedTarget.search || ''),
          method: 'GET',
          headers: { 'User-Agent': 'Mozilla/5.0' },
          socket,
          agent: false,
          createConnection: () => socket,
        }, (res2) => {
          const chunks = [];
          res2.on('data', c => chunks.push(c));
          res2.on('end', () => resolve(Buffer.concat(chunks)));
        });
        targetReq.end();
      });
      req.on('error', reject);
      req.end();
    } else {
      client = https;
      options = {
        hostname: parsedTarget.hostname,
        path: parsedTarget.path + (parsedTarget.search || ''),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      };
      const req = client.get(options, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    }
  });
}

function makeURL(text, lang) {
  return `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
}

async function downloadAll() {
  const results = {};
  for (const lang of LANGS) {
    const label = lang.label || lang.id;
    process.stdout.write(`Downloading ${label}... `);
    const url = makeURL(lang.text, lang.lang);
    try {
      const buf = await downloadWithProxy(url, PROXY);
      results[lang.id] = `data:audio/mp3;base64,${buf.toString('base64')}`;
      process.stdout.write(`OK (${(buf.length / 1024).toFixed(0)}KB)\n`);
    } catch (err) {
      process.stdout.write(`FAILED: ${err.message}\n`);
    }
  }
  return results;
}

async function main() {
  console.log('🎧 十国外语语音下载器\n');
  if (PROXY) console.log(`使用代理: ${PROXY}\n`);
  else console.log('无代理。如需代理: set HTTPS_PROXY=http://ip:port && node generate-audio.js\n');

  const results = await downloadAll();

  // 统计
  const ok = Object.keys(results).length;
  const failed = LANGS.filter(l => !results[l.id]);
  console.log(`\n📊 结果: ${ok}/${LANGS.length} 成功`);
  if (failed.length) console.log(`❌ 失败: ${failed.map(l => l.label || l.id).join(', ')}`);

  // 生成 JS — 用 IIFE 赋值给 HELLO10_AUDIO（避免 const 重复声明错误）
  if (ok > 0) {
    // 加 th 别名 = th_m（考试时用 th 查找）
    if (results['th_m']) results['th'] = results['th_m'];
    const js = `// 自动生成的语音数据
// 生成时间: ${new Date().toISOString()}
window.HELLO10_AUDIO = ${JSON.stringify(results, null, 2)};`;
    fs.writeFileSync(OUTPUT_JS, js, 'utf-8');
    console.log(`✅ 已生成: ${OUTPUT_JS}`);

    // 输出 HTML 中引入该文件的 script 标签
    console.log(`\n在 HTML 中添加: <script src="audio-data.js"></script>`);
    console.log(`然后在 play() 函数中使用 HELLO10_AUDIO[id] 播放`);
  } else {
    console.log('\n❌ 全部失败，无法生成语音数据文件');
    console.log('请尝试: HTTPS_PROXY=http://代理IP:端口 node generate-audio.js');
  }
}

main().catch(console.error);
