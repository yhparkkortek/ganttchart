// [분리됨] 원본: js/22-tabs-summary-mctable.js 의 6050~6324행 (리팩터링: 파일당 토큰 절약 · 협업용 분리)
// 섹션: Address Book — CRUD/다중선택/정렬 + 엑셀·CSV 불러오기/내보내기
// =========================================================
// 🪪 Address Book — CRUD, 다중선택, 정렬
// =========================================================
window._addrSelectedRows = new Set();
window._addrLastClickedIdx = null;

window.renderAddressTable = function() {
    const tbody = document.getElementById('address-table-body');
    if (!tbody) return;
    window.tabData = window.tabData || {};
    let rows = window.tabData.addressBook || [];
    if (!rows.length) rows = [{ name: '', nameEn: '', dept: '', title: '', email: '', mobile: '', phone: '' }]; // bm 팝업 재오픈용 최소 1행 유지

    tbody.innerHTML = rows.map(function(p) {
        return '<tr>'
            + '<td class="bm-no"></td>'
            + '<td><input class="u-input" data-field="name" value="' + _escTabVal(p.name) + '" onchange="window.collectAddressData()"></td>'
            + '<td><input class="u-input" data-field="nameEn" value="' + _escTabVal(p.nameEn) + '" placeholder="' + (window._currentLang === 'en' ? 'e.g. Hong Gildong' : '예: Hong Gildong') + '" onchange="window.collectAddressData()"></td>'
            + '<td><input class="u-input" data-field="dept" value="' + _escTabVal(p.dept) + '" onchange="window.collectAddressData()"></td>'
            + '<td><input class="u-input" data-field="title" value="' + _escTabVal(p.title) + '" onchange="window.collectAddressData()"></td>'
            + '<td><input class="u-input" data-field="email" value="' + _escTabVal(p.email) + '" onchange="window.collectAddressData()"></td>'
            + '<td><input class="u-input" data-field="mobile" value="' + _escTabVal(p.mobile) + '" onchange="window.collectAddressData()"></td>'
            + '<td><input class="u-input" data-field="phone" value="' + _escTabVal(p.phone) + '" onchange="window.collectAddressData()"></td>'
            + '<td><input class="u-input" data-field="telegramId" value="' + _escTabVal(p.telegramId) + '" placeholder="' + (window._currentLang === 'en' ? 'e.g. 987654321' : '예: 987654321') + '" onchange="window.collectAddressData()"></td>'
            + '</tr>';
    }).join('');

    if (window.bmSetupAllRows) window.bmSetupAllRows('addr');
    window.filterAddressRows(window._addrSearchTerm || ''); // 💡 재렌더(정렬/불러오기 등) 후에도 검색어 유지
};

// 💡 [주소록 검색] 행을 실제로 지우면 collectAddressData()가 "지금 DOM에 보이는 행"만으로
//    addressBook을 통째로 재구성하기 때문에, 검색으로 안 보이는 사람이 저장 시 사라지는 대형 사고가 남 —
//    그래서 필터는 DOM에서 지우지 않고 display:none으로만 숨김(데이터는 항상 그대로 유지)
window._addrSearchTerm = '';
window.filterAddressRows = function(term) {
    window._addrSearchTerm = term || '';
    const q = window._addrSearchTerm.trim().toLowerCase();
    const rows = document.querySelectorAll('#address-table-body tr');
    let shown = 0;
    rows.forEach(function(tr) {
        if (!q) { tr.style.display = ''; shown++; return; }
        const haystack = Array.from(tr.querySelectorAll('input.u-input'))
            .map(function(el) { return el.value || ''; })
            .join(' ')
            .toLowerCase();
        const match = haystack.includes(q);
        tr.style.display = match ? '' : 'none';
        if (match) shown++;
    });
    const countEl = document.getElementById('addr-search-count');
    if (countEl) countEl.textContent = q ? `${shown} / ${rows.length}명` : '';
    const clearEl = document.getElementById('addr-search-clear');
    if (clearEl) clearEl.style.display = q ? 'inline' : 'none';
};

// 💡 [2026-08-30 수정] dir 파라미터 추가(오름차순/내림차순) — 예전엔 "이름순"/"부서순" 버튼 전용으로
// 항상 오름차순만 지원했는데, 이제 표 헤더 클릭 정렬(sortAddressByHeader)이 이 함수를 재사용하면서
// 같은 열을 다시 클릭하면 내림차순으로 뒤집을 수 있어야 해서 방향을 받도록 확장했다.
window.sortAddressBy = function(field, dir) {
    window.collectAddressData();
    const mul = dir === 'desc' ? -1 : 1;
    window.tabData.addressBook.sort(function(a, b) { return mul * String(a[field] || '').localeCompare(String(b[field] || ''), 'ko'); });
    window._bmSelected.addr.clear();
    window._bmAnchor.addr = null;
    window.renderAddressTable();
};

