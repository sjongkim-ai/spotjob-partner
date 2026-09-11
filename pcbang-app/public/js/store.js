/*
 * 시안용 저장소 — 세 앱이 같은 브라우저 저장소(localStorage)를 함께 쓴다.
 * 실서비스에서는 이 자리를 API 호출로 바꾸고, 규칙(workflow.js)은 서버에서 실행한다.
 * 연소자 서류 원본은 여기에 절대 저장하지 않는다 (형식·크기만 기록, §3.7).
 */
(function (root) {
    'use strict';

    const KEY = 'spotjob.db.v1';
    const VERSION = 1;
    let db = null;
    const listeners = [];

    function read() {
        try {
            const raw = localStorage.getItem(KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    }

    function write() {
        try {
            localStorage.setItem(KEY, JSON.stringify(db));
        } catch (error) {
            // 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 이번 방문 동안만 유지
        }
    }

    function notify() {
        listeners.forEach(listener => listener(db));
    }

    function load() {
        const saved = read();
        db = saved && saved.version === VERSION ? saved : root.Seed.createSeedData(new Date());
        write();
        return db;
    }

    function get() {
        return db || load();
    }

    // 규칙 함수를 실행하고 저장한 뒤 화면을 다시 그린다
    function run(action) {
        const result = action(get());
        write();
        notify();
        return result;
    }

    function subscribe(listener) {
        listeners.push(listener);
    }

    function reset() {
        db = root.Seed.createSeedData(new Date());
        write();
        notify();
    }

    // 다른 탭(예: 사장님 앱과 파트너 앱을 따로 연 경우)에서 바뀌면 다시 읽는다
    root.addEventListener('storage', event => {
        if (event.key !== KEY) return;
        const saved = read();
        if (saved && saved.version === VERSION) {
            db = saved;
            notify();
        }
    });

    root.Store = { KEY, get, load, run, subscribe, reset };
})(window);
