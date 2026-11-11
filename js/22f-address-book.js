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
    save: function(list, skipSync) {
        localStorage.setItem(this.KEY, JSON.stringify(list));
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


