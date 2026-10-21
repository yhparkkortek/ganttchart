# -*- coding: utf-8 -*-
"""✍️ 인사관리(kInsa) 쓰기 — **칸만 채운다. 제출은 하지 않는다.**

왜 모듈을 나눴나
----------------
이 저장소 원칙대로 쓰기는 읽기(gw_bridge 의 insa_* 조회)와 **경로를 분리**한다
(docs/qa-tool-router.md). 조회 쪽 코드가 실수로 제출을 부를 수 없게 하기 위해서다.

지금 범위 (2026-10-21, 사용자 확정)
-----------------------------------
**칸 채우기까지만.** `등록`(#insertBtn)은 **절대 누르지 않는다** — 사람이 화면을 보고
직접 누른다. 근무계획 수정 신청은 결재로 올라가는 되돌리기 어려운 동작이라,
먼저 "제대로 채워지는지"를 눈으로 확인하는 단계를 거친다.
자동 등록(확인 1회 후 자동)은 이 단계가 안정된 뒤에 얹는다.

어떻게 채우나 — 페이지의 자기 기능을 쓴다
------------------------------------------
그리드 셀을 직접 건드리지 않고, 화면에 있는 **일괄입력** 버튼을 그대로 쓴다.
소스(`/workPlanEdit/regForm` 인라인 JS)에서 확인한 것:

    #addMeBtn        → setMulitUserInfo([{userNum,userName,deptName}])  신청자(본인) 행 추가
    #date_from       + #inputAllDateBtn   → 선택된 행의 wdate 설정
    #iStartHour/Min, #iEndHour/Min + #inputAllTimeBtn → 근무시간 설정
    #req_subject, #req_content            → 제목/내용
    #insertBtn       → $.chkInsert()  ← **우리는 부르지 않는다**

이러면 사이트의 검증·형식 변환(wdate 포맷 등)을 그대로 타므로, 우리가 형식을
추측할 필요가 없다.

⚠️⚠️ 이 화면의 두 가지 함정 (2026-10-21 실측, 둘 다 브라우저를 멈춰 세웠다)
---------------------------------------------------------------------------
1. **동기 XHR** — `$.getPlanTime`(regform_inline.js 578행)이 `async:false` 다.
   `#inputAllDateBtn` 은 **체크된 행마다 이걸 한 번씩** 부른다(151행). 동기 XHR 은
   jQuery `timeout:300` 이 **안 먹고**, 서버가 늦으면 렌더러 메인 스레드가 그대로 선다.
   그러면 `Runtime.evaluate` 가 **영영 돌아오지 않는다**(TimeoutError).
   게다가 크롬은 같은 사이트 탭을 한 프로세스에 묶으므로 **인사관리 탭이 전부 얼어붙는다**
   (실측: 조회용 /kInsa 탭까지 같이 죽어 조회 기능도 전부 멈췄다).
   → 그래서 날짜·시간 일괄입력은 `_fire()` 로 **응답을 기다리지 않고** 보내고,
     `_wait_idle()` 로 렌더러가 살아 돌아오는지 폴링한다. 안 돌아오면 **정직하게 실패**로
     보고한다(끝없이 기다리지 않는다). 복구는 그 팝업 창을 닫는 것뿐이다.
2. **alert()** — 이 화면은 안내를 전부 alert 로 띄운다("적용할 신청자를 선택하세요" 등).
   alert 이 뜨면 역시 JS 가 멈춘다. `_eval_with_dialogs` 가 Page 도메인을 켜고 바로 닫되,
   **문구는 모아서 돌려준다** — 그게 보통 실패 사유 그 자체다.
"""
import json
import time

import gw_bridge as gb

REGFORM_PATH = '/workPlanEdit/regForm'

#: 동기 XHR 이 끝나기를 기다려 주는 한계. 넘으면 실패로 보고한다(무한 대기 금지).
IDLE_LIMIT = 30


class RendererBusy(RuntimeError):
    """렌더러 메인 스레드가 막혀 있다 — 동기 XHR 또는 대화상자."""