// 💡 [2026-08-30 신규] Address 표 헤더 클릭 정렬 — "🔤 이름순"/"🏢 부서순" 버튼을 없애는 대신, 정렬
// 가능한 모든 열(이름/영문 이름/부서/직함/이메일/휴대폰/근무처 전화/텔레그램 ID) 헤더 자체를 누르면
// 그 열 기준으로 정렬되고, 같은 열을 다시 누르면 오름차순↔내림차순이 토글되도록 한다(엑셀/구글시트
// 표 헤더 정렬과 동일한 관례). 현재 정렬 기준 열에는 헤더에 ▲/▼ 표시를 붙여 어떤 상태인지 보여준다.
window._addrSortState = { field: null, dir: 'asc' };
window.sortAddressByHeader = function(field) {
    if (window._addrSortState.field === field) {
        window._addrSortState.dir = window._addrSortState.dir === 'asc' ? 'desc' : 'asc';
    } else {
        window._addrSortState.field = field;
        window._addrSortState.dir = 'asc';
    }
    window.sortAddressBy(field, window._addrSortState.dir);
    window._updateAddrSortHeaderUI();
};
window._updateAddrSortHeaderUI = function() {
    document.querySelectorAll('#tab-address thead th[data-sort-field]').forEach(function(th) {
        const indicator = th.querySelector('.addr-sort-indicator');
        if (!indicator) return;
        indicator.textContent = (th.dataset.sortField === window._addrSortState.field)
            ? (window._addrSortState.dir === 'asc' ? ' ▲' : ' ▼') : '';
    });
};

