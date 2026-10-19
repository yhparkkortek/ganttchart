/* ✍️ [2026-10-19 신규] AI 문답 — 쓰기 도구 (사람 확인 1회 → 자동 실행)
 *
 * 왜 읽기와 **다른 파일/다른 경로**인가
 * ─────────────────────────────────────
 * `js/40-qa-tool-router.js`의 자율 루프는 **읽기만** 실행한다. 쓰기를 같은 루프에 넣으면
 * AI가 잘못 고른 순간 되돌릴 수 없는 일이 벌어진다(예약이 동료에게 보이고, 메일이 나가고,
 * 결재가 상신된다). 그래서 쓰기는 경로를 분리한다:
 *
 *   AI/코드가 **초안**을 만든다  →  확인 카드로 값을 그대로 보여준다  →  사람이 1회 누른다
 *                               →  그 다음은 **끝까지 자동**(임의 정지 없음)
 *
 * 이 순서는 앱의 기존 원칙과 같다 — 구매오더·자재 보관함이 "확인 1회 후 자동"이고,
 * 전자결재는 "임시저장까지만, 상신은 사람"이다(CLAUDE.md).
 *
 * 🔒 구조적 가드
 *  1. `_qaRunTool`(읽기 루프)은 `mode:'write'`를 **영구 거부**한다. 이 파일의 실행기는
 *     `_qaPendingWrite`에 들어 있는 **nonce**를 받아야만 돈다 — 루프가 위조할 수 없다.
 *  2. 초안은 **검증된 인자**만 담는다(읽기와 같은 `_qaValidateToolArgs`).
 *  3. `danger:'high'` 도구는 확인 문구에 사용자가 직접 입력해야 하는 말을 요구한다.
 *  4. 실행 결과·실패를 전부 기록한다(`_qaLogToolCall`).
 */