def _regform_tab():
    return gb._page_for(REGFORM_PATH, gb.INSA_ORIGIN + REGFORM_PATH)


async def _eval_with_dialogs(ws_url, expr, timeout):
    """JS 를 실행하되, 중간에 뜨는 alert/confirm 을 **자동으로 닫는다.**

    닫은 대화상자의 문구는 함께 돌려준다 — 모듈 docstring 의 함정 2 참고.
    """
    import asyncio

    import websockets
    dialogs = []
    async with websockets.connect(ws_url, max_size=80_000_000) as ws:
        await ws.send(json.dumps({'id': 1, 'method': 'Page.enable'}))
        await ws.send(json.dumps({'id': 2, 'method': 'Runtime.evaluate', 'params': {
            'expression': expr, 'returnByValue': True, 'awaitPromise': True}}))
        deadline = time.time() + timeout
        while True:
            left = deadline - time.time()
            if left <= 0:
                raise RendererBusy('응답이 없습니다(동기 XHR 또는 대화상자).')
            try:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=left))
            except asyncio.TimeoutError:
                raise RendererBusy('응답이 없습니다(동기 XHR 또는 대화상자).')
            if msg.get('method') == 'Page.javascriptDialogOpening':
                dialogs.append((msg.get('params') or {}).get('message', ''))
                await ws.send(json.dumps({'id': 99, 'method': 'Page.handleJavaScriptDialog',
                                          'params': {'accept': True}}))
                continue
            if msg.get('id') == 2:
                r = msg.get('result', {})
                if 'exceptionDetails' in r:
                    raise RuntimeError(str(r['exceptionDetails'].get('text'))[:200])
                return r.get('result', {}).get('value'), dialogs


_LAST_DIALOGS = []


def _ev(expr, timeout=10):
    """근무계획 수정 신청서 **팝업 탭**에서 JS 실행 (일반 조회 탭과 다른 창이다)."""
    import asyncio
    t = _regform_tab()
    if not t:
        raise RuntimeError('근무계획 수정 신청서 창을 찾지 못했습니다 — 먼저 그 화면을 열어주세요.')
    val, dialogs = asyncio.new_event_loop().run_until_complete(
        _eval_with_dialogs(t['webSocketDebuggerUrl'], expr, timeout))
    if dialogs:
        _LAST_DIALOGS.extend(dialogs)
    return val


def _wait_idle(limit=IDLE_LIMIT):
    """렌더러가 다시 응답할 때까지 폴링. 돌아오면 True, 한계를 넘으면 False."""
    end = time.time() + limit
    while time.time() < end:
        try:
            if _ev('1', timeout=2) == 1:
                return True
        except RendererBusy:
            continue
        except Exception:
            return False
    return False


def _fire(expr, limit=IDLE_LIMIT):
    """동기 XHR 을 유발할 수 있는 동작(일괄입력 버튼)을 **응답을 기다리지 않고** 보낸다.

    CDP 로 보낸 명령은 소켓을 닫아도 렌더러에서 실행된다. 그래서 짧게 보내 놓고,
    렌더러가 살아 돌아오는지를 따로 확인한다. 돌아오면 True.
    """
    try:
        _ev(expr, timeout=3)
        return True
    except RendererBusy:
        return _wait_idle(limit)


def form_state():
    """지금 폼에 뭐가 들어 있는지 — 채우기 전후 비교용(읽기만)."""
    expr = (
        "(function(){"
        " var g = (typeof myGrid !== 'undefined') ? myGrid : null;"
        " var rows = g ? String(g.getAllRowIds() || '') : '';"
        " var n = rows ? rows.split(',').length : 0;"
        " var cell = function(rid, col){ try { return g.cells(rid, g.getColIndexById(col)).getValue(); }"
        "                                catch(e){ return ''; } };"
        " var out = [];"
        " if (n) { var a = rows.split(','); for (var i=0;i<a.length;i++) {"
        "   out.push({ user: cell(a[i],'userName'), wdate: cell(a[i],'wdate'),"
        "              start: cell(a[i],'workSTime'), end: cell(a[i],'workETime'),"
        "              afS: cell(a[i],'afSHour') + ':' + cell(a[i],'afSMin'),"
        "              afE: cell(a[i],'afEHour') + ':' + cell(a[i],'afEMin'),"
        "              lunch: cell(a[i],'lunchType'), dinner: cell(a[i],'dinnerType'),"
        "              remark: cell(a[i],'remark') }); } }"
        " return { subject: ($('#req_subject').val()||''), content: ($('#req_content').val()||''),"
        "          rowCount: n, rows: out };"
        "})()")
    return _ev(expr)


