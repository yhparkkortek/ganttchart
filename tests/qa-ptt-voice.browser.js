/* 🎙️ 음성 버튼 PTT(Push-To-Talk) — 실제 경로로 돌리는 검증 (2026-11-04)
 *
 *   쓰는 법: 앱을 열고 **AI 문답 창을 띄운 뒤**(#gantt-qa-input 이 있어야 한다)
 *            브라우저 콘솔에 이 파일 전체를 붙여넣는다.
 *
 * 왜 이 파일이 따로 있나
 * ──────────────────────
 * 사용자 제보: "음성 버튼 누르면 잡음 또는 타이밍 맞추기가 어려우니, 누르고 있는 동안만
 * 듣고 떼면 바로 전송하는 방식(PTT)으로 바꿔달라" — 기존 토글+침묵타이머 방식을 버리고
 * window._ganttQaPttDown/_ganttQaPttUp 으로 교체했다(js/04h). 가짜는 **두 곳의 경계에만**
 * — window.SpeechRecognition(마이크·음성인식 자체, 헤드리스 환경엔 권한이 없다)과
 * window.sendGanttQaMessage(AI 호출, 키 없이도 돌게). 그 안쪽(_ganttQaPttDown의 상태
 * 전이·버튼 라벨 갱신·transcript 조립·onend에서 전송까지 잇는 연결)은 전부 진짜 코드로 돈다.
 */
(async function () {
    'use strict';
    const input = document.getElementById('gantt-qa-input');
    if (!input) { console.error('❌ AI 문답 창을 먼저 열어주세요 (#gantt-qa-input 없음)'); return; }
    const btn = document.getElementById('gantt-qa-mic-btn2');
    if (!btn) { console.error('❌ 음성 버튼(#gantt-qa-mic-btn2)을 찾을 수 없습니다'); return; }

    let fails = 0, passes = 0;
    const ok = (cond, label, extra) => {
        if (cond) { passes++; console.log('%c ✅ ' + label, 'color:#1f7a3d'); }
        else { fails++; console.log('%c ❌ ' + label + (extra ? ' — ' + extra : ''), 'color:#c92a2a'); }
    };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // 가짜 SpeechRecognition — start() 후 final 결과 1건을 비동기로 흘려보내고,
    // stop()을 부르면 onend가 뒤이어 돈다(실제 브라우저 SpeechRecognition과 같은 비동기 순서).
    function FakeSR(transcript, opts) {
        opts = opts || {};
        this._transcript = transcript;
        this._errorOnStart = opts.errorOnStart || null;
        this.onresult = null; this.onerror = null; this.onend = null; this.onstart = null;
    }
    FakeSR.prototype.start = function () {
        const self = this;
        if (self._errorOnStart) {
            setTimeout(function () { if (self.onerror) self.onerror({ error: self._errorOnStart }); }, 5);
            return;
        }
        setTimeout(function () {
            if (self.onresult && self._transcript) {
                self.onresult({ results: [{ 0: { transcript: self._transcript }, isFinal: true, length: 1 }], length: 1 });
            }
        }, 10);
    };
    FakeSR.prototype.stop = function () {
        const self = this;
        setTimeout(function () { if (self.onend) self.onend(); }, 10);
    };

    const origSR = window.SpeechRecognition, origWSR = window.webkitSpeechRecognition;
    const origSend = window.sendGanttQaMessage;
    const useFake = function (transcript, opts) {
        const Fake = function () { return new FakeSR(transcript, opts); };
        window.SpeechRecognition = Fake; window.webkitSpeechRecognition = Fake;
    };
    const restoreReal = function () {
        window.SpeechRecognition = origSR; window.webkitSpeechRecognition = origWSR;
    };

    // ── 1) 누르면 즉시 "듣는 중" 상태(🔴 아이콘만, 2026-11-04부터 글자 없음)로 바뀐다 ──
    useFake('자재 재고 알려줘');
    input.value = '';
    window._ganttQaPttDown();
    await sleep(20);
    ok(window._ganttQaPttActive === true, '누르면 _ganttQaPttActive=true');
    ok(btn.innerHTML === '🔴', '누르면 버튼이 🔴 아이콘만 보임(글자 없음)', btn.innerHTML);

    // ── 2) 떼면 인식을 멈추고, 받아쓴 내용을 sendGanttQaMessage로 그대로 보낸다 ──
    let sentWith = null;
    window.sendGanttQaMessage = async function () { sentWith = input.value; };
    window._ganttQaPttUp();
    await sleep(80);
    ok(window._ganttQaPttActive === false, '떼면 _ganttQaPttActive=false로 돌아옴');
    ok(btn.innerHTML !== '🔴', '떼면 버튼 라벨이 원래대로 돌아옴', btn.innerHTML);
    ok(sentWith === '자재 재고 알려줘', '받아쓴 문장을 그대로 전송 호출에 실음', sentWith);

    // ── 3) 말 없이 바로 떼면(짧게 탭) 전송을 호출하지 않는다 ──────────────────
    useFake(''); // 결과 없음
    sentWith = null;
    window._ganttQaPttDown();
    await sleep(5);
    window._ganttQaPttUp();
    await sleep(80);
    ok(sentWith === null, '아무 말 안 하고 떼면 전송하지 않음(빈 transcript)', sentWith);

    // ── 4) 마이크 권한 거부 시 조용히 active 해제(무한 루프/알림 폭탄 없이) ──────
    useFake(null, { errorOnStart: 'audio-capture' });
    const origAlert = window.alert; window.alert = function () {}; // 이 테스트에서만 알림창 억제
    window._ganttQaPttDown();
    await sleep(40);
    window.alert = origAlert;
    ok(window._ganttQaPttActive === false, '권한 거부 시 active 상태로 멈춰있지 않음(onerror만 오고 onend는 안 옴에도)');

    // ── 5) 이미 듣는 중이면 다시 눌러도 새로 시작하지 않는다(중복 방지) ────────
    useFake('첫 번째 문장');
    window._ganttQaPttDown();
    await sleep(5);
    const recBefore = window._ganttQaPttRecognition;
    window._ganttQaPttDown(); // 중복 호출
    ok(window._ganttQaPttRecognition === recBefore, '듣는 중 재호출은 새 인식을 만들지 않음(중복 방지)');
    window._ganttQaPttUp();
    await sleep(80);

    restoreReal();
    window.sendGanttQaMessage = origSend;

    console.log(`\n🎙️ PTT 검증 결과: ${passes}/${passes + fails} 통과` + (fails ? ' ⚠️' : ' ✅'));
})();
