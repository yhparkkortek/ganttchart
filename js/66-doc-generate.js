// 📄 [2026-11-09 신규] Document — 프로젝트 문서를 **앱 데이터로** 만들어 NAS 에 올린다
//
//   사용자 요청: "Document 페이지를 신설해서 UI 기본 컨셉을 Parts 처럼 여러 문서를 선택해서
//               해당 프로젝트 정보를 손쉽게 작성했으면 좋겠음"
//
//  ■ 왜 이렇게 만드나 (실측 근거)
//    NAS `개발자료실/DOCUMENT` 21개 파일 + 그룹웨어 전자결재 45건을 전수로 훑어 보니, 사람이
//    문서마다 **같은 값을 다시 적고 있었다** — 프로젝트코드·제품코드·모델명·BUYER·담당자·
//    광학사양·주요자재 5종이 15개 문서에 되풀이된다. 그리고 그 값들은 이미 앱 Summary 탭에 있다:
//      · 마일스톤 9단계(계획/실적)      → DR·DVR 발표자료 "PROJECT SCHEDULE" 슬라이드 그대로
//      · 프로젝트 개요(목적·수요량·양산) → DR 발표자료 3쪽 "프로젝트 개요" 그대로
//      · 프로젝트 멤버 10역할 + 멤버-3   → DVR 발표자료 3쪽 조직도 표 그대로
//      · Customer SPEC                → "SPECIFICATION" 슬라이드 그대로
//      · 주요 자재(고정 구분)           → 시제품 제작의뢰서·Sample Report·모델명세서의 그 표
//
//  ■ 설계 원칙 (CLAUDE.md)
//    · **AI 를 안 쓴다.** 전부 결정론 — 앱에 있는 값을 옮겨 적는 일이다.
//    · 문서 종류는 **데이터**(`DOC_GEN_SPECS`) — 새 문서는 항목 하나 추가.
//    · **빈 칸을 숨기지 않는다.** 만들기 전에 "무엇이 비어 있는지"를 먼저 보여준다 —
//      조용히 '-' 로 채워 내보내면 사람이 그걸 모르고 고객에게 보낸다.
//    · 사람 승인 뒤에만 올린다. 같은 이름이 있으면 **덮어쓰기를 따로 확인**한다(팀 공유).
//
//  ■ 정직하게
//    만드는 것은 **초안**이다. 사내 발표자료의 디자인(도면·사진·블록도)을 재현하지 않는다 —
//    되풀이되는 **값**을 채워 주고, 꾸미기는 사람이 한다. 그게 실제로 시간을 먹던 부분이다.
(function () {
    'use strict';

    var BACKEND = 'http://127.0.0.1:5000';
    var _t = function (ko, en) { return (window._currentLang === 'en') ? en : ko; };
    var _esc = function (s) { return window.escapeHtml ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); };
    var _toast = function (m, k) { if (window.showToast) window.showToast(m, k || 'info'); };
    var _val = function (id) { var e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; };

    // ── 📚 문서 종류 카탈로그 (데이터) ─────────────────────────────────
    //   id        : 내부 식별자
    //   label     : 화면에 보이는 이름
    //   kind      : 'pptx' | 'xlsx'  (만드는 방식)
    //   folder    : NAS 폴더(백엔드 `DOCSTORE_APP_FOLDERS` 에 있어야 한다)
    //   needs     : 이 문서가 쓰는 앱 데이터 — 미리보기가 "무엇이 비었나"를 이걸로 센다
    //   nameOf    : 파일 이름을 만드는 함수(실측 이름 규칙을 따른다)
    //   build     : 실제 생성. ctx(수집한 사실)와 라이브러리를 받는다.
    //   note      : 사람에게 미리 알릴 것
    window.DOC_GEN_SPECS = window.DOC_GEN_SPECS || [
        {
            id: 'stage-dr',
            label: 'DR / DVR 발표자료',
            kind: 'pptx',
            folder: 'DOCUMENT',
            needs: ['meta', 'overview', 'milestones', 'members', 'spec', 'materials'],
            // 실측 이름: `Cosmic Slim Slot_15.6in(Half) Proto DR _V00_Oct 16th 2025.pptx`
            //            `LnW_156 Slim Slot_Cosmetic_DVR_V00_Jun 1st 2026.pptx`
            nameOf: function (ctx, opt) {
                var who = [ctx.meta.고객사, ctx.meta.모델명].filter(Boolean).join('_') || 'PROJECT';
                var inch = ctx.meta.인치 ? ('_' + ctx.meta.인치 + 'in') : '';
                return who + inch + '_' + (opt.stage || 'DR') + '_V00_' + _dgEnDate() + '.pptx';
            },
            note: 'DR·DVR 공통 틀입니다 — 도면·사진·블록도는 들어가지 않습니다(사람이 넣는 부분).'
        }
        // 📌 다음에 붙일 것(실측 양식을 이미 읽어 뒀다):
        //    · 모델명세서(P04, xlsx)  — Model Description / Electric / Optical / Software SPEC
        //    · 라벨사양서(P04, xlsx)  — BUYER/MODEL/품목코드 + 라벨 종류·규격·부착위치 + 인증 체크
        //    · 시제품 제작의뢰서 표   — 그룹웨어 기안과 같은 표(지금은 기안 쪽에만 있다)
    ];

    // `Oct 16th 2025` 꼴 — 실측 파일 이름이 이 모양이다.
    var _dgEnDate = function (d) {
        d = d || new Date();
        var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
        var n = d.getDate();
        var s = (n % 10 === 1 && n !== 11) ? 'st' : (n % 10 === 2 && n !== 12) ? 'nd'
              : (n % 10 === 3 && n !== 13) ? 'rd' : 'th';
        return M + ' ' + n + s + ' ' + d.getFullYear();
    };

    // ── 📐 마일스톤 단계 (데이터) ───────────────────────────────────────
    //  ⚠️ 이름은 **화면 DOM 의 `data-stage` 그대로**다(실측으로 확인) — 바꾸면 값이 안 읽힌다.
    //     실측 발표자료의 PROJECT SCHEDULE 슬라이드가 이 9칸과 1:1 로 맞물린다.
    window.DOC_MILESTONES = window.DOC_MILESTONES || [
        { stage: '기획Start',  label: '제품 기획 Start' },
        { stage: '기획Finish', label: '제품 기획 End' },
        { stage: 'ProtoDR',   label: 'Proto DR' },
        { stage: 'ESStart',   label: 'ES Start' },
        { stage: 'ESEnd',     label: 'ES End' },
        { stage: 'DVR',       label: 'DVR' },
        { stage: 'PPStart',   label: 'PP Start' },
        { stage: 'PPEnd',     label: 'PP End' },
        { stage: 'PRA',       label: 'PRA' }
    ];

    // ── 👥 프로젝트 멤버 (데이터) ───────────────────────────────────────
    //  metaKey = **저장된 값**(projectMeta) · id = 화면 입력칸(폴백) · role = 조직도의 '구분'
    //  ⚠️⚠️ `metaKey` 를 먼저 본다 — 처음엔 입력칸만 읽었는데, **Summary 탭을 한 번도 안 열면
    //     입력칸이 비어 있어서** 멤버가 통째로 빈 채로 문서가 만들어졌다(오류도 안 났다).
    //     실측으로 확인한 저장 위치다(10역할 전부 projectMeta 에 있다).
    window.DOC_MEMBER_ROLES = window.DOC_MEMBER_ROLES || [
        { id: 'sum-pm',       metaKey: '프로젝트담당자',  role: '프로젝트 총괄' },
        { id: 'sum-hw',       metaKey: 'HW담당자',       role: 'H/W 개발' },
        { id: 'sum-fw',       metaKey: 'FW담당자',       role: 'F/W 개발' },
        { id: 'sum-mech',     metaKey: '기구담당자',      role: '기구 설계' },
        { id: 'sum-module',   metaKey: 'Module담당자',   role: 'Module' },
        { id: 'sum-tsp',      metaKey: 'TSP담당자',      role: 'TSP' },
        { id: 'sum-lcm',      metaKey: 'LCM담당자',      role: 'LCM' },
        { id: 'sum-slimming', metaKey: 'Slimming담당자', role: 'Slimming' },
        { id: 'sum-cutting',  metaKey: 'Cutting담당자',  role: 'Cutting' },
        { id: 'sum-tooling',  metaKey: 'Tooling담당자',  role: '금형' }
    ];

    // ── 🧺 사실 수집 — **한 곳에서** 모은다 ─────────────────────────────
    //  문서마다 따로 긁으면 문서마다 다른 값이 나온다(그게 지금 사람이 겪는 문제다).
    //  각 항목은 값과 함께 **비었는지**를 같이 돌려준다 — 미리보기가 그걸 보여준다.
    window._dgCollect = function () {
        if (window.collectTabData) { try { window.collectTabData(); } catch (e) { /* 있는 값으로 */ } }
        var pm = window.projectMeta || {};
        var td = window.tabData || {};

        // ⚠️⚠️ **저장된 값을 먼저, 화면 입력칸은 폴백**이다.
        //    처음엔 DOM 만 읽었는데 Summary 탭을 한 번도 안 열면(= 다른 탭에서 문서를 만들면)
        //    마일스톤·멤버·개요가 **통째로 빈 채** 문서가 나왔다. 오류도 안 났다.
        //    저장 위치는 실측으로 확인했다:
        //      · 개요   `tabData.summary.purpose / volume / mpDate / background`
        //      · 마일스톤 `tabData.summary.milestones[단계].date / .actualDate`
        //      · 멤버   `projectMeta.<역할>담당자`
        var sum = td.summary || {};
        var pick = function (saved, id) {
            var s = String(saved == null ? '' : saved).trim();
            return s || _val(id);
        };

        // 마일스톤 — 계획/실적 두 줄
        var ms = { plan: {}, actual: {}, missing: [] };
        var msSaved = sum.milestones || {};
        (window.DOC_MILESTONES || []).forEach(function (m) {
            var one = msSaved[m.stage] || {};
            var p = document.querySelector('#sum-milestone-body [data-stage="' + m.stage + '"]');
            var a = document.querySelector('#sum-milestone-body-actual [data-stage="' + m.stage + '"]');
            ms.plan[m.stage] = String(one.date || '').trim() || (p ? String(p.value || '').trim() : '');
            ms.actual[m.stage] = String(one.actualDate || '').trim() || (a ? String(a.value || '').trim() : '');
            if (!ms.plan[m.stage]) ms.missing.push(m.label);
        });

        // 멤버 — 10역할(저장값 우선) + 멤버-3(자유 추가)
        var members = [];
        (window.DOC_MEMBER_ROLES || []).forEach(function (r) {
            var v = pick(pm[r.metaKey], r.id);
            if (v) members.push({ role: r.role, name: v });
        });
        (td.projectMembers3 || []).forEach(function (p) {
            if (p && p.name) members.push({ role: String(p.role || '-'), name: String(p.name) });
        });

        // Customer SPEC — js/43 이 모델별로 보관한다(`briefSpecByUnit`). 지금 모델 것을 먼저 본다.
        var spec = [];
        var rows = td.briefSpec;
        if (!(rows && rows.length) && td.briefSpecByUnit) {
            var units = Object.keys(td.briefSpecByUnit);
            for (var i = 0; i < units.length && !(rows && rows.length); i++) rows = td.briefSpecByUnit[units[i]];
        }
        (rows || []).forEach(function (r) {
            var label = String((r.sub || r.type || '')).trim();
            var v = String((r.modelA || r.modelB || r.modelC || '')).trim();
            if (label) spec.push({ label: label, value: v, note: String(r.note || '').trim() });
        });

        // 주요 자재 — 고정 구분 순서대로(모델 #1 기준, 합본 폴백)
        var mats = [];
        var lists = [];
        (td.projectModels || []).forEach(function (m) { if (Array.isArray(m.materials)) lists.push(m.materials); });
        if (Array.isArray(td.projectMaterials)) lists.push(td.projectMaterials);
        (window.MATERIAL_FIXED_CATEGORIES || []).forEach(function (cat) {
            var hit = null;
            for (var i = 0; i < lists.length && !hit; i++) {
                for (var j = 0; j < lists[i].length; j++) {
                    var r = lists[i][j] || {};
                    if (String(r.category || '').trim() !== cat) continue;
                    if (String(r.ktkPn || '').trim() || String(r.description || '').trim()) { hit = r; break; }
                }
            }
            if (hit) mats.push({ cat: cat, pn: String(hit.ktkPn || '').trim(),
                                 desc: String(hit.description || '').trim(), cost: String(hit.cost || '').trim() });
        });

        var ctx = {
            meta: {
                프로젝트코드: String(pm.프로젝트코드 || '').trim(),
                프로젝트명:   String(pm.프로젝트명 || '').trim(),
                고객사:       String(pm.고객사 || '').trim() || (window.getSummaryCustomer ? window.getSummaryCustomer() : ''),
                모델명:       String(pm.모델명 || '').trim() || (window.getSummaryModel ? window.getSummaryModel() : ''),
                인치:         String(pm.인치 || '').trim() || (window.getSummaryInch ? window.getSummaryInch() : ''),
                KTKPN:        String(pm.KTKPN || '').trim(),
                KTK모델명:     String(pm.KTK모델명 || '').trim(),
                PN_모델명:     String(pm.PN_모델명 || '').trim(),
                팀:           String(pm.팀 || '').trim()
            },
            // 👥 담당자도 **meta 로 꺼내 둔다** — 문서 서식(js/67)이 `meta.기구담당자` 처럼
            //    칸 하나에 사람 하나를 꽂는다. `members`(조직도용 목록)만 두면 그 칸들을
            //    못 채운다(실측으로 걸렸다 — 담당자 3칸이 빈 채로 나왔다).
            //    ⚠️ 여기서도 **저장값 우선, 입력칸은 폴백**이다.
            overview: {
                purpose: pick(sum.purpose, 'sum-purpose'),
                volume: pick(sum.volume, 'sum-volume'),
                mpDate: pick(sum.mpDate, 'sum-mp-date'),
                // 📌 실측 DR 발표자료 3쪽의 "프로젝트 의의 및 추진 배경" 이 이 칸이다.
                background: pick(sum.background, 'sum-background')
            },
            milestones: ms,
            members: members,
            spec: spec,
            materials: mats
        };
        // 👥 담당자 10역할을 meta 에 같이 싣는다(위 주석 참고) — 역할 이름은 카탈로그가 정한다.
        (window.DOC_MEMBER_ROLES || []).forEach(function (r) {
            ctx.meta[r.metaKey] = pick(pm[r.metaKey], r.id);
        });
        // 제품코드 — Summary 는 KTKPN 에 앞 6자리를 담는다(모델명은 뒤쪽).
        ctx.meta.제품코드 = ctx.meta.KTKPN;
        ctx.meta.모델풀네임 = ctx.meta.PN_모델명
            || [ctx.meta.KTKPN, ctx.meta.KTK모델명].filter(Boolean).join('_');
        return ctx;
    };

    // 이 문서가 쓰는 것 중 **비어 있는 것** — 만들기 전에 보여준다.
    window._dgGaps = function (spec, ctx) {
        var gaps = [];
        var need = spec.needs || [];
        if (need.indexOf('meta') >= 0) {
            ['프로젝트코드', '프로젝트명', '고객사', '모델명'].forEach(function (k) {
                if (!ctx.meta[k]) gaps.push({ what: '프로젝트 정보 > ' + k, where: 'Summary 탭 ▸ 프로젝트 정보' });
            });
            if (!ctx.meta.제품코드) gaps.push({ what: '제품코드(KTK PN)', where: 'Summary 탭 ▸ KTK PN_모델명' });
        }
        if (need.indexOf('overview') >= 0) {
            if (!ctx.overview.purpose) gaps.push({ what: '적용 목적', where: 'Summary 탭 ▸ 프로젝트 개요' });
            if (!ctx.overview.volume) gaps.push({ what: '연간 수요량', where: 'Summary 탭 ▸ 프로젝트 개요' });
            if (!ctx.overview.mpDate) gaps.push({ what: '목표 양산 일정', where: 'Summary 탭 ▸ 프로젝트 개요' });
        }
        if (need.indexOf('milestones') >= 0 && ctx.milestones.missing.length) {
            gaps.push({ what: '마일스톤 ' + ctx.milestones.missing.length + '칸 (' + ctx.milestones.missing.slice(0, 4).join(', ')
                            + (ctx.milestones.missing.length > 4 ? ' …' : '') + ')',
                        where: 'Summary 탭 ▸ 개발기간 표(계획)' });
        }
        if (need.indexOf('members') >= 0 && !ctx.members.length) {
            gaps.push({ what: '프로젝트 멤버', where: 'Summary 탭 ▸ 프로젝트 멤버' });
        }
        if (need.indexOf('spec') >= 0 && !ctx.spec.length) {
            gaps.push({ what: 'Customer SPEC', where: 'Customer SPEC 탭(제품구분자를 고르고 입력)' });
        }
        if (need.indexOf('materials') >= 0 && !ctx.materials.length) {
            gaps.push({ what: '주요 자재', where: 'Summary 탭 ▸ 주요 자재' });
        }
        return gaps;
    };

    // ── 🎨 발표자료 만들기 (pptx) ───────────────────────────────────────
    //  주간보고 PPT(js/20)와 같은 라이브러리·같은 팔레트 함수를 쓴다 — 색이 테마를 따라간다.
    var _dgBuildStageDeck = function (ctx, opt) {
        if (typeof PptxGenJS === 'undefined') {
            throw new Error(_t('PPT 라이브러리를 불러오지 못했습니다 — 새로고침 후 다시 해주세요.',
                               'PPT library not loaded.'));
        }
        var hex = String(window._cpLiveAppliedHex || '#19c3d6').replace('#', '');
        var C = window.wrDeriveColors ? window.wrDeriveColors(hex)
                                      : { base: hex, dark: hex, tint: 'E0F5F7' };
        var BORDER = 'A6A6A6', BW = 0.75, FF = 'Malgun Gothic';
        var pptx = new PptxGenJS();
        pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
        pptx.layout = 'WIDE';

        var stageName = opt.stage || 'DR';
        var titleLine = [ctx.meta.고객사, ctx.meta.모델명].filter(Boolean).join(' > ')
                      + (ctx.meta.인치 ? (' ' + ctx.meta.인치 + '"') : '');
        var subLine = 'Project No : ' + (ctx.meta.프로젝트코드 || '-')
                    + '   /   Model No : ' + (ctx.meta.제품코드 || '-')
                    + '   /   Model : ' + (ctx.meta.모델풀네임 || '-');

        var head = function (sl, caption) {
            sl.addText(titleLine || _t('프로젝트', 'Project'),
                { x: 0.4, y: 0.2, w: 9.0, h: 0.55, fontSize: 24, bold: true, color: C.base, fontFace: FF });
            sl.addText(stageName, { x: 11.4, y: 0.22, w: 1.5, h: 0.45, fontSize: 16, bold: true,
                                    color: 'FFFFFF', fill: { color: C.dark }, align: 'center', valign: 'middle', fontFace: FF });
            sl.addShape(pptx.ShapeType.rect, { x: 0.4, y: 0.85, w: 12.5, h: 0.04, fill: { color: C.base } });
            sl.addText(subLine, { x: 0.4, y: 0.93, w: 12.5, h: 0.3, fontSize: 11, color: '555555', fontFace: FF });
            if (caption) sl.addText(caption, { x: 0.4, y: 1.3, w: 12.5, h: 0.4, fontSize: 18, bold: true,
                                               color: C.dark, fontFace: FF });
        };
        var TH = function (s) { return { text: s, options: { bold: true, fill: { color: C.tint }, color: '000000',
                                                            align: 'center', valign: 'middle', fontSize: 11 } }; };
        var TD = function (s, o) {
            o = o || {};
            return { text: (s == null || s === '') ? '-' : String(s),
                     options: { fontSize: o.fs || 11, align: o.align || 'left', valign: 'middle',
                                color: o.color || '000000', bold: !!o.bold } };
        };
        var TBL = { border: { type: 'solid', color: BORDER, pt: BW }, fontFace: FF, autoPage: false };

        // ── 1. 표지 ──
        var s0 = pptx.addSlide();
        s0.background = { color: 'FFFFFF' };
        s0.addShape(pptx.ShapeType.rect, { x: 0, y: 2.4, w: 13.33, h: 0.08, fill: { color: C.base } });
        s0.addText((titleLine || '-') + '  ' + stageName,
            { x: 0.8, y: 1.4, w: 11.7, h: 0.9, fontSize: 32, bold: true, color: C.dark, fontFace: FF });
        s0.addText(subLine, { x: 0.8, y: 2.6, w: 11.7, h: 0.6, fontSize: 13, color: '555555', fontFace: FF });
        s0.addText(_dgEnDate() + '\nKORTEK CORPORATION',
            { x: 0.8, y: 5.6, w: 6.0, h: 0.8, fontSize: 13, color: '777777', fontFace: FF });

        // ── 2. PROJECT SUMMARY ──
        var s1 = pptx.addSlide(); s1.background = { color: 'FFFFFF' };
        head(s1, 'PROJECT SUMMARY');
        s1.addTable([
            [TH(_t('프로젝트 코드', 'Project No')), TH(_t('제품 코드', 'Model No')),
             TH(_t('모델명', 'Model')), TH(_t('고객사', 'Buyer')), TH(_t('연간 수요량', 'Annual Qty'))],
            [TD(ctx.meta.프로젝트코드, { align: 'center' }), TD(ctx.meta.제품코드, { align: 'center' }),
             TD(ctx.meta.모델풀네임), TD(ctx.meta.고객사, { align: 'center' }), TD(ctx.overview.volume, { align: 'center' })]
        ], Object.assign({ x: 0.4, y: 1.85, w: 12.5, h: 0.8, colW: [2.0, 1.8, 4.5, 2.1, 2.1] }, TBL));
        var ov = [];
        if (ctx.overview.purpose) ov.push('· ' + _t('적용 목적: ', 'Purpose: ') + ctx.overview.purpose);
        if (ctx.overview.volume) ov.push('· ' + _t('연간 수요량: ', 'Annual demand: ') + ctx.overview.volume);
        if (ctx.overview.mpDate) ov.push('· ' + _t('목표 양산 일정: ', 'MP target: ') + ctx.overview.mpDate);
        if (ctx.overview.background) ov.push('· ' + _t('추진 배경: ', 'Background: ') + ctx.overview.background);
        s1.addText(ov.length ? ov.join('\n') : _t('(Summary 탭 ▸ 프로젝트 개요가 비어 있습니다)',
                                                  '(project overview is empty)'),
            { x: 0.4, y: 2.9, w: 12.5, h: 2.6, fontSize: 13, color: ov.length ? '000000' : 'B1432F',
              fontFace: FF, valign: 'top' });

        // ── 3. 조직도 ──
        var s2 = pptx.addSlide(); s2.background = { color: 'FFFFFF' };
        head(s2, _t('프로젝트 조직', 'Project Members'));
        var mrows = [[TH(_t('구분', 'Role')), TH(_t('성명', 'Name'))]];
        (ctx.members.length ? ctx.members : [{ role: '-', name: '-' }]).forEach(function (m) {
            mrows.push([TD(m.role, { align: 'center' }), TD(m.name)]);
        });
        s2.addTable(mrows, Object.assign({ x: 0.4, y: 1.85, w: 7.0, colW: [3.0, 4.0], rowH: 0.3 }, TBL));
        if (!ctx.members.length) {
            s2.addText(_t('Summary 탭 ▸ 프로젝트 멤버가 비어 있습니다.', 'No members in Summary tab.'),
                { x: 7.7, y: 1.9, w: 5.2, h: 0.5, fontSize: 12, color: 'B1432F', fontFace: FF });
        }

        // ── 4. PROJECT SCHEDULE (마일스톤 9단계) ──
        var s3 = pptx.addSlide(); s3.background = { color: 'FFFFFF' };
        head(s3, 'PROJECT SCHEDULE');
        var hdr = [TH(_t('구분', 'Stage'))], planR = [TD(_t('계획', 'Plan'), { bold: true, align: 'center' })],
            actR = [TD(_t('실적', 'Actual'), { bold: true, align: 'center' })];
        (window.DOC_MILESTONES || []).forEach(function (m) {
            hdr.push(TH(m.label));
            planR.push(TD(ctx.milestones.plan[m.stage], { align: 'center', fs: 10 }));
            actR.push(TD(ctx.milestones.actual[m.stage], { align: 'center', fs: 10 }));
        });
        s3.addTable([hdr, planR, actR],
            Object.assign({ x: 0.4, y: 1.85, w: 12.5, rowH: 0.42, fontSize: 10 }, TBL));
        if (ctx.milestones.missing.length) {
            s3.addText(_t('비어 있는 계획 칸: ', 'empty plan cells: ') + ctx.milestones.missing.join(', '),
                { x: 0.4, y: 3.5, w: 12.5, h: 0.5, fontSize: 11, color: 'B1432F', fontFace: FF });
        }

        // ── 5. SPECIFICATION (Customer SPEC) ──
        var s4 = pptx.addSlide(); s4.background = { color: 'FFFFFF' };
        head(s4, 'SPECIFICATION');
        if (ctx.spec.length) {
            // 한 장에 담길 만큼만 — 넘치면 다음 장으로 쪼갠다(글자가 겹치는 것보다 낫다).
            var PER = 16, page = 0;
            for (var i = 0; i < ctx.spec.length; i += PER) {
                var sl = page === 0 ? s4 : pptx.addSlide();
                if (page > 0) { sl.background = { color: 'FFFFFF' }; head(sl, 'SPECIFICATION (' + (page + 1) + ')'); }
                var srows = [[TH('NO'), TH('TYPE'), TH('Description'), TH('KTK Note')]];
                ctx.spec.slice(i, i + PER).forEach(function (r, k) {
                    srows.push([TD(i + k + 1, { align: 'center', fs: 10 }), TD(r.label, { fs: 10 }),
                                TD(r.value, { fs: 10 }), TD(r.note, { fs: 10 })]);
                });
                sl.addTable(srows, Object.assign({ x: 0.4, y: 1.85, w: 12.5, colW: [0.8, 3.4, 5.3, 3.0],
                                                   rowH: 0.3, fontSize: 10 }, TBL));
                page++;
            }
        } else {
            s4.addText(_t('Customer SPEC 이 비어 있습니다 — Customer SPEC 탭에서 제품구분자를 고르고 입력해 주세요.',
                          'Customer SPEC is empty.'),
                { x: 0.4, y: 2.0, w: 12.5, h: 0.6, fontSize: 13, color: 'B1432F', fontFace: FF });
        }

        // ── 6. 주요 자재 ──
        var s5 = pptx.addSlide(); s5.background = { color: 'FFFFFF' };
        head(s5, _t('주요 자재', 'Key Materials'));
        var krows = [[TH(_t('구분', 'Category')), TH(_t('코드', 'PN')), TH(_t('내역', 'Description'))]];
        (ctx.materials.length ? ctx.materials : [{ cat: '-', pn: '', desc: '' }]).forEach(function (m) {
            krows.push([TD(m.cat, { align: 'center', fs: 10 }), TD(m.pn, { align: 'center', fs: 10 }), TD(m.desc, { fs: 10 })]);
        });
        s5.addTable(krows, Object.assign({ x: 0.4, y: 1.85, w: 12.5, colW: [2.6, 2.0, 7.9], rowH: 0.3, fontSize: 10 }, TBL));
        if (!ctx.materials.length) {
            s5.addText(_t('Summary 탭 ▸ 주요 자재가 비어 있습니다.', 'No key materials.'),
                { x: 0.4, y: 2.6, w: 12.5, h: 0.5, fontSize: 12, color: 'B1432F', fontFace: FF });
        }
        return pptx;
    };

    // 생성기 등록 — `kind` 로 고른다(새 종류가 생기면 여기 한 줄).

    // ── 📁 NAS 업로드 — 만든 바이트를 /doc/put 으로 보낸다 ───────────────
    //  ⚠️ 팀 공유 폴더다 — 같은 이름이 있으면 백엔드가 409 로 막고,
    //     **사람이 한 번 확인한 뒤에만** overwrite=1 로 다시 보낸다(되돌릴 수 없다).
    //  돌려주는 값: { ok, name, size, skipped, error, exists }
    //  opts.forceOverwrite — 여러 파일을 한 번에 올리는 호출지(예: js/67 광학 이력 가져오기)가
    //  **파일마다 confirm 이 뜨는 걸 피하려고** 쓴다: true 면 묻지 않고 덮어쓰기, false 면 묻지
    //  않고 충돌을 `{ok:false, exists:true}` 로만 돌려준다(그 호출지가 한꺼번에 하나로 묻는다).
    //  생략(기본)이면 예전처럼 **이 함수가 직접** 1건씩 confirm.
    window._dgUploadBlob = async function (folder, name, blob, opts) {
        opts = opts || {};
        var put = async function (overwrite) {
            var fd = new FormData();
            fd.append('file', blob, name);
            var u = BACKEND + '/doc/put?folder=' + encodeURIComponent(folder)
                  + '&name=' + encodeURIComponent(name) + (overwrite ? '&overwrite=1' : '');
            var r = await fetch(u, { method: 'POST', body: fd });
            return { status: r.status, body: await r.json().catch(function () { return {}; }) };
        };
        try {
            var res = await put(false);
            if (res.status === 409 || (res.body && res.body.exists)) {
                if (opts.forceOverwrite === false) return { ok: false, exists: true };
                if (opts.forceOverwrite !== true) {
                    if (!confirm(_t('NAS 에 같은 이름의 파일이 이미 있습니다:\n\n' + name
                                    + '\n\n덮어쓸까요? (되돌릴 수 없습니다 — 팀 공유 폴더입니다)',
                                    'A file with the same name exists. Overwrite?'))) {
                        return { ok: false, skipped: true };
                    }
                }
                res = await put(true);
            }
            if (res.body && res.body.ok) return { ok: true, name: res.body.name, size: res.body.size || 0 };
            var why = (res.body && res.body.error) || ('HTTP ' + res.status);
            // 조용히 삼키지 않는다 — 폴더 허용 목록·백엔드 버전 문제가 여기서 드러난다.
            return { ok: false, error: why + (res.status === 400
                ? _t(' (백엔드를 재시작해야 DOCUMENT 폴더가 열립니다)', ' (restart the backend)') : '') };
        } catch (e) {
            return { ok: false, error: String(e && e.message || e) };
        }
    };

    // 📊 단계별 발표자료 PPT 생성기 — Document 페이지(js/67)가 부른다.
    //    ⚠️ 화면(모달)은 js/67 의 **페이지**로 옮겼다. 이 파일은 이제 **엔진만** 한다:
    //       값 모으기(_dgCollect) · 빈 칸 집어내기(_dgGaps) · PPT 만들기 · NAS 올리기.
    window._dgBuildStageDeck = _dgBuildStageDeck;
    window._dgEnDate = _dgEnDate;
})();