(function () {
    'use strict';

    var BACKEND = 'http://127.0.0.1:5000';

    // ── 쓰기 도구 레지스트리 (데이터) ────────────────────────────────
    // ⚠️ `verified` 필드가 핵심이다:
    //    'live'    = 실제 호출로 동작 확인됨 → 사용 가능
    //    'pending' = 경로는 알지만 **요청 본문(payload) 미확정** → 실행 차단, 안내만
    //    번들 스캔은 method+경로까지만 준다. payload 필드 이름은 압축 코드가 변수로
    //    조립해서 안 나온다 — 한 번 실제로 관찰해 확정해야 'live'로 올린다.
    //    (추측으로 보내면 안 된다: 읽기에서도 추측 경로 12개가 전부 404였다.)
    window.QA_WRITE_TOOLS = window.QA_WRITE_TOOLS || [
        {
            id: 'gw_approval_tempsave', mode: 'write', verified: 'live', danger: 'low',
            title: '전자결재 기안 임시저장',
            desc: '결재 양식에 값을 채워 **임시저장**한다. 상신(결재요청)은 하지 않는다 — 사람이 내용을 보고 직접 누른다.',
            exec: 'approvalDraft',          // 전용 실행기(기존 /gw/approval/draft 흐름 재사용)
            undoNote: '임시저장함에서 삭제하면 된다(상신 전이라 아무에게도 안 보인다).'
        },
        {
            id: 'gw_asset_reserve', mode: 'write', verified: 'pending', danger: 'medium',
            title: '회의실·차량 예약',
            desc: '자원을 지정 시간에 예약한다.',
            method: 'POST', path: '/gw/asset/reserve',
            params: [
                { name: 'assetId', type: 'int', min: 1, max: 99999, req: true, desc: '자원 id' },
                { name: 'itemId', type: 'int', min: 1, max: 99999, desc: '세부 항목 id(회의실 등)' },
                { name: 'date', type: 'date', req: true, desc: '날짜 YYYY-MM-DD' },
                { name: 'start', type: 'time', req: true, desc: '시작 HH:MM' },
                { name: 'end', type: 'time', req: true, desc: '종료 HH:MM' },
                { name: 'title', type: 'text', max: 60, req: true, desc: '예약 제목' }
            ],
            pendingWhy: '예약 생성 요청 본문(필드 이름)이 미확정입니다. 그룹웨어에서 예약을 한 번만 직접 해 주시면 그때 캡처해 확정합니다.',
            undoNote: '예약 목록에서 삭제할 수 있다(동료에게는 그 전까지 보인다).'
        },
        {
            id: 'gw_calendar_add', mode: 'write', verified: 'pending', danger: 'medium',
            title: '그룹웨어 일정 등록',
            desc: '사내 캘린더에 일정을 추가한다.',
            method: 'POST', path: '/gw/calendar/event',
            params: [
                { name: 'title', type: 'text', max: 80, req: true, desc: '일정 제목' },
                { name: 'date', type: 'date', req: true, desc: '날짜 YYYY-MM-DD' },
                { name: 'start', type: 'time', desc: '시작 HH:MM (생략하면 종일)' },
                { name: 'end', type: 'time', desc: '종료 HH:MM' },
                { name: 'calendarId', type: 'int', min: 1, max: 99999, desc: '캘린더 id' }
            ],
            pendingWhy: '일정 등록 요청 본문이 미확정입니다. 일정을 한 번 직접 등록해 주시면 캡처해 확정합니다.',
            undoNote: '캘린더에서 삭제할 수 있다.'
        },
        {
            id: 'gw_mail_send', mode: 'write', verified: 'pending', danger: 'high',
            title: '그룹웨어 메일 발송',
            desc: '사내 웹메일로 메일을 보낸다.',
            method: 'POST', path: '/gw/mail/send',
            params: [
                { name: 'to', type: 'text', max: 300, req: true, desc: '수신자(쉼표 구분)' },
                { name: 'cc', type: 'text', max: 300, desc: '참조' },
                { name: 'subject', type: 'text', max: 150, req: true, desc: '제목' },
                { name: 'body', type: 'text', max: 8000, req: true, desc: '본문' }
            ],
            // ⚠️ 발송은 되돌릴 수 없다 — 확인 한 번으로 끝내지 않고 문구 입력을 요구한다
            confirmPhrase: '발송',
            pendingWhy: '발송 요청 본문이 미확정입니다. 앱에는 이미 SMTP 발송 기능이 있으니(메일 서버 탭) 그룹웨어 발송이 꼭 필요한지 먼저 정하는 게 좋습니다.',
            undoNote: '없다. 보내면 되돌릴 수 없다.'
        },
        {
            id: 'gw_board_write', mode: 'write', verified: 'pending', danger: 'high',
            title: '게시판 글 등록',
            desc: '사내 게시판에 글을 올린다.',
            method: 'POST', path: '/gw/board/write',
            params: [
                { name: 'boardId', type: 'int', min: 1, max: 99999, req: true, desc: '게시판 id' },
                { name: 'title', type: 'text', max: 150, req: true, desc: '제목' },
                { name: 'body', type: 'text', max: 8000, req: true, desc: '본문' }
            ],
            confirmPhrase: '등록',
            pendingWhy: '글 등록 요청 본문이 미확정입니다. 사내 게시판은 전사 공개라 우선순위를 낮게 뒀습니다.',
            undoNote: '본인 글은 삭제할 수 있지만 그 전까지 전사에 보인다.'
        }
    ];

    // 쓰기 의도 어휘 → 도구. **데이터로 관리**한다(코드 정규식 금지 — CLAUDE.md).
    //  ⚠️ 조회 어휘와 겹치지 않게 **동작 동사**로만 잡는다 —
    //     "예약 현황 보여줘"(조회)와 "회의실 예약해줘"(쓰기)가 갈려야 한다.
    window.GW_WRITE_INTENTS = window.GW_WRITE_INTENTS || [
        { tool: 'gw_asset_reserve',
          kw: ['회의실 예약해', '회의실 잡아', '회의실 예약 해', '차량 예약해', '예약해줘', '예약 해줘',
               '예약 잡아', '회의실 빌려'] },
        { tool: 'gw_calendar_add',
          kw: ['일정 등록해', '일정 추가해', '일정 넣어', '캘린더에 등록', '캘린더에 추가', '일정 잡아'] },
        { tool: 'gw_mail_send',
          kw: ['그룹웨어로 메일 보내', '그룹웨어 메일 보내', '사내 메일 보내', '웹메일 보내'] },
        { tool: 'gw_board_write',
          kw: ['게시판에 올려', '게시판에 글', '게시판 글 등록', '공지 올려'] }
    ];

    window._qaWriteToolById = function (id) {
        return (window.QA_WRITE_TOOLS || []).find(function (t) {
            return t.id === String(id || '').trim();
        }) || null;
    };

    // 시간(HH:MM) 검증 — 읽기 쪽 스키마에 없는 타입이라 여기서 보탠다
    var TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

    function validateWriteArgs(tool, raw) {
        var given = (raw && typeof raw === 'object') ? raw : {};
        // 시간 인자는 먼저 걸러 두고, 나머지는 읽기와 **같은 검증기**를 쓴다(중복 구현 방지)
        var times = {}, notes = [];
        (tool.params || []).forEach(function (p) {
            if (p.type !== 'time') return;
            var v = given[p.name];
            if (v === undefined || v === null || v === '') {
                if (p.req) notes.push('필수 인자 누락: ' + p.name);
                return;
            }
            var s = String(v).trim();
            if (!TIME_RE.test(s)) { notes.push('시간 형식(HH:MM)이 아님: ' + p.name + '=' + s); return; }
            times[p.name] = s.length === 4 ? '0' + s : s;
        });
        var shim = { params: (tool.params || []).filter(function (p) { return p.type !== 'time'; }) };
        var v = window._qaValidateToolArgs(shim, given);
        if (v.error) return { error: v.error };
        var args = v.args || {};
        Object.keys(times).forEach(function (k) { args[k] = times[k]; });
        // 시간 필수 누락은 위에서 notes로 모았으니 여기서 에러로 승격
        var miss = notes.filter(function (n) { return n.indexOf('필수 인자 누락') === 0; });
        if (miss.length) return { error: miss.join(', ') };
        // 시작 < 종료
        if (args.start && args.end && args.start >= args.end) {
            return { error: '종료 시간이 시작 시간보다 빠르거나 같습니다: ' + args.start + ' → ' + args.end };
        }
        return { args: args, notes: (v.notes || []).concat(notes) };
    }

    window._qaValidateWriteArgs = validateWriteArgs;

    // ── 초안 만들기 (실행하지 않는다) ────────────────────────────────
    // AI가 `[[WRITE:id {json}]]`을 내놓거나 코드가 직접 부른다. 결과는 **확인 카드용 초안**.
    window._qaMakeWriteDraft = function (id, rawArgs) {
        var tool = window._qaWriteToolById(id);
        if (!tool) return { ok: false, message: '없는 쓰기 도구입니다: ' + id };
        var v = validateWriteArgs(tool, rawArgs);
        if (v.error) return { ok: false, tool: tool, message: v.error };

        var nonce = 'w' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
        var draft = {
            ok: true, id: tool.id, tool: tool, args: v.args, notes: v.notes || [],
            nonce: nonce, blocked: (tool.verified !== 'live'),
            at: Date.now()
        };
        window._qaPendingWrite = draft;      // 실행기는 이 nonce만 받아들인다
        return draft;
    };

    // 확인 카드에 보여줄 텍스트 — **값을 그대로** 보여준다(요약하지 않는다)
    window._qaWriteDraftText = function (draft) {
        if (!draft || !draft.ok) return '⚠️ ' + ((draft && draft.message) || '초안을 만들지 못했습니다.');
        var t = draft.tool;
        var lines = ['✍️ **' + t.title + '** ' + window._t('초안', 'draft')];
        lines.push('');
        (t.params || []).forEach(function (p) {
            var v = draft.args[p.name];
            if (v === undefined || v === '') return;
            lines.push('- ' + p.name + ': `' + v + '`');
        });
        if (!Object.keys(draft.args).length) lines.push('- (인자 없음)');
        if (draft.notes && draft.notes.length) {
            lines.push('');
            lines.push('⚠️ ' + draft.notes.join(' / '));
        }
        lines.push('');
        if (draft.blocked) {
            lines.push('🚧 ' + window._t('이 기능은 아직 **실행할 수 없습니다**.', 'This action is not executable yet.'));
            lines.push('> ' + (t.pendingWhy || '요청 본문이 미확정입니다.'));
        } else {
            lines.push('되돌리기: ' + (t.undoNote || '정보 없음'));
            if (t.confirmPhrase) {
                lines.push('');
                lines.push('⚠️ ' + window._t('되돌릴 수 없는 작업입니다. 실행하려면 ', 'This cannot be undone. To proceed, type ')
                           + '`' + t.confirmPhrase + '`' + window._t('라고 입력해주세요.', '.'));
            }
        }
        return lines.join('\n');
    };

    // ── 실행 (nonce 필수) ────────────────────────────────────────────
    window._qaExecWriteDraft = async function (nonce, confirmText) {
        var d = window._qaPendingWrite;
        if (!d || !d.ok || d.nonce !== nonce) {
            return { ok: false, message: '확인 대상 초안을 찾지 못했습니다(이미 실행했거나 만료됨).' };
        }
        var t = d.tool;
        window._qaPendingWrite = null;                 // 재실행 방지 — 먼저 비운다
        if (t.verified !== 'live') {
            return { ok: false, id: t.id, message: '아직 실행할 수 없는 기능입니다: ' + (t.pendingWhy || '') };
        }
        if (t.confirmPhrase && String(confirmText || '').trim() !== t.confirmPhrase) {
            return { ok: false, id: t.id,
                     message: '확인 문구가 일치하지 않아 중단했습니다(필요: "' + t.confirmPhrase + '").' };
        }

        var r;
        try {
            if (t.exec === 'approvalDraft') {
                r = { ok: false, message: '이 도구는 기존 기안 흐름(04h)에서 실행합니다.' };
            } else {
                var res = await window._withTimeout(fetch(BACKEND + t.path, {
                    method: t.method || 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(d.args)
                }), 120000, '실행 시간 초과: ' + t.id);
                var j = await res.json();
                r = (j && j.ok !== false)
                    ? { ok: true, id: t.id, args: d.args, data: j }
                    : { ok: false, id: t.id, args: d.args, message: (j && j.message) || ('HTTP ' + res.status) };
            }
        } catch (e) {
            r = { ok: false, id: t.id, args: d.args, message: (e && e.message) ? e.message : String(e) };
        }
        if (window._qaLogToolCall) window._qaLogToolCall('[WRITE] ' + t.id, r);
        return r;
    };

    // AI가 내놓는 쓰기 제안 태그 — 읽기의 `[[TOOL:...]]`과 **구분**한다
    var WRITE_RE = /\[\[\s*WRITE\s*:\s*([A-Za-z0-9_]+)\s*(\{[\s\S]*?\})?\s*\]\]/g;

    window._qaParseWriteCalls = function (text) {
        var out = [], m;
        WRITE_RE.lastIndex = 0;
        while ((m = WRITE_RE.exec(String(text || '')))) {
            var args = {};
            if (m[2]) { try { args = JSON.parse(m[2]); } catch (e) { args = {}; } }
            out.push({ id: m[1], args: args });
            if (out.length >= 1) break;      // 쓰기는 한 턴에 **하나만**
        }
        return out;
    };

    // 프롬프트에 실을 쓰기 도구 설명 — 실행 가능한 것만 보여준다.
    // ⚠️ 'pending'은 AI에게 아예 알려주지 않는다. 제안해도 실행이 막혀 있어
    //    "해준다고 했는데 안 된다"는 경험만 만든다.
    window._qaWriteToolsSpec = function () {
        var usable = (window.QA_WRITE_TOOLS || []).filter(function (t) { return t.verified === 'live'; });
        if (!usable.length) return '';
        return usable.map(function (t) {
            var ps = (t.params || []).map(function (p) {
                return p.name + '(' + p.type + (p.req ? ', 필수' : '') + ') — ' + p.desc;
            });
            return '- `' + t.id + '` : ' + t.title + ' — ' + t.desc
                 + (ps.length ? '\n    인자: ' + ps.join(' / ') : '');
        }).join('\n');
    };

    // 사용자가 "뭘 쓸 수 있나" 물을 때 보여줄 현황(막힌 것도 사유와 함께 정직하게)
    window._qaWriteStatusText = function () {
        var rows = (window.QA_WRITE_TOOLS || []).map(function (t) {
            var mark = t.verified === 'live' ? '✅ 사용 가능' : '🚧 미확정';
            return '- ' + mark + ' **' + t.title + '**'
                 + (t.verified === 'live' ? '' : ' — ' + (t.pendingWhy || ''));
        });
        return rows.join('\n');
    };
})();
