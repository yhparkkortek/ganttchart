// =========================================================
// 🚀 37-project-cache.js — 프로젝트 데이터 3-Layer 캐시
//
// Layer 1: 인메모리 캐시 + dirty flag
//   - Map<fileId, { snapshot, fetchedAt }> — 시트 닫힌 후에도 15분 보존
//   - executeLoadFile: Drive 요청 전 캐시 확인 → 히트 시 즉시 복원
//   - closeSheet: 닫기 전 스냅샷을 캐시에 저장
//   - saveToGoogleDrive 완료 후 캐시 갱신
//
// Layer 2: Drive 쓰기 디바운스 (30초)
//   - 짧은 시간 안에 연속으로 발생하는 저장 요청을 1회로 합침
//   - 수동 저장·시트 전환·탭 닫기는 즉시 플러시
//
// Layer 3: 파일 목록 열릴 때 pre-fetch
//   - 최근 수정된 3개 프로젝트를 백그라운드에서 미리 캐시
// =========================================================
(function() {
    'use strict';

    // ── 공통: 스냅샷 ↔ Drive JSON 변환 ────────────────────────────────────────
    // Drive JSON globalData: [{data:[...], _prop:...}, ...]
    // 스냅샷 globalData:     [array(row with _props), ...]
    function _deserializeGlobalData(driveArr) {
        return (driveArr || []).map(function(obj) {
            var row = obj.data ? Array.from(obj.data) : [];
            // 💡 [2026-10-28] _wbsCollapsed(WBS 접힘 화면 상태)는 제외 — 04c _serializeGD 주석 참고.
            //    여기서 만든 스냅샷은 Layer3 pre-fetch로 "아직 한 번도 안 연" 프로젝트를 캐시해두는
            //    용도라, 옛 저장분에 그 값이 남아있어도 무시해야 다음에 열 때 0레벨로 시작한다.
            for (var k in obj) { if (k !== 'data' && k !== '_wbsCollapsed') row[k] = obj[k]; }
            return row;
        });
    }
    function _serializeGlobalData(rows) {
        return (rows || []).map(function(row) {
            var obj = { data: Array.from(row) };
            for (var k in row) { if (k.startsWith('_')) obj[k] = row[k]; }
            return obj;
        });
    }

    // Drive JSON → 스냅샷 형식으로 변환 (pre-fetch 결과 저장용)
    function _driveJsonToSnapshot(d, fileId, fileName) {
        return {
            globalData: _deserializeGlobalData(d.globalData),
            colIdx: d.colIdx || null,
            filterColumns: d.filterColumns || null,
            currentFilters: null,
            existingDevStages: null,
            projectMeta: d.projectMeta || {},
            tabData: d.tabData || {},
            projectDistributions: d.distributions || [],
            changeLogs: d.changeLogs || [],
            lastSavedLogCount: (d.changeLogs || []).length,
            currentDriveFileId: fileId,
            currentDriveFileName: fileName,
            scheduleBaselines: d.scheduleBaselines || [],
            aiLearning: d.aiLearning || null,
            qaQuestionFreq: d.qaQuestionFreq || null,
            topicProfile: d.topicProfile || null
        };
    }

    // ── Layer 1: 캐시 저장소 ───────────────────────────────────────────────────
    var _CACHE_TTL_MS = 15 * 60 * 1000; // 15분
    window._pcCache = new Map(); // fileId → { snapshot, fetchedAt, fileName }

    window._pcGet = function(fileId) {
        var entry = window._pcCache.get(fileId);
        if (!entry) return null;
        if (Date.now() - entry.fetchedAt > _CACHE_TTL_MS) {
            window._pcCache.delete(fileId);
            return null;
        }
        return entry;
    };

    window._pcSetSnapshot = function(fileId, fileName, snapshot) {
        window._pcCache.set(fileId, {
            snapshot: snapshot,
            fileName: fileName,
            fetchedAt: Date.now()
        });
    };

    window._pcDelete = function(fileId) { window._pcCache.delete(fileId); };

    // 현재 활성 프로젝트를 캐시에 저장 (Drive 저장 완료 후·전환 전 등)
    window._pcCacheCurrentProject = function() {
        var fileId = window.currentDriveFileId;
        if (!fileId) return;
        if (typeof globalData === 'undefined' || !globalData) return;
        var snap = window._snapshotCurrentSheet ? window._snapshotCurrentSheet() : null;
        if (!snap) return;
        window._pcSetSnapshot(fileId, window.currentDriveFileName || '', snap);
        console.info('[PC] 현재 프로젝트 캐시됨:', fileId);
    };

    // ── Layer 1 훅: executeLoadFile ────────────────────────────────────────────
    function _patchExecuteLoadFile() {
        if (typeof window.executeLoadFile !== 'function') return;
        var _orig = window.executeLoadFile;
        window.executeLoadFile = async function(fileId, fileName, silent) {
            // 이미 시트로 열려있으면 원래 로직
            if (window._findSheetByFileId && window._findSheetByFileId(fileId)) {
                return _orig.call(this, fileId, fileName, silent);
            }
            // 캐시 확인
            var cached = window._pcGet(fileId);
            if (cached) {
                console.info('[PC] 캐시 히트 — Drive 요청 없이 즉시 복원:', fileId);
                window.closeDriveModal && window.closeDriveModal();
                // 새 시트 슬롯 등록 후 스냅샷 복원
                window._openAsNewSheet && window._openAsNewSheet(fileId, fileId, fileName || cached.fileName);
                // 💡 [2026-10-28] 두 번째 인자 true = "진짜 새로 프로젝트 열기" — WBS 접힘 상태를 강제로
                //    초기화한다(이 캐시가 Layer1처럼 "방금 닫을 때의 펼침 상태"를 그대로 들고 있어도).
                window._restoreSheetSnapshot && window._restoreSheetSnapshot(cached.snapshot, true);
                // executeLoadFile에서 하는 추가 초기화
                if (window._ensureRowUids) window._ensureRowUids();
                if (window._captureMergeBaseline) window._captureMergeBaseline(fileId);
                if (window.renderSheetTabsBar) window.renderSheetTabsBar();
                window._compareTargetId = null;
                // 스냅샷에 schedule baselines 포함돼있으면 복원
                var snap = cached.snapshot;
                if (snap.scheduleBaselines && snap.scheduleBaselines.length) {
                    window._scheduleBaselines = snap.scheduleBaselines;
                    if (typeof persistScheduleBaselines === 'function') persistScheduleBaselines();
                } else if (window.loadScheduleBaselines) {
                    window.loadScheduleBaselines();
                }
                // pre-fetch로 받아온 항목이면 AI 학습 데이터 merge
                if (snap.aiLearning && snap.aiLearning.length && window._alMergeFromDrive) {
                    window._alMergeFromDrive(snap.aiLearning, fileId);
                }
                if (snap.qaQuestionFreq && snap.qaQuestionFreq.length && window._ganttQaMergeFreqFromDrive) {
                    window._ganttQaMergeFreqFromDrive(snap.qaQuestionFreq, fileId);
                }
                if (snap.topicProfile && fileId) {
                    try {
                        // 💡 [2026-10-29] 캐시 스냅샷은 사람 편집보다 오래됐을 수 있다 — js/26이 더 최근 쪽을 고른다
                        if (window._tpAdoptStoredProfile) {
                            if (window._tpAdoptStoredProfile(fileId, snap.topicProfile)) window._nonGanttDirty = true;
                        } else {
                            var _tpC = JSON.parse(localStorage.getItem('gantt_topic_profile_v1') || '{}');
                            _tpC[fileId] = snap.topicProfile;
                            localStorage.setItem('gantt_topic_profile_v1', JSON.stringify(_tpC));
                        }
                    } catch(e) {}
                    window._refreshTopicProfileBadge && window._refreshTopicProfileBadge();
                }
                if (window._checkReassignQueueOnLoad) window._checkReassignQueueOnLoad();
                if (window._checkLocalBackupOnOpen) {
                    window._checkLocalBackupOnOpen(fileId, (snap.changeLogs || []).length);
                }
                if (!silent && window.showToast) {
                    window.showToast(
                        window._t('⚡ 캐시에서 즉시 열림: ' + (fileName || cached.fileName),
                                  'Opened from cache: '   + (fileName || cached.fileName))
                    );
                }
                return;
            }
            // 캐시 미스 → 원래 Drive 요청 경로
            var result = await _orig.call(this, fileId, fileName, silent);
            // Drive fetch 완료 후 캐시에 저장
            if (window.currentDriveFileId === fileId) {
                window._pcCacheCurrentProject();
            }
            return result;
        };
    }

    // ── Layer 1 훅: closeSheet ─────────────────────────────────────────────────
    // 닫기 전 해당 시트의 데이터를 캐시에 보존
    function _patchCloseSheet() {
        if (typeof window.closeSheet !== 'function') return;
        var _orig = window.closeSheet;
        window.closeSheet = function(key) {
            if (window._sheets) {
                var sheet = window._sheets.find(function(s) { return s.key === key; });
                if (sheet && sheet.fileId) {
                    if (key === window._activeSheetKey) {
                        // 활성 시트: 현재 전역 변수에서 직접 스냅샷
                        window._pcCacheCurrentProject();
                    } else if (sheet.snapshot) {
                        // 비활성 시트: 이미 저장된 스냅샷 사용
                        window._pcSetSnapshot(sheet.fileId, sheet.fileName || '', sheet.snapshot);
                        console.info('[PC] 비활성 시트 캐시됨:', sheet.fileId);
                    }
                }
            }
            return _orig.call(this, key);
        };
    }

    // ── Layer 2: Drive 쓰기 디바운스 ──────────────────────────────────────────
    var _DEBOUNCE_MS = 30000; // 30초
    var _debounceTimer = null;

    // 디바운스 저장 예약 (연속 편집 시 마지막 30초 후 1회만 저장)
    window._pcScheduleSave = function() {
        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(function() {
            _debounceTimer = null;
            if (!window.currentDriveFileId) return;
            if (!window._hasUnsavedChangesNow || !window._hasUnsavedChangesNow()) return;
            if (window.saveToGoogleDrive) {
                window.saveToGoogleDrive({ suppressAlert: true });
            }
        }, _DEBOUNCE_MS);
    };

    // 즉시 플러시 (시트 전환·탭 닫기·수동 저장 전에 호출)
    window._pcFlushSave = function() {
        if (!_debounceTimer) return;
        clearTimeout(_debounceTimer);
        _debounceTimer = null;
        if (!window.currentDriveFileId) return;
        if (!window._hasUnsavedChangesNow || !window._hasUnsavedChangesNow()) return;
        if (window.saveToGoogleDrive) {
            window.saveToGoogleDrive({ suppressAlert: true });
        }
    };

    // ── Layer 2 훅: saveToGoogleDrive 완료 후 캐시 갱신 ──────────────────────
    function _patchSaveToGoogleDrive() {
        if (typeof window.saveToGoogleDrive !== 'function') return;
        var _orig = window.saveToGoogleDrive;
        window.saveToGoogleDrive = async function(opts) {
            var result = await _orig.call(this, opts);
            // 저장 성공 시 캐시 최신화
            if (result !== false && window.currentDriveFileId) {
                window._pcCacheCurrentProject();
            }
            return result;
        };
    }

    // ── Layer 3: 파일 목록 모달 오픈 시 pre-fetch ─────────────────────────────
    function _patchShowDriveFileModal() {
        if (typeof window.showDriveFileModal !== 'function') return;
        var _orig = window.showDriveFileModal;
        window.showDriveFileModal = function(files, mode, indexProjects) {
            _orig.call(this, files, mode, indexProjects);
            if (mode !== 'open' || !files || !files.length) return;
            // 캐시·시트에 없는 파일만, 최근 수정순 상위 3개 선반입
            var toFetch = files
                .filter(function(f) {
                    if (!f || !f.id) return false;
                    if (window._pcGet(f.id)) return false;
                    if (window._findSheetByFileId && window._findSheetByFileId(f.id)) return false;
                    return true;
                })
                .sort(function(a, b) {
                    return new Date(b.modifiedTime || 0) - new Date(a.modifiedTime || 0);
                })
                .slice(0, 3);
            if (!toFetch.length) return;
            // 모달 렌더링이 끝난 뒤 백그라운드로 선반입
            setTimeout(function() { _prefetchNext(toFetch, 0); }, 1500);
        };
    }

    function _prefetchNext(files, idx) {
        if (idx >= files.length) return;
        var file = files[idx];
        if (!file || !file.id) { _prefetchNext(files, idx + 1); return; }
        if (window._pcGet(file.id) || (window._findSheetByFileId && window._findSheetByFileId(file.id))) {
            _prefetchNext(files, idx + 1);
            return;
        }
        if (!window.gapi || !gapi.client || !gapi.client.drive) return;
        gapi.client.drive.files.get({ fileId: file.id, alt: 'media', supportsAllDrives: true })
            .then(function(resp) {
                if (resp && resp.result && resp.result.globalData) {
                    var snap = _driveJsonToSnapshot(resp.result, file.id, file.name);
                    window._pcSetSnapshot(file.id, file.name, snap);
                    console.info('[PC] pre-fetch 완료:', file.name);
                }
                setTimeout(function() { _prefetchNext(files, idx + 1); }, 400);
            })
            .catch(function(err) {
                console.warn('[PC] pre-fetch 실패:', file.name, err.message || err);
                setTimeout(function() { _prefetchNext(files, idx + 1); }, 400);
            });
    }

    // ── Layer 4: 탭 전환 시 recalculateSchedules 경량화 ──────────────────────
    // 이미 열려 있는 시트 탭 간 전환은 globalData가 이미 계산 완료 상태이므로
    // 날짜 트리 재계산·Undo 스냅샷·toast를 스킵하고 뷰 범위+필터+렌더만 처리.
    function _patchSwitchToSheet() {
        if (typeof window.switchToSheet !== 'function') return;
        var _origSwitch = window.switchToSheet;
        window.switchToSheet = function(key) {
            window._pcTabSwitching = true;
            try {
                return _origSwitch.call(this, key);
            } finally {
                window._pcTabSwitching = false;
            }
        };
    }

    function _patchRecalcForTabSwitch() {
        if (typeof window.recalculateSchedules !== 'function') return;
        var _origRecalc = window.recalculateSchedules;
        window.recalculateSchedules = function() {
            if (!window._pcTabSwitching) {
                return _origRecalc.apply(this, arguments);
            }
            // 탭 전환 전용 경량 경로:
            //   스냅샷의 globalData에 _calcStartTs/_calcPlanTs가 이미 세팅돼 있으므로
            //   날짜 트리 재계산을 스킵. recomputeGanttViewRange/generateFilters는
            //   _restoreSheetSnapshot 이 직접 renderTable 호출하기 전에 동기로 완료.
            if (window.recomputeGanttViewRange) window.recomputeGanttViewRange();
            if (window.generateFilters) window.generateFilters(globalData);
            // applyFilters/검색/하이라이트는 renderTable 완료 후 defer
            setTimeout(function() {
                if (typeof applyFilters === 'function') applyFilters();
                if (window.ganttSearchInit) window.ganttSearchInit();
                if (window.ganttSearchObserve) window.ganttSearchObserve();
                if (typeof window.syncRowHighlight === 'function') window.syncRowHighlight();
            }, 0);
        };
    }

    // ── 패치 적용 ─────────────────────────────────────────────────────────────
    // 이 파일은 04c 이후에 로드되므로 대상 함수들이 이미 정의돼 있음
    _patchExecuteLoadFile();
    _patchCloseSheet();
    _patchSaveToGoogleDrive();
    _patchShowDriveFileModal();
    _patchSwitchToSheet();
    _patchRecalcForTabSwitch();

    console.info('[PC] 초기화 완료 (Layer1:캐시, Layer2:디바운스, Layer3:pre-fetch, Layer4:탭전환 경량화)');
})();