// 🪪 공용 주소록(Address Book) — 프로젝트와 무관하게 팀 전체가 공유하는 단일 소스
window.AddressBook = {
    KEY: 'gantt_address_book_shared',
    FILE_NAME: 'AddressBook_Shared.json',
    _driveFileId: null,
    _mergeCfg: { merge: function(contents) {
        const base = (contents[0] && Array.isArray(contents[0].addressBook)) ? contents[0].addressBook.slice() : [];
        const seen = new Set(base.map(function(p) { return String(p.name || '').trim().toLowerCase(); }).filter(Boolean));
        for (let i = 1; i < contents.length; i++) {
            ((contents[i] && Array.isArray(contents[i].addressBook)) ? contents[i].addressBook : []).forEach(function(p) {
                const key = String(p.name || '').trim().toLowerCase();
                if (key && !seen.has(key)) { seen.add(key); base.push(p); }
            });
        }
        return { addressBook: base, savedAt: new Date().toISOString() };
    } },
    _syncTimer: null,
    // 💡 [2026-08-24 사고 방지] 마지막으로 Drive에서 확인된(=진짜 존재가 확인된) "내용이 채워진" 인원 수.
    //    프로젝트 자동저장(collectTabData)이 Address 탭을 보지도 않은 채 collectAddressData()를 얼결에
    //    호출해서, 아직 Drive에서 못 받아온 빈/오래된 로컬 캐시로 팀 공용 주소록 전체를 덮어쓰는 사고가
    //    실제로 발생했음(365명 → 빈 배열로 반복 붕괴). syncToDrive()에서 이 값과 비교해 스킵 여부를 판단.
    _lastKnownServerCount: 0,
    // 💡 [2026-08-24 낙관적 동시성 제어] 내가 마지막으로 Drive에서 읽었던 savedAt. 저장 직전 Drive의
    //    "지금" savedAt과 비교해서, 그 사이 다른 팀원이 먼저 저장했다면(=savedAt이 달라졌다면) 내
    //    오래된 로컬본으로 그 사람의 최신 수정을 덮어쓰지 않고 저장을 중단 + 최신본을 다시 받아온다.
    _lastKnownSavedAt: null,
    _meaningfulCount: function(list) {
        return (list || []).filter(function(p) { return p && (String(p.name||'').trim() || String(p.email||'').trim()); }).length;
    },
    load: function() {
        try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch(e) { return []; }
    },
    // ⚠️⚠️ [2026-11-11 실사용 버그] 그룹웨어 전사 주소록 불러오기(394명)로 이 키가 전보다
    //    훨씬 커졌는데, setItem에 try/catch가 없어 localStorage 용량 초과(QuotaExceededError)가
    //    그대로 throw됐다 — 호출자(메일 자동처리의 신규발신자 등록, AddressBook.loadFromDrive
    //    폴백 등)가 이 예외를 못 받아내면 그 작업 전체가 깨지고, 공교롭게 AI 문답 답변란에
    //    브라우저 원문 에러로 노출되기도 했다(실제로는 AI 호출과 무관). js/14c(업무 보관함)와
    //    같은 방어 패턴 — 저장소 닥터(js/34)로 캐시만 자동 정리 후 재시도, 그래도 안 되면
    //    로컬 캐시는 포기하되 호출자는 깨뜨리지 않는다(공유 저장소는 원본이라 계속 동기화 시도).
    save: function(list, skipSync) {
        try {
            localStorage.setItem(this.KEY, JSON.stringify(list));
        } catch (e) {
            var isQuota = !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
            if (!isQuota) throw e;
            console.warn('[주소록] localStorage 용량 초과 — 캐시 정리 후 재시도합니다.', e);
            var recovered = false;
            try {
                if (window._storageDoctorAuto && window._storageDoctorAuto()) {
                    localStorage.setItem(this.KEY, JSON.stringify(list));
                    recovered = true;
                }
            } catch (e2) { /* 그래도 부족 — 아래 안내 */ }
            if (!recovered && window.showToast) {
                window.showToast(window._t(
                    '⚠️ 주소록을 이 브라우저에 캐시하지 못했습니다(저장 공간 부족) — 공유 저장소에는 그대로 반영을 시도합니다.',
                    '⚠️ Could not cache the address book in this browser (storage full) — still trying to sync to the shared store.'
                ), 'warning', 8000);
            }
        }
        if (!skipSync) this.scheduleDriveSync(list);
    },
    scheduleDriveSync: function(list) {
        const self = this;
        if (self._syncTimer) clearTimeout(self._syncTimer);
        self._syncTimer = setTimeout(function() { self.syncToDrive(list); }, 3000);
    },
    syncToDrive: async function(list) {
        const tokenObj = (window.gapi && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) return; // 비로그인: localStorage 단독 동작
        // 💡 [사고 방지 가드] 이전에 Drive에서 5명 넘게 확인된 적이 있는데, 지금 올리려는 목록엔
        //    이름/이메일이 채워진 사람이 한 명도 없다면 → 실수로 빈 상태를 덮어쓰려는 상황일 가능성이
        //    매우 높으므로 동기화를 건너뛴다. 정상적으로 소수 인원만 쓰는 팀은 5명 미만이라 이 가드에
        //    걸리지 않고, 의도적으로 많은 인원을 정리해서 줄이는 경우도 "채워진 사람 0명"이 아니면 통과함.
        const meaningful = this._meaningfulCount(list);
        if (this._lastKnownServerCount > 5 && meaningful === 0) {
            console.warn(`[AddressBook 안전장치] Drive 동기화 스킵 — 이전엔 ${this._lastKnownServerCount}명이 있었는데 지금 수집된 목록은 전부 빈 값입니다. 실수로 덮어쓰는 사고를 막기 위해 건너뜁니다.`);
            return;
        }
        try {
            const folderId = await window.getOrCreateConfigFolder(token);
            if (!this._driveFileId) this._driveFileId = await window._findOrMigrateFile2(token, this.FILE_NAME, folderId, this._mergeCfg);

            // 💡 [낙관적 동시성 제어] 파일이 이미 있고(=신규 생성이 아니고) 내가 이전에 읽어둔 savedAt이
            //    있다면, 쓰기 직전 Drive의 "지금" savedAt을 한 번 더 확인한다. 그 사이 달라졌다면 —
            //    다른 사람이 나보다 먼저 저장한 것 — 내 오래된 로컬본으로 그 수정을 덮어쓰지 않고 중단한다.
            if (this._driveFileId && this._lastKnownSavedAt) {
                try {
                    const checkResp = await gapi.client.drive.files.get({ fileId: this._driveFileId, alt: 'media', supportsAllDrives: true });
                    const currentSavedAt = checkResp.result && checkResp.result.savedAt;
                    if (currentSavedAt && currentSavedAt !== this._lastKnownSavedAt) {
                        console.warn(`[AddressBook 안전장치] Drive 동기화 중단 — 다른 팀원이 ${currentSavedAt}에 이미 저장했습니다(내가 마지막으로 본 건 ${this._lastKnownSavedAt}). 내 화면의 오래된 내용으로 덮어쓰지 않고, 최신본을 다시 불러옵니다.`);
                        if (window.showToast) window.showToast(window._t('⚠️ 주소록이 다른 팀원에 의해 방금 업데이트되어 저장을 건너뛰고 최신본을 다시 불러왔습니다. 방금 변경사항은 다시 입력해주세요.', '⚠️ The Address Book was just updated by another team member — skipped saving and reloaded the latest version. Please re-enter your recent changes.'), 'warning', 6000);
                        const fresh = await this.loadFromDrive();
                        if (fresh) { window.tabData = window.tabData || {}; window.tabData.addressBook = fresh; if (window.renderAddressTable) window.renderAddressTable(); }
                        return;
                    }
                } catch(checkErr) { console.warn('AddressBook 동시성 확인 실패(그냥 진행):', checkErr.message); }
            }

            const boundary = 'addr_sync_boundary';
            const metadata = { name: this.FILE_NAME, mimeType: 'application/json' };
            if (!this._driveFileId) metadata.parents = [folderId];
            const newSavedAt = new Date().toISOString();
            const body = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata) + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify({ addressBook: list, savedAt: newSavedAt }) + "\r\n--" + boundary + "--";
            const url = 'https://www.googleapis.com/upload/drive/v3/files' + (this._driveFileId ? '/' + this._driveFileId : '') + '?uploadType=multipart&supportsAllDrives=true';
            const resp = await fetch(url, { method: this._driveFileId ? 'PATCH' : 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary="' + boundary + '"' }, body: body });
            const file = await resp.json();
            if (file && file.id) this._driveFileId = file.id;
            if (resp.ok) {
                this._lastKnownServerCount = meaningful; // 성공적으로 반영된 값으로 기준선 갱신
                this._lastKnownSavedAt = newSavedAt;      // 내가 방금 쓴 시각을 새 기준선으로 기록
                this.backupIfNewDay(list); // 🗄️📜 날짜가 바뀐 뒤 처음 저장이면 그날의 상태를 백업
            }
        } catch(e) { console.warn('AddressBook Drive 동기화 실패:', e.message); }
    },
    loadFromDrive: async function() {
        const tokenObj = (window.gapi && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) return null; // 비로그인: 로컬 캐시만 사용
        try {
            const folderId = await window.getOrCreateConfigFolder(token);
            if (!this._driveFileId) this._driveFileId = await window._findOrMigrateFile2(token, this.FILE_NAME, folderId, this._mergeCfg);
            if (!this._driveFileId) return null;
            const response = await gapi.client.drive.files.get({ fileId: this._driveFileId, alt: 'media', supportsAllDrives: true });
            const data = response.result;
            const list = (data && data.addressBook) || [];
            this._lastKnownServerCount = Math.max(this._lastKnownServerCount, this._meaningfulCount(list)); // 💡 방금 Drive에서 실제로 확인한 인원 수를 기준선으로 기록
            if (data && data.savedAt) this._lastKnownSavedAt = data.savedAt; // 💡 낙관적 동시성 제어용 기준선도 함께 갱신
            this.save(list, true); // 로컬 캐시만 갱신 (방금 받은 걸 다시 올릴 필요 없음)
            return list;
        } catch(e) { console.warn('AddressBook Drive 조회 실패:', e.message); return null; }
    },
    // 🗄️📜 [2026-11-11 요청] "NAS 에 여러 버전이 있으면 최신을 기본으로, 필요하면 이전 파일을
    //    열 수 있게" — 지금까지 공유 주소록은 파일 1개를 매번 덮어써서 "이전 버전"이 아예
    //    없었다. 위험한 순간(그룹웨어 전사 주소록으로 **일괄 교체**하는 순간, 그리고 그냥
    //    하루에 한 번)에 현재 내용을 `Backups/AddressBook/` 하위에 타임스탬프 파일로 남긴다
    //    — 프로젝트 백업과 같은 폴더 체계(`_getOrCreateBackupTeamFolder`는 이름만 다를 뿐
    //    "Backups/ 아래 하위 폴더" 범용 헬퍼라 팀명이 아니어도 그대로 쓸 수 있다)·같은
    //    파일명 규칙(`백업_<이름>_<YYYYMMDD>_<HHMM>.json`)이라 js/57 어댑터의
    //    `backupStampOf`가 그대로 날짜를 읽어준다. 실패해도 저장 자체는 막지 않는다.
    backupCurrent: async function(list, reason) {
        try {
            const tokenObj = (window.gapi && gapi.client) ? gapi.client.getToken() : null;
            const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
            if (!token) return false;
            const meaningful = this._meaningfulCount(list);
            if (!meaningful) return false; // 빈 상태는 백업할 가치가 없다(되려 혼란만 더함)
            const folderId = await window._getOrCreateBackupTeamFolder(token, 'AddressBook');
            if (!folderId) return false;
            const now = new Date();
            const ts = now.getFullYear() + String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0')
                + '_' + String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0');
            const backupName = '백업_AddressBook_Shared_' + ts + '.json';
            const boundary = 'addr_backup_boundary';
            const metadata = { name: backupName, mimeType: 'application/json', parents: [folderId] };
            const body = "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata)
                + "\r\n--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify({ addressBook: list, savedAt: now.toISOString() })
                + "\r\n--" + boundary + "--";
            const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary="' + boundary + '"' },
                body: body
            });
            if (!resp.ok) { console.warn('[주소록 백업] 실패(' + (reason || '') + '): HTTP ' + resp.status); return false; }
            console.info('[주소록 백업] ' + backupName + ' 생성(' + meaningful + '명, ' + (reason || '') + ')');
            return true;
        } catch (e) { console.warn('[주소록 백업] 예외(저장 자체엔 영향 없음):', e.message); return false; }
    },
    // 💡 매 편집(3초 디바운스)마다 백업을 쌓으면 금방 수백 개가 된다 — 날짜가 바뀐 뒤 처음
    //    저장될 때만 "그날의 상태"를 남긴다. localStorage에 마지막 백업 날짜를 적어 새로고침
    //    해도 같은 날 중복 백업하지 않는다.
    _backupDayKey: 'gantt_ab_backup_day_v1',
    backupIfNewDay: function(list) {
        const today = new Date().toISOString().slice(0, 10);
        let last = '';
        try { last = localStorage.getItem(this._backupDayKey) || ''; } catch (e) {}
        if (last === today) return;
        try { localStorage.setItem(this._backupDayKey, today); } catch (e) {}
        this.backupCurrent(list, 'daily');
    },
    // 📜 Backups/AddressBook/ 안의 백업 목록(최신순) — "이전 버전 열기" 모달이 쓴다.
    listVersions: async function() {
        const tokenObj = (window.gapi && gapi.client) ? gapi.client.getToken() : null;
        const token = (tokenObj ? tokenObj.access_token : null) || window.googleAccessToken;
        if (!token) return [];
        try {
            const folderId = await window._getOrCreateBackupTeamFolder(token, 'AddressBook');
            if (!folderId) return [];
            const resp = await gapi.client.drive.files.list({
                q: "mimeType='application/json' and trashed=false and '" + folderId + "' in parents",
                fields: 'files(id, name, createdTime, modifiedTime)', orderBy: 'createdTime desc',
                supportsAllDrives: true, includeItemsFromAllDrives: true
            });
            return (resp.result && resp.result.files) || [];
        } catch (e) { console.warn('[주소록 백업] 목록 조회 실패:', e.message); return []; }
    }
};