def _meal_options():
    """식사유형 콤보가 **실제로 가진** 값을 화면에서 읽어 온다.

    코드표를 여기에 박지 않는다(하드코딩 지양 — CLAUDE.md). 실측값은
    `01=식사 / 02=휴게 / 03=근무 / 04=해당없음` 이지만, 바뀌면 화면을 따라간다.
    """
    raw = _ev("(function(){ var o = [];"
              " $('#iMealTypeLunch option').each(function(){"
              "   o.push({ v: this.value, t: $(this).text().trim() }); });"
              " return JSON.stringify(o); })()") or '[]'
    return [o for o in json.loads(raw) if o.get('v')]


def _meal_code(want, opts):
    """'01' 같은 코드도, '식사'·'휴게' 같은 이름도 받는다. 못 알아보면 None."""
    s = str(want or '').strip()
    if not s:
        return None
    for o in opts:
        if s == o['v'] or s == o['t']:
            return o['v']
    for o in opts:                      # '식사유형' 처럼 말을 덧붙인 경우까지
        if o['t'] and o['t'] in s:
            return o['v']
    return None


def _row_ids():
    raw = _ev("(function(){ return (typeof myGrid === 'undefined') ? ''"
              "        : String(myGrid.getAllRowIds() || ''); })()") or ''
    return [r for r in str(raw).split(',') if r]


def _check_only(ids):
    """지정한 행만 체크한다 — **일괄입력은 체크된 행에만 걸리므로** 이게 행 단위 제어의 전부다."""
    return _ev("(function(){ if (typeof myGrid === 'undefined') return false;"
               " var want = %s, ci = myGrid.getColIndexById('ch');"
               " String(myGrid.getAllRowIds()||'').split(',').forEach(function(id){"
               "   if (!id) return;"
               "   try { myGrid.cells(id, ci).setValue(want.indexOf(id) >= 0 ? 1 : 0); } catch(e){} });"
               " return true; })()" % json.dumps([str(i) for i in ids]))


def _row_get(row_id, cols):
    """한 행에서 여러 열을 **한 번에** 읽는다(열마다 왕복하지 않는다)."""
    raw = _ev("(function(){ if (typeof myGrid === 'undefined') return '{}';"
              " var id = %s, out = {};"
              " %s.forEach(function(c){"
              "   try { out[c] = myGrid.cells(id, myGrid.getColIndexById(c)).getValue(); }"
              "   catch(e){ out[c] = ''; } });"
              " return JSON.stringify(out); })()"
              % (json.dumps(str(row_id)), json.dumps(list(cols)))) or '{}'
    return json.loads(raw)


def _normalize_days(days, date, start, end, lunch, dinner, remark):
    """`days` 목록으로 통일한다. 날짜 하나짜리 옛 호출 방식도 그대로 받는다."""
    if days:
        out = []
        for d in days:
            d = dict(d or {})
            out.append({
                'date': d.get('date'), 'start': d.get('start'), 'end': d.get('end'),
                'lunch': d.get('lunch'), 'dinner': d.get('dinner'),
                'remark': d.get('remark') if d.get('remark') is not None else remark,
            })
        return out
    if date or start or end or lunch is not None or dinner is not None or remark is not None:
        return [{'date': date, 'start': start, 'end': end,
                 'lunch': lunch, 'dinner': dinner, 'remark': remark}]
    return []


