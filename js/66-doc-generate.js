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
    var _BUILDERS = { 'stage-dr': _dgBuildStageDeck };

    // ── 🗂 Document 목록·미리보기 (PARTS 처럼 고른다) ───────────────────
    window._dgState = window._dgState || { specId: null, stage: 'Proto DR', ctx: null, gaps: [] };

    window.openDocumentPicker = function () {
        var ov = document.getElementById('dg-overlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'dg-overlay';
            ov.style.cssText = 'display:flex; position:fixed; inset:0; z-index:9400; pointer-events:none; background:none;';
            ov.innerHTML = '<div id="dg-box" style="pointer-events:all; position:fixed; left:50%; top:7%;'
                + ' transform:translateX(-50%); width:min(900px,94vw); max-height:86vh; display:flex; flex-direction:column;'
                + ' background:#fff; border:1px solid var(--modal-border, #a5c8f0); border-radius:10px;'
                + ' box-shadow:0 8px 28px rgba(0,0,0,.18); overflow:hidden; resize:both; min-width:520px; min-height:320px;">'
                + '<div id="dg-head" style="flex-shrink:0; display:flex; align-items:center; justify-content:space-between;'
                + ' gap:8px; padding:9px 12px; background:var(--modal-head-bg, #e7f3ff);'
                + ' border-bottom:1px solid var(--modal-border, #a5c8f0); color:var(--modal-head-text, #1971c2);'
                + ' font-weight:bold; font-size:13px; cursor:grab; user-select:none;">'
                + '<span id="dg-title">📄 Document</span>'
                + '<button onclick="window._dgClose()" style="background:var(--modal-icon-bg); border:1px solid var(--modal-icon-border);'
                + ' color:var(--modal-icon-text); border-radius:6px; font-size:16px; cursor:pointer; width:28px; height:28px;">✕</button></div>'
                // ⚠️ flex 본문엔 `min-height:0` 이 있어야 스크롤바가 생긴다(docs/modal-ux.md)
                + '<div id="dg-body" style="flex:1; min-height:0; overflow-y:auto; padding:10px 12px;"></div>'
                + '<div style="flex-shrink:0; display:flex; justify-content:space-between; align-items:center; gap:6px;'
                + ' padding:9px 12px; border-top:1px solid #e9ecef;">'
                + '<span id="dg-warn" style="font-size:11px; color:#b1432f;"></span>'
                + '<span><button onclick="window._dgClose()" style="padding:6px 12px; background:#f1f3f5; color:#495057;'
                + ' border:1px solid #dee2e6; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">'
                + _esc(_t('닫기', 'Close')) + '</button> '
                + '<button id="dg-make" onclick="window._dgMake(false)" style="padding:6px 12px; background:#e6f6ea;'
                + ' color:#1f7a3d; border:1px solid #a8dab8; border-radius:6px; font-size:12px; font-weight:bold;'
                + ' cursor:pointer;">⬇️ ' + _esc(_t('내려받기', 'Download')) + '</button> '
                + '<button id="dg-upload" onclick="window._dgMake(true)" style="padding:6px 12px; background:#e7f3ff;'
                + ' color:#1971c2; border:1px solid #a5c8f0; border-radius:6px; font-size:12px; font-weight:bold;'
                + ' cursor:pointer;">📁 ' + _esc(_t('NAS 에 올리기', 'Upload to NAS')) + '</button></span></div></div>';
            document.body.appendChild(ov);
            if (window._makeDraggable) { try { window._makeDraggable('dg-box', 'dg-head'); } catch (e) { /* 드래그 실패가 열기를 막지 않게 */ } }
            if (window._bindClickToFront) { try { window._bindClickToFront('dg-overlay'); } catch (e) { /* 〃 */ } }
        }
        ov.style.display = 'flex';
        // ⚠️ 열 때마다 **지금 창 크기에 맞춘다.** 좁은 창에서 한 번 열면 inline 폭이 박혀(실측
        //    430px) 창을 넓혀도 그대로 작게 열린다 — `width:min(900px,94vw)` 가 inline 에 눌린다.
        //    이 모달은 고르고 닫는 창이지 사람이 붙잡고 쓰는 작업창이 아니라서, 저장된 크기보다
        //    "지금 화면에 맞는 크기"가 낫다.
        var box = document.getElementById('dg-box');
        if (box) { box.style.width = ''; box.style.height = ''; }
        if (window.bringModalToFront) { try { window.bringModalToFront('dg-overlay'); } catch (e) { /* 〃 */ } }
        if (!window._dgState.specId) window._dgState.specId = (window.DOC_GEN_SPECS[0] || {}).id;
        window._dgRender();
    };

    window._dgClose = function () {
        var ov = document.getElementById('dg-overlay');
        if (ov) ov.style.display = 'none';
    };

    window._dgPick = function (id) { window._dgState.specId = id; window._dgRender(); };
    window._dgSetStage = function (v) { window._dgState.stage = v; window._dgRender(); };

    var _specById = function (id) {
        return (window.DOC_GEN_SPECS || []).filter(function (s) { return s.id === id; })[0] || null;
    };

    window._dgRender = function () {
        var st = window._dgState;
        var spec = _specById(st.specId);
        var ctx = window._dgCollect();
        st.ctx = ctx;
        st.gaps = spec ? window._dgGaps(spec, ctx) : [];

        var pname = [ctx.meta.고객사, ctx.meta.모델명].filter(Boolean).join(' > ') || _t('(프로젝트가 안 열렸습니다)', '(no project)');
        var el = document.getElementById('dg-title');
        if (el) el.textContent = '📄 Document — ' + pname;

        var h = '<div style="display:flex; gap:12px; align-items:flex-start;">';
        // 왼쪽 — 문서 종류(PARTS 처럼 고른다)
        h += '<div style="flex:0 0 220px;">'
           + '<div style="font-size:11px; color:#868e96; margin-bottom:5px;">'
           + _esc(_t('문서 종류', 'Document type')) + '</div>';
        (window.DOC_GEN_SPECS || []).forEach(function (s) {
            var on = s.id === st.specId;
            h += '<button onclick="window._dgPick(\'' + _esc(s.id) + '\')" style="display:block; width:100%;'
               + ' text-align:left; margin-bottom:4px; padding:7px 9px; font-size:12px; cursor:pointer;'
               + ' border-radius:6px; border:1px solid ' + (on ? 'var(--modal-border,#a5c8f0)' : '#dee2e6') + ';'
               + ' background:' + (on ? 'var(--modal-head-bg,#e7f3ff)' : '#fff') + ';'
               + ' font-weight:' + (on ? 'bold' : 'normal') + ';">'
               + (s.kind === 'pptx' ? '📊 ' : '📗 ') + _esc(s.label) + '</button>';
        });
        h += '</div>';

        // 오른쪽 — 들어갈 내용 / 비어 있는 것
        h += '<div style="flex:1; min-width:0;">';
        if (!spec) {
            h += '<div style="color:#b1432f; font-size:12px;">' + _esc(_t('문서 종류를 고르세요.', 'Pick a document type.')) + '</div>';
        } else {
            if (spec.id === 'stage-dr') {
                h += '<div style="margin-bottom:8px; font-size:12px;">'
                   + _esc(_t('단계', 'Stage')) + ': ';
                ['Kickoff & Proto DR', 'Proto DR', 'DVR', 'PRA'].forEach(function (sv) {
                    var on = st.stage === sv;
                    h += '<button onclick="window._dgSetStage(\'' + _esc(sv) + '\')" style="margin-right:4px;'
                       + ' padding:3px 9px; font-size:11px; cursor:pointer; border-radius:12px;'
                       + ' border:1px solid ' + (on ? 'var(--modal-border,#a5c8f0)' : '#dee2e6') + ';'
                       + ' background:' + (on ? 'var(--modal-head-bg,#e7f3ff)' : '#fff') + ';'
                       + ' font-weight:' + (on ? 'bold' : 'normal') + ';">' + _esc(sv) + '</button>';
                });
                h += '</div>';
            }
            if (spec.note) {
                h += '<div style="margin-bottom:8px; padding:6px 9px; background:#e8f4fd; border-left:3px solid #1a4f7a;'
                   + ' border-radius:0 4px 4px 0; font-size:11.5px; color:#1a4f7a;">ℹ️ ' + _esc(spec.note) + '</div>';
            }
            // 들어갈 내용 — 개수로 먼저 보여준다
            var counts = [
                [_t('프로젝트 정보', 'Project info'), [ctx.meta.프로젝트코드, ctx.meta.제품코드, ctx.meta.모델풀네임].filter(Boolean).length + '/3'],
                [_t('프로젝트 개요', 'Overview'), [ctx.overview.purpose, ctx.overview.volume, ctx.overview.mpDate].filter(Boolean).length + '/3'],
                [_t('마일스톤(계획)', 'Milestones'), ((window.DOC_MILESTONES || []).length - ctx.milestones.missing.length) + '/' + (window.DOC_MILESTONES || []).length],
                [_t('프로젝트 멤버', 'Members'), ctx.members.length + _t('명', '')],
                ['Customer SPEC', ctx.spec.length + _t('항목', ' items')],
                [_t('주요 자재', 'Key materials'), ctx.materials.length + _t('종', '')]
            ];
            h += '<table style="border-collapse:collapse; width:100%; font-size:11.5px; margin-bottom:8px;">';
            counts.forEach(function (c) {
                var empty = /^0/.test(String(c[1]));
                h += '<tr><td style="border:1px solid #e9ecef; padding:3px 7px; background:#f8f9fa; width:40%;">'
                   + _esc(c[0]) + '</td><td style="border:1px solid #e9ecef; padding:3px 7px;'
                   + (empty ? ' color:#b1432f; font-weight:bold;' : ' color:#1f7a3d;') + '">'
                   + _esc(c[1]) + '</td></tr>';
            });
            h += '</table>';
            // ⚠️ 비어 있는 것 — 숨기지 않는다. 어디서 채우는지까지 적는다.
            if (st.gaps.length) {
                h += '<div style="padding:6px 9px; background:#fff3cd; border-left:3px solid #e6a817;'
                   + ' border-radius:0 4px 4px 0; font-size:11.5px; color:#7a5210;">⚠️ '
                   + _esc(_t('비어 있는 항목 ' + st.gaps.length + '개 — 이대로 만들면 그 칸은 비거나 빨간 글씨로 들어갑니다:',
                             st.gaps.length + ' empty item(s):')) + '<ul style="margin:5px 0 0 16px; padding:0;">';
                st.gaps.forEach(function (g) {
                    h += '<li style="margin-bottom:2px;">' + _esc(g.what)
                       + ' <span style="opacity:.75;">— ' + _esc(g.where) + '</span></li>';
                });
                h += '</ul></div>';
            } else {
                h += '<div style="padding:6px 9px; background:#e6f6ea; border-left:3px solid #1f7a3d;'
                   + ' border-radius:0 4px 4px 0; font-size:11.5px; color:#1f7a3d;">✅ '
                   + _esc(_t('이 문서가 쓰는 항목이 전부 채워져 있습니다.', 'All inputs are filled.')) + '</div>';
            }
            h += '<div style="margin-top:8px; font-size:11px; color:#868e96;">'
               + _esc(_t('파일 이름: ', 'file name: '))
               + '<code>' + _esc(spec.nameOf(ctx, { stage: st.stage })) + '</code><br>'
               + _esc(_t('NAS 폴더: ', 'NAS folder: ')) + '<code>' + _esc(spec.folder) + '</code></div>';
        }
        h += '</div></div>';

        document.getElementById('dg-body').innerHTML = h;
        var w = document.getElementById('dg-warn');
        if (w) {
            w.textContent = st.gaps.length
                ? _t('비어 있는 항목 ' + st.gaps.length + '개', st.gaps.length + ' empty')
                : '';
        }
    };

    // ── ⬇️📁 만들기 ────────────────────────────────────────────────────
    //  upload=false → 내려받기 / true → NAS 업로드(같은 이름이면 덮어쓰기 확인)
    window._dgMake = async function (upload) {
        var st = window._dgState;
        var spec = _specById(st.specId);
        if (!spec) { _toast('⚠️ ' + _t('문서 종류를 고르세요.', 'Pick a document type.'), 'error'); return; }
        var build = _BUILDERS[spec.id];
        if (!build) { _toast('⚠️ ' + _t('이 문서의 생성기가 없습니다.', 'No builder for this document.'), 'error'); return; }

        var ctx = window._dgCollect();
        var name = spec.nameOf(ctx, { stage: st.stage });
        var btn = document.getElementById(upload ? 'dg-upload' : 'dg-make');
        var label = btn ? btn.textContent : '';
        var busy = function (t) { if (btn) { btn.disabled = true; btn.textContent = t; } };
        var free = function () { if (btn) { btn.disabled = false; btn.textContent = label; } };

        busy(_t('⏳ 만드는 중…', '⏳ Building…'));
        var pptx;
        try {
            pptx = build(ctx, { stage: st.stage });
        } catch (e) {
            free();
            _toast('⚠️ ' + _t('문서를 만들지 못했습니다: ', 'Could not build: ') + (e && e.message || e), 'error');
            if (window._issueLog) { try { window._issueLog('doc-generate', { spec: spec.id, err: String(e && e.message || e) }); } catch (e2) {} }
            return;
        }

        if (!upload) {
            try { await pptx.writeFile({ fileName: name }); _toast('⬇️ ' + name, 'success'); }
            catch (e) { _toast('⚠️ ' + _t('내려받기 실패: ', 'Download failed: ') + (e && e.message || e), 'error'); }
            free();
            return;
        }

        // NAS 업로드 — 바이트를 만들어 `/doc/put` 으로 보낸다(브라우저는 UNC 를 못 쓴다).
        busy(_t('⏳ 올리는 중…', '⏳ Uploading…'));
        var blob;
        try { blob = await pptx.write({ outputType: 'blob' }); }
        catch (e) {
            free(); _toast('⚠️ ' + _t('파일을 만들지 못했습니다: ', 'Could not serialize: ') + (e && e.message || e), 'error'); return;
        }
        var put = async function (overwrite) {
            var fd = new FormData();
            fd.append('file', blob, name);
            var u = BACKEND + '/doc/put?folder=' + encodeURIComponent(spec.folder)
                  + '&name=' + encodeURIComponent(name) + (overwrite ? '&overwrite=1' : '');
            var r = await fetch(u, { method: 'POST', body: fd });
            return { status: r.status, body: await r.json().catch(function () { return {}; }) };
        };
        try {
            var res = await put(false);
            // ⚠️ 같은 이름이 있으면 백엔드가 409 로 거부한다 — 팀 공유라 조용히 덮어쓰지 않는다.
            //    사람에게 **한 번** 물어본 뒤에만 덮어쓴다.
            if (res.status === 409 || (res.body && res.body.exists)) {
                free();
                if (!confirm(_t('NAS 에 같은 이름의 파일이 이미 있습니다:\n\n' + name
                                + '\n\n덮어쓸까요? (되돌릴 수 없습니다 — 팀 공유 폴더입니다)',
                                'A file with the same name exists. Overwrite?'))) {
                    _toast(_t('올리지 않았습니다.', 'Not uploaded.'), 'info'); return;
                }
                busy(_t('⏳ 덮어쓰는 중…', '⏳ Overwriting…'));
                res = await put(true);
            }
            free();
            if (res.body && res.body.ok) {
                _toast('📁 ' + _t('NAS 에 올렸습니다 — ', 'Uploaded — ') + spec.folder + '/' + name
                       + ' (' + Math.round((res.body.size || 0) / 1024) + 'KB)', 'success');
            } else {
                var why = (res.body && res.body.error) || ('HTTP ' + res.status);
                // 조용히 삼키지 않는다 — 폴더 허용 목록·백엔드 버전 문제가 여기서 드러난다.
                _toast('⚠️ ' + _t('올리지 못했습니다: ', 'Upload failed: ') + why
                       + (res.status === 400 ? _t(' (백엔드를 재시작해야 DOCUMENT 폴더가 열립니다)',
                                                  ' (restart the backend)') : ''), 'error');
                if (window._issueLog) { try { window._issueLog('doc-generate', { spec: spec.id, up: why }); } catch (e2) {} }
            }
        } catch (e) {
            free();
            _toast('⚠️ ' + _t('올리지 못했습니다: ', 'Upload failed: ') + (e && e.message || e), 'error');
        }
    };

    // ── 📄 입구 — Summary 탭 헤더에 **런타임으로** 끼운다 ───────────────
    //  HTML 을 안 고치는 이유: 지금은 Summary 가 모든 재료를 들고 있는 자리라 거기 붙이는 게
    //  자연스럽고, 나중에 Document **탭**을 만들면 `openDocumentPicker()` 를 그 탭에서 부르면
    //  된다(그릴 함수가 `_dgRender` 하나라 모달이든 탭이든 같은 걸 쓴다).
    //  ⚠️ 자리는 js/42·53 과 같은 앵커(`.concept-header-box` 에 append) — 그 셋이 한 줄에 선다.
    var BTN = 'padding:5px 11px; background:#e0f5f7; color:#0b7285; border:1px solid #a3d9e0;'
            + ' border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer;'
            + ' transition:background .15s; margin-right:4px;';

    var _dgMountButton = function () {
        // ⚠️ 탭 요소 id 는 `tab-summary` 다(실측) — `summary` 는 **없다**. 처음 그렇게 적었다가
        //    버튼이 아예 안 달렸다(오류도 안 났다 — `getElementById` 가 null 이면 조용히 return).
        var tabEl = document.getElementById('tab-summary');
        if (!tabEl) return;
        if (document.getElementById('dg-open-btn')) return;
        var at = tabEl.querySelector('.concept-header-box');
        if (!at) return;
        var b = document.createElement('button');
        b.id = 'dg-open-btn';
        b.style.cssText = BTN;
        b.textContent = '📄 ' + _t('문서 만들기', 'Documents');
        b.title = _t('이 프로젝트 정보로 문서를 만듭니다 — DR/DVR 발표자료 등. 만들기 전에 '
                     + '무엇이 비어 있는지 보여줍니다.',
                     'Build project documents from this project\'s data.');
        b.onmouseover = function () { b.style.background = '#a3d9e0'; };
        b.onmouseout = function () { b.style.background = '#e0f5f7'; };
        b.onclick = function () { window.openDocumentPicker(); };
        at.appendChild(b);
    };
    window._dgMountButton = _dgMountButton;

    // 탭은 나중에 그려지기도 한다 — 로드 후 한 번 + 클릭마다 다시(js/42·53 과 같은 방식).
    var boot = function () { try { _dgMountButton(); } catch (e) { /* 버튼 실패가 페이지를 막지 않게 */ } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
    document.addEventListener('click', function (e) {
        var t = e.target;
        if (t && t.closest && t.closest('button, a, [onclick]')) setTimeout(boot, 140);
    }, true);
})();