// 💡 [2026-08-24] skipDriveSync=true로 부르면 로컬 tabData(=프로젝트 자체 저장용 스냅샷)만 갱신하고
//    공용 Drive 주소록에는 밀어쓰지 않는다. 프로젝트 자동저장(collectTabData)이 Address 탭을 보지도
//    않은 채 이 함수를 얼결에 호출해서, 아직 못 받아온 오래된/빈 로컬 캐시로 팀 공용 주소록 전체를
//    덮어쓰는 사고가 실제로 있었음(365명 → 빈 배열 반복 붕괴). 실제 사용자가 Address 탭에서 직접
//    편집(onchange/정렬 등)할 때만 Drive까지 동기화하도록 분리 — 그 호출부들은 인자 없이(기본값 false) 부른다.
window.collectAddressData = function(skipDriveSync) {
    window.tabData = window.tabData || {};
    const rows = [];
    document.querySelectorAll('#address-table-body tr').forEach(function(tr) {
        const get = function(f) { const el = tr.querySelector('[data-field="' + f + '"]'); return el ? el.value : ''; };
        rows.push({ name: get('name'), nameEn: get('nameEn'), dept: get('dept'), title: get('title'), email: get('email'), mobile: get('mobile'), phone: get('phone'), telegramId: get('telegramId') });
    });
    window.tabData.addressBook = rows;
    window.AddressBook.save(rows, skipDriveSync); // 💡 프로젝트와 무관한 공용 저장소에도 반영 (3초 디바운스 후 Drive 동기화) — skipDriveSync면 로컬 캐시만
};