def fill_workplan_edit(date=None, start=None, end=None, subject=None, content=None, remark=None,
                       lunch=None, dinner=None, days=None):
    """근무계획 수정 신청서의 칸을 채운다. **등록은 누르지 않는다.**

    days  [{date,start,end,lunch,dinner,remark}, ...]
          **최종적으로 이런 행들이 있어야 한다**는 목록이다. 행 수를 여기에 맞춰
          더하거나 지우므로 같은 요청을 두 번 보내도 행이 불어나지 않는다(멱등).
          날짜마다 다른 시간·식사유형을 넣으려면 이쪽을 쓴다.
    date/start/end/lunch/dinner/remark
          날짜 하나짜리 **옛 호출 방식** — days 한 개와 같다.
    subject / content       제목 / 신청 사유 (신청서 전체에 하나씩)

    ⚠️ 한 날짜는 한 행뿐이다 — 같은 날짜를 두 번 주면 사이트가 막는다($.getPlanTimeDupChk).

    반환: {'ok':…, 'before':…, 'after':…, 'steps':[…], 'dialogs':[…]}
    """
    def hhmm(v):
        s = str(v or '').strip()
        if not s:
            return None, None
        if ':' in s:
            h, m = s.split(':', 1)
        else:                       # "22" 처럼 시만 준 경우
            h, m = s, '00'
        return h.zfill(2), m.zfill(2)

    global _LAST_DIALOGS
    _LAST_DIALOGS = []          # 이번 채우기에서 뜬 안내창만 모은다
    try:
        before = form_state()
    except RendererBusy as e:
        return {'ok': False, 'busy': True, 'message':
                f'인사관리 창이 응답하지 않습니다({e}). 근무계획 수정 신청서 창을 닫고 다시 열어주세요.'}
    except Exception as e:
        return {'ok': False, 'message': str(e)}

    steps = []

    def done(msg, ok=False, extra=None):
        out = {'ok': ok, 'steps': steps, 'before': before,
               'dialogs': list(_LAST_DIALOGS), 'message': msg}
        if extra:
            out.update(extra)
        return out

    plan = _normalize_days(days, date, start, end, lunch, dinner, remark)
    if not plan:
        return done('채울 내용이 없습니다 — 근무일자나 시간을 지정해주세요.')

    # ⚠️ 같은 사람·같은 날짜가 두 행이면 사이트가 막는다($.getPlanTimeDupChk) — 날짜는 서로 달라야 한다.
    _seen = []
    for _d in plan:
        _k = str(_d.get('date') or '')
        if _k and _k in _seen:
            return done(f'같은 날짜({_k})가 두 번 들어왔습니다 — 이 화면은 한 날짜당 한 행만 받습니다.')
        _seen.append(_k)

    # 🐛 [2026-10-21] 근무일자 일괄입력은 그 행의 식사유형을 **지운다**(소스 156~157행).
    #    그래서 "21·22일 식사로" 해 두고 다음 요청에서 식사유형을 안 주면, 날짜를 다시 넣는
    #    순간 **앞서 설정한 식사유형이 조용히 사라진다**(대화로 조금씩 고쳐 나갈 때 바로 터진다).
    #    `days` 는 "최종 상태"지만 **말하지 않은 칸은 그대로 둔다**가 사람의 기대다 —
    #    같은 날짜의 직전 값을 물려준다.
    _prev = {}
    for _r in (before.get('rows') or []):
        _k = str(_r.get('wdate') or '')[:10]
        if _k:
            _prev[_k] = {'lunch': _r.get('lunch') or '', 'dinner': _r.get('dinner') or ''}
    for _d in plan:
        _p = _prev.get(str(_d.get('date') or '')[:10])
        if not _p:
            continue
        for _key in ('lunch', 'dinner'):
            if _d.get(_key) is None and _p.get(_key):
                _d[_key] = _p[_key]
                _d.setdefault('_kept', []).append(_key)

    # 1) 행 수를 신청할 **날짜 수**에 맞춘다(모자라면 본인신청으로 더하고, 남으면 지운다).
    #    `days` 는 "최종적으로 이런 행들이 있어야 한다"는 목록이다 — 그래서 같은 요청을
    #    두 번 보내도 행이 불어나지 않는다(멱등).
    ids = _row_ids()
    while len(ids) < len(plan):
        if not _fire("(function(){ $('#addMeBtn').click(); return true; })()"):
            return done('신청자 행 추가 중에 창이 멈췄습니다 — 창을 닫고 다시 열어주세요.',
                        extra={'busy': True})
        time.sleep(1.0)
        grown = _row_ids()
        if len(grown) <= len(ids):
            return done('신청자 행이 늘지 않았습니다 — 화면을 확인해주세요.')
        ids = grown
        steps.append('본인신청(행 추가)')
    if len(ids) > len(plan):
        drop = ids[len(plan):]
        _check_only(drop)          # 지우기도 **체크된 행** 기준이다($.deleteGridRow)
        _fire("(function(){ $('#deleteGridRow').click(); return true; })()")
        time.sleep(0.8)
        ids = _row_ids()
        steps.append(f'남는 행 {len(drop)}개 삭제')

    meal_opts = None

    # 2) 행마다 채운다 — **그 행만 체크**한 뒤 화면의 일괄입력 버튼을 누른다.
    #    일괄입력은 체크된 행에만 걸리므로, 이게 날짜별로 다른 값을 넣는 유일한 방법이다.
    for idx, d in enumerate(plan):
        if idx >= len(ids):
            break
        rid = ids[idx]
        tag = str(d.get('date') or '') or f'{idx + 1}번째 행'
        _check_only([rid])

        # 2-a) 근무일자 — ⚠️ 동기 XHR(getPlanTime). 기다리지 않고 보내고 폴링한다.
        if d.get('date'):
            if not _fire("(function(){ $('#date_from').val(%s); $('#inputAllDateBtn').click(); return true; })()"
                         % json.dumps(str(d['date']))):
                return done(f'근무일자({d["date"]}) 조회가 응답하지 않아 창이 멈췄습니다. '
                            '인사관리 서버가 늦을 때 생기는 현상입니다 — 신청서 창을 닫고 다시 열어주세요.',
                            extra={'busy': True})
            time.sleep(1.0)
            steps.append(f'[{tag}] 근무일자')

        # 2-b) 근무시간 — 한쪽만 주면 사이트가 거부하므로 안 준 쪽은 **그 행의** 기존 계획으로.
        sh, sm = hhmm(d.get('start'))
        eh, em = hhmm(d.get('end'))
        if (sh and not eh) or (eh and not sh):
            cur = _row_get(rid, ['beSTime', 'beETime'])
            if not sh and cur.get('beSTime'):
                sh, sm = hhmm(cur['beSTime'])
                steps.append(f'[{tag}] 출근은 기존 계획 {sh}:{sm} 유지')
            if not eh and cur.get('beETime'):
                eh, em = hhmm(cur['beETime'])
                steps.append(f'[{tag}] 퇴근은 기존 계획 {eh}:{em} 유지')
        # 분은 00/30 만 받는다(콤보 옵션 실측) — 그 사이 값은 내림하고 사실을 알린다.
        for _lbl, _mm in (('출근', sm), ('퇴근', em)):
            if _mm and _mm not in ('00', '30'):
                steps.append(f'[{tag}] {_lbl} 분 {_mm} → ' + ('30' if int(_mm) >= 30 else '00')
                             + ' (이 화면은 00/30 만 받습니다)')
        if sm and sm not in ('00', '30'):
            sm = '30' if int(sm) >= 30 else '00'
        if em and em not in ('00', '30'):
            em = '30' if int(em) >= 30 else '00'
        if sh or eh:
            parts = []
            if sh:
                parts.append("$('#iStartHour').val(%s); $('#iStartMin').val(%s);"
                             % (json.dumps(sh), json.dumps(sm)))
            if eh:
                parts.append("$('#iEndHour').val(%s); $('#iEndMin').val(%s);"
                             % (json.dumps(eh), json.dumps(em)))
            if not _fire("(function(){ %s $('#inputAllTimeBtn').click(); return true; })()" % ' '.join(parts)):
                return done(f'[{tag}] 근무시간 입력 중에 창이 멈췄습니다 — 창을 닫고 다시 열어주세요.',
                            extra={'busy': True})
            time.sleep(1.0)
            steps.append(f'[{tag}] 근무시간 ' + (f'{sh}:{sm}' if sh else '…')
                         + ' ~ ' + (f'{eh}:{em}' if eh else '…'))

        # 2-c) 식사유형 — ⚠️ 반드시 날짜·시간 **뒤에.**
        #    · 근무일자 일괄입력이 lunchType/dinnerType 을 **지운다**(소스 156~157행).
        #    · 이 버튼은 날짜와 afS/afE 가 다 차 있어야 돌아간다("근무일자 및 시간을 선택하세요").
        #    · 점심·저녁 **둘 다** 골라야 한다 — 한쪽만 비면 거부한다(소스 233~241행).
        if d.get('lunch') is not None or d.get('dinner') is not None:
            if meal_opts is None:
                meal_opts = _meal_options()
            if not meal_opts:
                return done('식사유형 선택값을 읽지 못했습니다.')
            names = ', '.join(o['v'] + '=' + o['t'] for o in meal_opts)
            cur = _row_get(rid, ['o_lunch', 'o_dinner'])
            lc = _meal_code(d['lunch'], meal_opts) if d.get('lunch') is not None else (cur.get('o_lunch') or None)
            dc = _meal_code(d['dinner'], meal_opts) if d.get('dinner') is not None else (cur.get('o_dinner') or None)
            if d.get('lunch') is not None and not lc:
                return done(f'[{tag}] 식사유형(점심) "{d["lunch"]}" 를 알아볼 수 없습니다. 가능한 값: {names}')
            if d.get('dinner') is not None and not dc:
                return done(f'[{tag}] 식사유형(저녁) "{d["dinner"]}" 를 알아볼 수 없습니다. 가능한 값: {names}')
            if not lc or not dc:
                return done(f'[{tag}] 이 화면은 식사유형 점심·저녁을 **둘 다** 받아야 적용합니다. '
                            f'한쪽만 주셨고 기존값도 비어 있습니다. 가능한 값: {names}')
            kept = d.get('_kept') or []
            if 'lunch' in kept:
                steps.append(f'[{tag}] 점심은 앞서 넣은 값 유지')
            elif d.get('lunch') is None:
                steps.append(f'[{tag}] 점심은 기존값 유지')
            if 'dinner' in kept:
                steps.append(f'[{tag}] 저녁은 앞서 넣은 값 유지')
            elif d.get('dinner') is None:
                steps.append(f'[{tag}] 저녁은 기존값 유지')
            if not _fire("(function(){ $('#iMealTypeLunch').val(%s); $('#iMealTypeDinner').val(%s);"
                         " $('#inputAllMealBtn').click(); return true; })()"
                         % (json.dumps(lc), json.dumps(dc))):
                return done(f'[{tag}] 식사유형 입력 중에 창이 멈췄습니다 — 창을 닫고 다시 열어주세요.',
                            extra={'busy': True})
            time.sleep(1.0)
            _lbl = {o['v']: o['t'] for o in meal_opts}
            steps.append(f'[{tag}] 식사유형 점심 {_lbl.get(lc, lc)} / 저녁 {_lbl.get(dc, dc)}')

        # 2-d) 비고 — 그 행에만
        if d.get('remark') is not None:
            _ev("(function(){ if (typeof myGrid === 'undefined') return false;"
                " try { myGrid.cells(%s, myGrid.getColIndexById('remark')).setValue(%s); } catch(e){}"
                " return true; })()" % (json.dumps(str(rid)), json.dumps(str(d['remark']))))
            steps.append(f'[{tag}] 비고')

    _check_only(ids)      # 끝나면 전부 체크해 둔다 — 사람이 보기에 자연스럽게

    # 3) 제목 / 사유 — 신청서 전체에 하나씩
    if subject is not None:
        _ev("(function(){ $('#req_subject').val(%s); return true; })()" % json.dumps(str(subject)))
        steps.append('제목')
    if content is not None:
        _ev("(function(){ $('#req_content').val(%s); return true; })()" % json.dumps(str(content)))
        steps.append('사유')

    try:
        after = form_state()
    except Exception as e:
        return done(f'채우기 뒤 상태를 읽지 못했습니다: {e}')

    msg = ('칸을 채웠습니다 — 화면에서 확인한 뒤 **직접 [등록]을 눌러주세요.** '
           '(이 기능은 등록을 누르지 않습니다)')
    if _LAST_DIALOGS:
        # 사이트가 띄운 안내창은 숨기지 않는다 — 보통 "그대로 등록하면 안 된다"는 뜻이다.
        msg += '\n⚠️ 화면이 알린 내용: ' + ' / '.join(_LAST_DIALOGS)
    out = done(msg, ok=True)
    out['after'] = after
    return out


