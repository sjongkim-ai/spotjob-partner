/*
 * 로컬 개발 서버 — 실제 서비스처럼 http로 띄운다.
 * file://로 열면 서비스워커·앱 설치·오프라인이 동작하지 않는다. localhost는 보안 컨텍스트라 모두 동작한다.
 *
 * 실행: node pcbang-app/serve.js  (포트 바꾸려면: node pcbang-app/serve.js 8080)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, 'public');
const PORT = Number(process.argv[2] || process.env.PORT || 5173);

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8'
};

function localAddress() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            if (net.family === 'IPv4' && !net.internal) return net.address;
        }
    }
    return null;
}

const server = http.createServer((req, res) => {
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname);
    } catch (error) {
        res.writeHead(400).end('bad request');
        return;
    }

    const filePath = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
    // public 폴더 밖 파일 요청 차단
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403).end('forbidden');
        return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': TYPES['.txt'] }).end('찾을 수 없는 주소예요');
        console.log(`404 ${pathname}`);
        return;
    }

    const body = fs.readFileSync(filePath);
    res.writeHead(200, {
        'Content-Type': TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        // 개발 중에는 고친 파일이 바로 보이도록 브라우저 캐시를 쓰지 않는다 (서비스워커 캐시는 그대로 동작)
        'Cache-Control': 'no-store',
        'Content-Length': body.length
    });
    res.end(body);
});

server.listen(PORT, () => {
    const lan = localAddress();
    console.log('스팟잡 파트너 로컬 서버가 열렸어요.');
    console.log(`  이 컴퓨터:  http://localhost:${PORT}/`);
    if (lan) console.log(`  같은 와이파이의 휴대폰:  http://${lan}:${PORT}/  (휴대폰 설치 테스트용)`);
    console.log('  멈추려면 Ctrl+C');
});