// =========================================================
// 🪪 Address Book — 엑셀/CSV 불러오기 · 내보내기
// =========================================================
// 💡 공용 파싱 로직 — 로컬 파일이든 구글 드라이브에서 받아온 버퍼든 동일하게 처리
window._applyAddressWorkbookBuffer = function(arrayBuffer, sourceLabel) {
    try {
        const wb = XLSX.read(arrayBuffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const pick = function(row, keys) {
            for (const k of keys) { if (row[k] !== undefined && String(row[k]).trim() !== '') return String(row[k]).trim(); }
            return '';
        };
        const list = json.map(function(row) {
            const first = pick(row, ['이름', '성명', 'Name']);
            const last  = pick(row, ['성']);
            return {
                name:  (last + first) || first,
                nameEn: pick(row, ['영문이름', '영문 이름', 'English Name', 'EnglishName', 'Name (English)']),
                dept:  pick(row, ['부서', 'Department']),
                title: pick(row, ['직함', '직책', 'Title']),
                email: pick(row, ['전자 메일 주소', '이메일', 'Email', 'E-mail']),
                mobile: pick(row, ['휴대폰', '휴대전화', 'Mobile']),
                phone: pick(row, ['근무처 전화', '회사 전화', 'Work Phone'])
            };
        }).filter(function(p) { return p.name; });

        window.tabData = window.tabData || {};
        window.tabData.addressBook = list;
        window._addrSelectedRows = new Set();
        window.renderAddressTable();
        alert('✅ ' + (sourceLabel || '파일') + '에서 주소록 ' + list.length + '명을 불러왔습니다.');
        return true;
    } catch (err) {
        alert(window._t('❌ 파일을 읽는 중 오류가 발생했습니다: ', '❌ An error occurred while reading the file: ') + err.message);
        return false;
    }
};

// 🏢 [2026-11-11 요청] "불러오기" = 그룹웨어 주소록(사내 인사 전산망) 조회 → 실패하면 NAS 공유
//    주소록으로 폴백. 전엔 특정 구글 드라이브 시트(고정 파일 id)를 통째로 가져와 **전체 교체**
//    했는데, NAS 전환 이후 그 파일을 못 찾아 손을 못 댄 채로 남아 있었다(사용자 신고).
//    ⚠️ 그룹웨어 조회 결과는 이름/부서/직함/이메일/휴대폰/근무처전화만 준다 — 영문 이름·
//    텔레그램 ID 는 그룹웨어에 없는, **사람이 이 앱에 직접 적어 둔 값**이라 덮어쓰지 않는다
//    (병합, 이름이 같으면 같은 사람으로 본다 — 기존 AddressBook._mergeCfg 와 같은 규칙).
//    ⚠️ 저장은 **새로 만들지 않는다** — `window.AddressBook.save()`(디바운스 후 공유 저장소
//    동기화, NAS 전환 때 어댑터가 이미 그 경로를 NAS 로 돌려놓았다)를 그대로 부른다.
window.importAddressFromGroupware = async function() {
    var _t = window._t ? window._t : function (ko) { return ko; };
    var curList = (window.tabData && window.tabData.addressBook) ? window.tabData.addressBook.slice() : [];
    if (!confirm(_t('그룹웨어 주소록으로 현재 주소록을 갱신합니다(기존에 직접 입력해 둔 영문 이름·텔레그램 ID는 유지됩니다).\n계속할까요?',
                     'This will refresh the current Address Book from the groupware directory (English names/Telegram IDs you entered by hand are kept).\nContinue?'))) return;

    var norm = function (n) { return String(n || '').trim().toLowerCase(); };

    var gwList = null, gwErr = null;
    try {
        if (window._gwEnsureLogin) {
            var g = await window._gwEnsureLogin();
            if (!g || !g.ok) throw new Error((g && g.message) || _t('그룹웨어 로그인이 필요합니다.', 'Groupware login required.'));
        }
        var res = await fetch('http://127.0.0.1:5000/gw/contacts?limit=1000');
        var j = await res.json();
        if (!j || !j.ok) throw new Error((j && j.message) || ('HTTP ' + res.status));
        gwList = j.contacts || [];
    } catch (err) {
        gwErr = err;
        console.warn('[주소록] 그룹웨어 조회 실패 — NAS 공유 주소록으로 폴백:', err.message);
    }

    if (gwList && gwList.length) {
        var byName = new Map();
        curList.forEach(function (p) { var k = norm(p.name); if (k && !byName.has(k)) byName.set(k, p); });
        var merged = gwList.map(function (c) {
            var k = norm(c.name);
            var old = byName.get(k) || {};
            byName.delete(k);
            return {
                name: c.name || old.name || '',
                nameEn: old.nameEn || '',           // 그룹웨어엔 없다 — 사람이 적은 값만 유지
                dept: c.dept || old.dept || '',
                title: c.position || old.title || '',
                email: c.email || old.email || '',
                mobile: c.mobile || old.mobile || '',
                phone: c.tel || old.phone || '',
                telegramId: old.telegramId || ''    // 그룹웨어엔 없다 — 사람이 적은 값만 유지
            };
        });
        // 그룹웨어 검색에 안 걸린 기존 인원(협력사 등 외부 연락처)은 지우지 않고 그대로 둔다.
        byName.forEach(function (p) { merged.push(p); });

        // 🗄️📜 [2026-11-11] 394명짜리 일괄 교체 **직전** 상태를 먼저 남긴다 — 이게 실제로
        //    위험한 순간이다(그룹웨어가 모르는 외부 연락처는 안 지우지만, 혹시라도 잘못
        //    병합되면 되돌아올 다리가 필요하다). 저장을 막지 않도록 기다리지 않는다.
        window.AddressBook.backupCurrent(curList, 'groupware-import-before').catch(function() {});

        window.tabData = window.tabData || {};
        window.tabData.addressBook = merged;
        window._addrSelectedRows = new Set();
        window.renderAddressTable();
        window.AddressBook.save(merged); // 공유 저장소(NAS) 동기화 — 디바운스 3초
        alert('✅ ' + _t('그룹웨어 주소록 ' + gwList.length + '명을 반영했습니다(공유 저장소에도 자동 반영됩니다).',
                         'Applied ' + gwList.length + ' contacts from the groupware directory (also synced to the shared store).'));
        return;
    }

    // 그룹웨어를 못 썼을 때만 — 이미 공유 저장소에 있는 최신본을 다시 받아온다(새 경로 아님).
    var nasList = (window.AddressBook && window.AddressBook.loadFromDrive) ? await window.AddressBook.loadFromDrive() : null;
    if (nasList) {
        window.tabData = window.tabData || {};
        window.tabData.addressBook = nasList;
        window._addrSelectedRows = new Set();
        window.renderAddressTable();
        alert('⚠️ ' + _t('그룹웨어 주소록을 불러오지 못해 공유 저장소(NAS)의 주소록 ' + nasList.length + '명을 대신 불러왔습니다.\n사유: ' + (gwErr ? gwErr.message : ''),
                         'Could not reach the groupware directory, so loaded the ' + nasList.length + ' contacts already shared on NAS instead.\nReason: ' + (gwErr ? gwErr.message : '')));
    } else {
        alert('❌ ' + _t('그룹웨어·공유 저장소(NAS) 둘 다 불러오지 못했습니다.\n사유: ' + (gwErr ? gwErr.message : '알 수 없음'),
                         'Could not load from either the groupware directory or the shared NAS store.\nReason: ' + (gwErr ? gwErr.message : 'unknown')));
    }
};

// =========================================================
// 📜 [2026-11-11 요청] "이전 버전 열기" — Backups/AddressBook/ 에 쌓인 과거 시점을 사람이
// 직접 골라 적용할 수 있게 한다. 프로젝트 복원 모달(showBackupFileModal, js/04c)과 같은
// DOM 틀(#drive-file-modal-overlay 등)을 재사용 — 새 모달 HTML을 또 만들지 않는다.
// =========================================================
window.openAddressBookVersionModal = async function() {
    var _t = window._t ? window._t : function (ko) { return ko; };
    if (!window.AddressBook) return;
    var files = await window.AddressBook.listVersions();
    if (!files.length) {
        if (window.showToast) window.showToast(_t(
            '📜 저장된 이전 버전이 없습니다(앞으로 저장될 때마다 쌓입니다).',
            '📜 No earlier versions saved yet (they accumulate from here on).'
        ), 'info', 5000);
        else alert(_t('📜 저장된 이전 버전이 없습니다(앞으로 저장될 때마다 쌓입니다).', '📜 No earlier versions saved yet (they accumulate from here on).'));
        return;
    }
    var listContainer = document.getElementById('drive-file-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    var _title = document.getElementById('drive-modal-title');
    if (_title) _title.textContent = _t('📜 주소록 이전 버전', '📜 Address Book — earlier versions');
    var _desc = document.getElementById('drive-modal-desc');
    if (_desc) _desc.textContent = _t(
        '열어볼 시점을 선택해 주세요. 선택하면 지금 주소록에 적용되고(지금 내용은 자동 백업됩니다), 공유 저장소에도 반영됩니다.',
        'Pick a point to open. Applying it replaces the current Address Book (the current content is backed up first) and syncs to the shared store.'
    );
    var _actionSlot = document.getElementById('drive-modal-action-slot');
    if (_actionSlot) _actionSlot.innerHTML = '';

    files.forEach(function(file) {
        var d = new Date(file.createdTime || file.modifiedTime);
        var dateStr = isNaN(d.getTime()) ? file.name : (d.toLocaleDateString() + ' ' + d.toLocaleTimeString());
        var row = document.createElement('div');
        row.style.cssText = 'padding:9px 14px; border:1px solid #a5c8f0; border-radius:8px; cursor:pointer; '
            + 'transition:background .15s, border-color .15s; display:flex; justify-content:space-between; align-items:center; background:#e8f4fd;';
        row.onmouseover = function() { row.style.background = '#cfe6fa'; row.style.borderColor = '#7fb0dd'; };
        row.onmouseout  = function() { row.style.background = '#e8f4fd'; row.style.borderColor = '#a5c8f0'; };
        row.onclick = function() { window._abOpenVersion(file.id, file.name); };
        row.innerHTML = '<div style="font-weight:bold; color:#333; font-size:14px;">📜 ' + dateStr + '</div>'
                      + '<div style="font-size:12px; color:#868e96;">' + file.name + '</div>';
        listContainer.appendChild(row);
    });
    var overlay = document.getElementById('drive-file-modal-overlay');
    if (overlay) overlay.style.display = 'flex';
};

window._abOpenVersion = async function(fileId, fileName) {
    var _t = window._t ? window._t : function (ko) { return ko; };
    if (window.closeDriveModal) window.closeDriveModal();
    if (!confirm(_t(
        '이 시점으로 주소록을 교체합니다(지금 내용은 자동 백업되어 나중에 다시 열 수 있습니다).\n계속할까요?',
        'This will replace the Address Book with this point in time (the current content is backed up first, so it can be reopened later).\nContinue?'
    ))) return;
    try {
        var curList = (window.tabData && window.tabData.addressBook) ? window.tabData.addressBook.slice() : [];
        await window.AddressBook.backupCurrent(curList, 'before-open-version'); // 되돌아올 다리를 먼저 놓는다
        var resp = await gapi.client.drive.files.get({ fileId: fileId, alt: 'media', supportsAllDrives: true });
        var data = resp.result;
        var list = (data && data.addressBook) || [];
        window.tabData = window.tabData || {};
        window.tabData.addressBook = list;
        window._addrSelectedRows = new Set();
        window.renderAddressTable();
        window.AddressBook.save(list); // 공유 저장소(NAS)에도 반영 — 디바운스 3초
        if (window.showToast) window.showToast('✅ ' + _t(fileName + ' 을(를) 적용했습니다(' + list.length + '명).', 'Applied ' + fileName + ' (' + list.length + ' contacts).'), 'success', 6000);
        else alert('✅ ' + _t(fileName + ' 을(를) 적용했습니다(' + list.length + '명).', 'Applied ' + fileName + ' (' + list.length + ' contacts).'));
    } catch (e) {
        alert('❌ ' + _t('이전 버전을 여는 중 오류: ', 'Error opening the earlier version: ') + e.message);
    }
};

// 🔘 "📜 이전 버전" 버튼을 표준 "📂 불러오기" 버튼 묶음(js/42, `#px-btns-address`) 바로 뒤에
// 런타임으로 꽂는다. HTML을 또 고치지 않는 이유 — `#px-btns-address`는 **안쪽 innerHTML만**
// 탭 전환/클릭마다 다시 그려진다(_pxRenderButtons). 그 안쪽에 넣으면 금방 지워지므로,
// 그 span **바로 다음 형제**로 넣어야 살아남는다(js/42의 홀더 자체는 재사용되고 비워지지 않음).
window._abEnsureVersionBtn = function() {
    if (document.getElementById('ab-version-btn')) return;
    var holder = document.getElementById('px-btns-address');
    if (!holder || !holder.parentNode) return;
    var _t = window._t ? window._t : function (ko) { return ko; };
    var btn = document.createElement('button');
    btn.id = 'ab-version-btn';
    btn.type = 'button';
    btn.title = _t('지금까지 자동으로 쌓인 이전 버전을 열어봅니다.', 'Open an earlier automatically-saved version.');
    btn.onclick = function() { window.openAddressBookVersionModal(); };
    btn.textContent = _t('📜 이전 버전', '📜 Earlier versions');
    btn.style.cssText = 'white-space:nowrap; padding:6px 8px; background:#e0f5f7; color:#00707d; border:none;'
        + ' border-radius:6px; font-size:13px; font-weight:bold; cursor:pointer; line-height:1.2;'
        + ' transition:background .15s; margin-right:4px;';
    btn.onmouseover = function() { btn.style.background = '#a3d9e0'; };
    btn.onmouseout  = function() { btn.style.background = '#e0f5f7'; };
    holder.insertAdjacentElement('afterend', btn);
};
(function() {
    var _boot = function() { try { window._abEnsureVersionBtn(); } catch (e) {} };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _boot);
    else _boot();
    // 💡 Address 탭이 처음 그려지는 시점(= 탭 클릭)을 놓치지 않으려고 js/42와 같은 패턴 재사용.
    document.addEventListener('click', function(e) {
        var t = e.target;
        if (t && t.closest && t.closest('button, a, [onclick]')) setTimeout(_boot, 150);
    }, true);
})();