# ── 신청서 창 열기 ────────────────────────────────────────────────────────────
# `/workPlanEdit/regForm` 은 **POST 전용**이다(GET 하면 Tomcat 405). 사이트는 이 화면을
# window.open 팝업으로 띄우는데, CDP 로 띄운 window.open 은 **팝업 차단**에 막힌다
# (실측: window.open 이 null 을 돌려줬다).
# → 그래서 새 **탭**을 kInsa(GET, 쿠키 붙는 같은 출처)로 띄우고, 그 탭 안에서 form 을
#   만들어 POST 한다. 자기 탭을 이동시키는 폼 전송이라 팝업 차단과 무관하고,
#   같은 출처라 세션 쿠키(SameSite=Lax)도 그대로 간다.

def open_regform(timeout=25):
    """근무계획 수정 신청서를 **새 탭**에 연다. 이미 열려 있으면 그걸 쓴다."""
    import asyncio

    import requests
    try:
        if _ev("(!!document.getElementById('addMeBtn'))", timeout=4):
            return {'ok': True, 'opened': False, 'message': '이미 열려 있는 신청서 창을 씁니다.'}
    except Exception:
        pass

    # 405 에러 페이지가 남아 있으면 치운다 — 안 치우면 조회 경로까지 이 탭을 집는다.
    for t in requests.get(gb.CDP_BASE + '/json/list', timeout=5).json():
        if t.get('type') == 'page' and REGFORM_PATH in (t.get('url') or ''):
            requests.get(gb.CDP_BASE + '/json/close/' + t['id'], timeout=10)

    tab = requests.put(gb.CDP_BASE + '/json/new?' + gb.INSA_ORIGIN + '/kInsa', timeout=15).json()
    ws = tab['webSocketDebuggerUrl']
    end = time.time() + timeout
    while time.time() < end:                      # kInsa 가 뜨기를 기다린다
        try:
            if asyncio.new_event_loop().run_until_complete(
                    _eval_with_dialogs(ws, "document.readyState === 'complete'", 3))[0]:
                break
        except Exception:
            pass
        time.sleep(1)

    asyncio.new_event_loop().run_until_complete(_eval_with_dialogs(ws, (
        "(function(){ var f = document.createElement('form');"
        " f.method = 'POST'; f.action = %s;"
        " document.body.appendChild(f); f.submit(); return true; })()"
        % json.dumps(REGFORM_PATH)), 10))

    end = time.time() + timeout
    while time.time() < end:                      # 폼이 뜨기를 기다린다
        time.sleep(1)
        try:
            if _ev("(!!document.getElementById('addMeBtn'))", timeout=3):
                return {'ok': True, 'opened': True, 'message': '신청서 창을 새로 열었습니다.'}
        except Exception:
            pass
    return {'ok': False, 'message': '신청서 창을 열지 못했습니다(로그인이 끊겼을 수 있습니다).'}
