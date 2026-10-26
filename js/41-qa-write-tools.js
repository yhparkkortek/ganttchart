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
            id: 'gw_approval_compose', mode: 'write', verified: 'live', danger: 'low',
            title: '기안 작성 (기존 기안 틀 + 지금 프로젝트 값)',
            desc: '기존 기안을 **틀로만** 쓰고, 값은 **지금 열린 프로젝트**(프로젝트코드·고객사·Customer SPEC 등)에서 채워 새 기안을 만든다. '
                + '"RD3-2610-050 참고해서 이번 프로젝트로 기안 써줘" 같은 요청이 이것이다. '
                + '원본 값을 **그대로** 복사하는 것은 gw_approval_copy 이고, 이 도구는 **지금 프로젝트에 맞게 바꿔** 채운다. '
                + '칸마다 값이 어디서 왔는지 보여주는 확인 화면이 뜨고, 사람이 승인해야 임시저장된다. 상신은 하지 않는다.',
            exec: 'approvalCompose',
            params: [
                { name: 'docNum', type: 'text', max: 30, req: true, desc: '틀로 쓸 기존 문서번호 (예: RD3-2610-050)' }
            ],
            undoNote: '임시저장함에서 삭제하면 된다(상신 전이라 아무에게도 안 보인다).'
        },
        {
            id: 'gw_approval_copy', mode: 'write', verified: 'live', danger: 'low',
            title: '기안 복사 (같은 내용으로 새 기안)',
            desc: '문서번호를 주면 그 문서를 읽어 **같은 양식의 새 기안에 똑같이 채워 임시저장**한다. '
                + '상신은 하지 않는다 — 사람이 열어서 필요한 곳만 고치고 직접 올린다. '
                + '⚠️ 첨부파일은 가져오지 않는다(몇 건이었는지만 알려준다). '
                + '결재선은 새 기안의 기본값을 쓰고, 원본 결재선을 같이 보여주니 다르면 사람이 고친다. '
                + 'subject/fields 를 같이 주면 그 값이 원본을 덮는다.',
            method: 'POST', path: '/gw/approval/copy',
            params: [
                { name: 'docNum', type: 'text', max: 30, req: true, desc: '복사할 원본 문서번호 (예: RD3-2610-050)' },
                { name: 'subject', type: 'text', max: 200, desc: '새 기안 제목 — 비우면 원본 제목 그대로' }
            ],
            undoNote: '임시저장함에서 삭제하면 된다(상신 전이라 아무에게도 안 보인다).'
        },
        {
            id: 'gw_asset_reserve', mode: 'write', verified: 'live', danger: 'medium',
            title: '회의실·차량 예약',
            desc: '자원을 지정 시간에 예약한다. **반드시 먼저 `gw_asset_reservations`로 그날 현황을 조회해 '
                + '비어 있는 시간을 확인한 뒤** 초안을 내라. itemId를 모르면 `gw_asset_items`로 찾는다.',
            method: 'POST', path: '/gw/asset/reserve',
            params: [
                { name: 'assetId', type: 'int', min: 1, max: 99999, req: true, desc: '자원 id (gw_asset_list로 확인)' },
                { name: 'itemId', type: 'int', min: 1, max: 99999, req: true, desc: '세부 항목 id — 회의실 각 방/차량 각 대 (gw_asset_items로 확인)' },
                { name: 'date', type: 'date', req: true, desc: '날짜 YYYY-MM-DD' },
                { name: 'start', type: 'time', req: true, desc: '시작 HH:MM' },
                { name: 'end', type: 'time', req: true, desc: '종료 HH:MM' },
                { name: 'purpose', type: 'text', max: 80, req: true, desc: '목적(Purpose)' },
                // ⚠️ 비우면 그룹웨어 화면이 **조용히** 막는다(오류도 요청도 없음) — 실측 확인
                { name: 'attendee', type: 'text', max: 80, req: true, desc: '참석자(Attendee) — 필수. 모르면 지어내지 말고 사용자에게 물어라' }
            ],
            undoNote: '`gw_asset_cancel`로 바로 취소할 수 있다(그 전까지는 동료에게 보인다).'
        },
        {
            id: 'gw_asset_cancel', mode: 'write', verified: 'live', danger: 'low',
            title: '예약 취소',
            desc: '내가 만든 예약을 취소한다. 예약 id는 `gw_asset_reservations` 결과의 id.',
            method: 'POST', path: '/gw/asset/cancel',
            params: [
                { name: 'id', type: 'int', min: 1, max: 99999999, req: true, desc: '취소할 예약 id' }
            ],
            undoNote: '취소하면 되돌릴 수 없다(다시 예약해야 한다).'
        },
        {
            id: 'gw_calendar_add', mode: 'write', verified: 'live', danger: 'medium',
            title: '그룹웨어 일정 등록',
            desc: '사내 캘린더에 일정을 추가한다. start를 생략하면 종일 일정이 된다. '
                + '참석자는 나 자신만 들어간다(다른 사람 추가는 아직 지원 안 함 — 필요하면 등록 후 그룹웨어에서 직접 추가). '
                + 'calendarId를 모르면 생략 — 내 기본 캘린더로 들어간다.',
            method: 'POST', path: '/gw/calendar/event',
            params: [
                { name: 'title', type: 'text', max: 80, req: true, desc: '일정 제목' },
                { name: 'date', type: 'date', req: true, desc: '날짜 YYYY-MM-DD' },
                { name: 'start', type: 'time', desc: '시작 HH:MM (생략하면 종일)' },
                { name: 'end', type: 'time', desc: '종료 HH:MM (start 있으면 필수)' },
                { name: 'location', type: 'text', max: 80, desc: '장소' },
                { name: 'calendarId', type: 'int', min: 1, max: 99999, desc: '캘린더 id (생략하면 내 기본 캘린더)' }
            ],
            undoNote: '캘린더에서 삭제할 수 있다(gw_calendar_delete, eventId는 응답에 들어있다).'
        },
        {
            id: 'gw_calendar_delete', mode: 'write', verified: 'live', danger: 'medium',
            title: '그룹웨어 일정 삭제',
            desc: '캘린더 일정을 삭제한다. **되돌릴 수 없다.** eventId/calendarId는 gw_calendar_add 응답이나 '
                + 'gw_calendar(읽기) 조회 결과 각 줄의 `id:`/`calId:` 값을 **그대로 베껴 쓴다** — '
                + '목록의 순번(1., 2., …)이 아니다. 지울 대상이 여러 건이면 사람에게 어느 것인지 먼저 확인한다.',
            method: 'POST', path: '/gw/calendar/event/delete',
            params: [
                { name: 'calendarId', type: 'int', min: 1, max: 99999, req: true, desc: '캘린더 id' },
                { name: 'eventId', type: 'int', min: 1, max: 999999999, req: true, desc: '삭제할 일정 id' }
            ],
            undoNote: '없다. 삭제하면 되돌릴 수 없다.'
        },
        {
            id: 'gw_mail_send', mode: 'write', verified: 'live', danger: 'high',
            title: '그룹웨어 메일 발송',
            desc: '그룹웨어 로그인 세션으로 사내 웹메일을 보낸다(SMTP/POP3 설정과 무관 — Gantt 앱의 '
                + '기존 메일 발송과는 별개 경로). 서명은 자동으로 안 붙는다. to/cc/bcc는 이메일 주소만 '
                + '쉼표로 구분(이름 없이도 된다).',
            method: 'POST', path: '/gw/mail/send',
            params: [
                { name: 'to', type: 'text', max: 300, req: true, desc: '수신자(쉼표 구분)' },
                { name: 'cc', type: 'text', max: 300, desc: '참조' },
                { name: 'subject', type: 'text', max: 150, req: true, desc: '제목' },
                { name: 'body', type: 'text', max: 8000, req: true, desc: '본문(일반 텍스트)' }
            ],
            // ⚠️ 발송은 되돌릴 수 없다 — 확인 한 번으로 끝내지 않고 문구 입력을 요구한다
            confirmPhrase: '발송',
            undoNote: '없다. 보내면 되돌릴 수 없다.'
        },
        {
            id: 'gw_board_write', mode: 'write', verified: 'live', danger: 'high',
            title: '게시판 글 등록',
            desc: '사내 게시판에 글을 올린다 — **올리는 즉시 그 게시판을 보는 전사/부서원에게 공개된다.** '
                + '⚠️ 제목 칸이 따로 없다 — body(=content) 첫 줄이 목록에서 제목처럼 보인다. '
                + 'boardId를 모르면 gw_board_list(읽기)로 찾는다. 사람이 게시판을 명시하지 않으면 '
                + '추측해서 전사 게시판에 올리지 말고 반드시 물어라.',
            method: 'POST', path: '/gw/board/write',
            params: [
                { name: 'boardId', type: 'int', min: 1, max: 99999, req: true, desc: '게시판 id (gw_boards로 확인)' },
                { name: 'body', type: 'text', max: 8000, req: true, desc: '본문(첫 줄이 제목처럼 보임)' }
            ],
            confirmPhrase: '등록',
            undoNote: '본인 글은 gw_board_delete로 삭제할 수 있지만, 그 전까지는 전사/부서원에게 보인다.'
        },
        {
            id: 'gw_board_delete', mode: 'write', verified: 'live', danger: 'medium',
            title: '게시판 글 삭제',
            desc: '게시판 글을 삭제한다. **되돌릴 수 없다.** postId/boardId는 gw_board_write 응답이나 '
                + 'gw_board(읽기) 조회 결과의 id:/boardId: 값을 그대로 쓴다 — 추측 금지.',
            method: 'POST', path: '/gw/board/delete',
            params: [
                { name: 'boardId', type: 'int', min: 1, max: 99999, req: true, desc: '게시판 id' },
                { name: 'postId', type: 'int', min: 1, max: 999999999, req: true, desc: '삭제할 글 id' }
            ],
            undoNote: '없다. 삭제하면 되돌릴 수 없다.'
        },
        {
            id: 'insa_fill_workplan', mode: 'write', verified: 'live', danger: 'low', requires: 'insa',
            title: '근무계획 수정 신청서 칸 채우기',
            desc: '인사관리 근무계획 수정 신청서를 열어 **칸만 채운다. [등록]은 누르지 않는다** — '
                + '사람이 화면을 보고 직접 누른다. '
                + '[여러 날이면 days] days 는 **최종적으로 이런 행들이 있어야 한다**는 목록이다 — '
                + '행 수를 여기에 맞춰 더하거나 지우므로, 하루 더 넣으려면 **기존 행까지 전부** 담아야 한다'
                + '(새 행만 보내면 기존 행이 지워진다). 기존 행은 `insa_workplan_form` 으로 먼저 읽어라. '
                + '한 날짜는 한 행뿐이다(같은 날짜를 두 번 주면 사이트가 막는다). '
                + '[시간] 변경 **후** 시간이고, 한쪽만 주면 다른 쪽은 그 날의 기존 계획시간을 유지한다. '
                + '분은 00/30만 받는다. '
                + '[식사유형] 화면이 점심·저녁 **둘 다** 요구하므로 한쪽만 주면 다른 쪽은 기존값을 유지한다. '
                + '사용자가 말하지 않은 식사유형·시간을 지어내지 마라.',
            method: 'POST', path: '/insa/fill-workplan',
            params: [
                { name: 'days', type: 'rows', max: 31,
                  desc: '여러 날: [{date:"YYYY-MM-DD", start:"HH:MM", end:"HH:MM", lunch:"식사", dinner:"식사", remark:""}, ...] '
                      + '— **최종 상태** 목록(기존 행 포함). 하루뿐이면 아래 date/end 를 써도 된다' },
                { name: 'date', type: 'date', desc: '근무일자 YYYY-MM-DD (하루짜리일 때. days 를 주면 생략)' },
                { name: 'start', type: 'time', desc: '변경 후 출근 HH:MM (생략하면 기존 계획 유지)' },
                { name: 'end', type: 'time', desc: '변경 후 퇴근 HH:MM (생략하면 기존 계획 유지)' },
                // 코드·이름 둘 다 받는다(화면 콤보에서 실제 값을 읽어 맞춘다 — 백엔드에서 처리)
                { name: 'lunch', type: 'text', max: 10, desc: '식사유형(점심): 식사·휴게·근무·해당없음' },
                { name: 'dinner', type: 'text', max: 10, desc: '식사유형(저녁): 식사·휴게·근무·해당없음' },
                { name: 'subject', type: 'text', max: 100, desc: '제목' },
                { name: 'content', type: 'text', max: 2000, desc: '신청 사유' },
                { name: 'remark', type: 'text', max: 200, desc: '비고' }
            ],
            undoNote: '등록을 누르기 전이라 아무에게도 안 간다 — 창을 닫거나 칸을 고치면 끝이다.'
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
        { tool: 'gw_calendar_delete',
          kw: ['일정 삭제해', '일정 지워', '캘린더에서 삭제', '캘린더에서 지워', '일정 취소해'] },
        { tool: 'gw_mail_send',
          kw: ['그룹웨어로 메일 보내', '그룹웨어 메일 보내', '사내 메일 보내', '웹메일 보내'] },
        { tool: 'gw_board_write',
          kw: ['게시판에 올려', '게시판에 글', '게시판 글 등록', '공지 올려'] },
        { tool: 'gw_board_delete',
          kw: ['게시판 글 삭제', '게시판에서 삭제', '게시글 삭제해', '게시판 글 지워'] },
        // 인사관리 — "조회"와 갈리도록 **바꿔달라/신청해달라**는 동작 동사만 잡는다
        { tool: 'insa_fill_workplan',
          kw: ['근무계획 수정 신청', '근무시간 변경해', '퇴근시간 변경해', '출근시간 변경해',
               '퇴근 시간을', '근무계획 수정해', '근무시간 수정해', '근무계획 바꿔'] }
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
        // 🐛 [2026-10-21 실사용 버그수정] 시간 인자를 **뺀 스키마**에 **원본 인자 전부**를 넘기고 있었다 —
        //    읽기 검증기는 스키마에 없는 키를 "무시된 인자"로 적으므로, 멀쩡히 적용된 end 를 두고
        //    "⚠️ 무시된 인자: end"가 초안에 붙었다(값은 아래에서 다시 합쳐지니 동작은 정상, 안내만 틀림).
        //    스키마에서 뺀 키는 넘기는 값에서도 빼야 짝이 맞는다. 진짜 모르는 키는 그대로 걸린다.
        // 🧩 [2026-10-21] `rows` 타입 — 행 목록(날짜마다 한 줄)처럼 **객체 배열**을 받는 인자.
        //    읽기 검증기는 스칼라만 다루므로 여기서 따로 본다. AI가 JSON 문자열로 줄 때도 받아준다.
        var rows = {};
        (tool.params || []).forEach(function (p) {
            if (p.type !== 'rows') return;
            var raw2 = given[p.name];
            if (raw2 === undefined || raw2 === null || raw2 === '') {
                if (p.req) notes.push('필수 인자 누락: ' + p.name);
                return;
            }
            if (typeof raw2 === 'string') {
                try { raw2 = JSON.parse(raw2); } catch (e) { notes.push('목록 형식이 아님: ' + p.name); return; }
            }
            if (!Array.isArray(raw2) || !raw2.length) { notes.push('목록 형식이 아님: ' + p.name); return; }
            if (raw2.length > (p.max || 30)) { notes.push(p.name + ' 가 너무 깁니다(최대 ' + (p.max || 30) + '개)'); return; }
            var bad = raw2.filter(function (r) { return !r || typeof r !== 'object' || Array.isArray(r); });
            if (bad.length) { notes.push(p.name + ' 의 각 항목은 객체여야 합니다'); return; }
            rows[p.name] = raw2;
        });
        var special = function (p) { return p.type === 'time' || p.type === 'rows'; };
        var shim = { params: (tool.params || []).filter(function (p) { return !special(p); }) };
        var rest = {};
        Object.keys(given).forEach(function (k) {
            var isSpecial = (tool.params || []).some(function (p) { return p.name === k && special(p); });
            if (!isSpecial) rest[k] = given[k];
        });
        var v = window._qaValidateToolArgs(shim, rest);
        if (v.error) return { error: v.error };
        var args = v.args || {};
        Object.keys(times).forEach(function (k) { args[k] = times[k]; });
        Object.keys(rows).forEach(function (k) { args[k] = rows[k]; });
        // 시간 필수 누락은 위에서 notes로 모았으니 여기서 에러로 승격
        var miss = notes.filter(function (n) { return n.indexOf('필수 인자 누락') === 0; });
        if (miss.length) return { error: miss.join(', ') };
        // ⚠️ 형식 오류로 **빠져버린** 필수 시간도 에러다 — 조용히 통과시키면
        //    사용자가 말한 것과 다른 시간으로 예약될 수 있다.
        var badTime = (tool.params || []).filter(function (p) {
            return p.type === 'time' && p.req && args[p.name] === undefined;
        }).map(function (p) { return p.name; });
        if (badTime.length) {
            return { error: '시간 형식(HH:MM)이 아닙니다: ' + badTime.join(', ')
                            + ' — 예: 14:00' };
        }
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
        // 로그인 선검사 — 읽기(js/40)와 같은 게이트를 쓴다. 끊겨 있으면 저장된 계정으로
        // **1회만** 자동 로그인한다(재시도 금지 가드는 게이트 안에 있다 — CLAUDE.md).
        var gate = (t.requires === 'insa') ? window._insaEnsureLogin
                 : (t.requires === 'gw') ? window._gwEnsureLogin : null;
        if (gate) {
            var g = await gate();
            if (!g || g.ok === false) {
                return { ok: false, id: t.id,
                         message: (g && g.message) || '로그인이 되어 있지 않아 중단했습니다.' };
            }
        }

        var r;
        try {
            if (t.exec === 'approvalDraft') {
                r = { ok: false, message: '이 도구는 기존 기안 흐름(04h)에서 실행합니다.' };
            } else if (t.exec === 'approvalCompose') {
                // ⚠️ 여기서 바로 쓰지 않는다 — **칸마다 출처를 보여주는 확인 화면**을 열고,
                //    사람이 눌러야 임시저장된다(js/46). 값이 틀린 채 결재선을 타고 올라가는 게 제일 위험하다.
                if (!window.apvComposeFrom) {
                    r = { ok: false, message: '기안 작성 기능을 불러오지 못했습니다(js/46).' };
                } else {
                    window.apvComposeFrom((d.args || {}).docNum);
                    r = { ok: true, id: t.id, args: d.args,
                          data: { opened: true, message: '확인 화면을 열었습니다 — 칸을 확인하고 [이대로 임시저장]을 누르세요.' } };
                }
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
