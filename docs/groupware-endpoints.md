# 📡 그룹웨어 엔드포인트 인벤토리 (모듈별)

2026-10-19 전수 조사 결과. 두 가지 출처를 **구분해서** 적는다.

- **화면 진입 시 실제 호출** — CDP Network로 관찰한 것. 경로·파라미터 모두 확정.
- **번들 추출** — 로드된 JS에서 `/api/...` 문자열만 긁은 것. **호출하지 않았다.**
  경로가 존재한다는 사실만 알 뿐 **파라미터 이름·허용값은 모른다.** 쓰기성도 섞여 있다.

> ⚠️ 번들 목록을 보고 바로 호출하지 말 것. 추측한 경로 12개가 전부 404였고,
> 파라미터는 더 안 맞는다(메일 `keyWord` 사례). 쓰려면 그 화면을 열어 관찰부터.
> 모든 화면에 공통으로 끼는 프레임워크 호출(`/api/user/session`, `/api/my/noti/*`,
> `/api/today/badge` 등)은 잡음이라 여기서 뺐다.
>
> 상세·함정은 `docs/groupware.md`, 결재양식 97개는 `docs/groupware-forms.md`.

## 전자결재 — `/app/approval`

**화면 진입/조작 시 실제 호출**(관찰 확정):
```
GET /api/approval/apprconfig
GET /api/approval/apprform/tree
GET /api/approval/apprform/tree?folderId=100
GET /api/approval/apprform/tree?folderId=110
GET /api/approval/apprform/tree?folderId=20
GET /api/approval/apprform/tree?folderId=30
GET /api/approval/apprform/tree?folderId=31
GET /api/approval/apprform/tree?folderId=40
GET /api/approval/apprform/tree?folderId=41
GET /api/approval/apprform/tree?folderId=42
GET /api/approval/apprform/tree?folderId=43
GET /api/approval/apprform/tree?folderId=61
GET /api/approval/apprform/tree?folderId=62
GET /api/approval/apprform/tree?folderId=70
GET /api/approval/apprform/tree?folderId=71
GET /api/approval/apprform/tree?folderId=72
GET /api/approval/apprform/tree?folderId=73
GET /api/approval/deptfolder/draft/245?page=0&offset=20&property=draftedAt&direction=desc&searchtype=&keyword=&fromDate=&toDate=&duration=all
GET /api/approval/doclist/approve/all?page=0&offset=20&property=draftedAt&direction=desc&searchtype=&keyword=&fromDate=&toDate=&duration=all
GET /api/approval/doclist/approve/complete/count?
GET /api/approval/doclist/draft/all?page=0&offset=20&property=draftedAt&direction=desc&searchtype=&keyword=&fromDate=&toDate=&duration=all
GET /api/approval/doclist/draft/all?page=0&offset=20&property=formName&direction=desc&searchtype=&keyword=&fromDate=&toDate=&duration=all
GET /api/approval/doclist/draft/all?page=0&offset=20&property=formName&direction=desc&searchtype=formName&keyword=%EC%9B%90%EC%9E%90%EC%9E%AC&fromDate=&toDate=&duration=12
GET /api/approval/doclist/draft/all?page=0&offset=20&property=formName&direction=desc&searchtype=title&keyword=%EC%8A%B9%EC%9D%B8&fromDate=&toDate=&duration=6
GET /api/approval/doclist/draft/all?page=1&offset=20&property=formName&direction=desc&searchtype=&keyword=&fromDate=&toDate=&duration=all
GET /api/approval/doclist/draft/complete/count?
GET /api/approval/doclist/draft/complete/count?searchtype=formName&keyword=%EC%9B%90%EC%9E%90%EC%9E%AC&duration=12
GET /api/approval/doclist/draft/complete/count?searchtype=title&keyword=%EC%8A%B9%EC%9D%B8&duration=6
GET /api/approval/doclist/tempsave/all?page=0&offset=20&property=updatedAt&direction=desc&searchtype=&keyword=
GET /api/approval/doclist/viewer/all?page=0&offset=20&property=document.draftedAt&direction=desc&searchtype=&keyword=&fromDate=&toDate=&duration=all
GET /api/approval/doclist/viewer/complete/count?
GET /api/approval/doclistField/appr_wait
GET /api/approval/doclistField/dept_complete
GET /api/approval/doclistField/user_approval
GET /api/approval/doclistField/user_draft
GET /api/approval/doclistField/user_ref
GET /api/approval/doclistField/user_temp
GET /api/approval/document/219780
GET /api/approval/document/219780/comment
GET /api/approval/home/complete
GET /api/approval/home/draft
GET /api/approval/home/reception
GET /api/approval/home/todo?page=0
GET /api/approval/officialtodo/count
GET /api/approval/securitylevel?docId=219780
GET /api/approval/side
GET /api/approval/todo/count
GET /api/approval/todoreception/count
GET /api/approval/todoviewer/count
GET /api/approval/upcoming/count
GET /api/approval/upcoming?page=0&offset=20&property=activityGroup.apprFlow.document.draftedAt&direction=desc&searchtype=&keyword=&fromDate=&toDate=&duration=all
GET /api/search/approval?stype=simple&type=approval&keyword=%EC%8A%B9%EC%9D%B8&fromDate=1970-01-01T00%3A00%3A00.000%2B09%3A00&toDate=2026-10-19T23%3A59%3A59.000%2B09%3A00&page=0&offset=20
GET /api/search/approval?stype=simple&type=approval&keyword=%EC%8A%B9%EC%9D%B8&fromDate=1970-01-01T00%3A00%3A00.000%2B09%3A00&toDate=2026-10-19T23%3A59%3A59.000%2B09%3A00&page=0&offset=40
```

**번들 추출**(호출 안 함):

`/api/approval` · `/api/approval/` · `/api/approval/$REPLACE/document` · `/api/approval/actcopyform` · `/api/approval/actcopyform/` · `/api/approval/apprform/` · `/api/approval/auth/docmanage` · `/api/approval/authBulkComplete` · `/api/approval/authBulkReceive` · `/api/approval/classify/dept/` · `/api/approval/classify/dept/owner/` · `/api/approval/classify/dept/rule/reorder/` · `/api/approval/classify/owner` · `/api/approval/classify/user/` · `/api/approval/classify/user/rule` · `/api/approval/classify/user/rule/reorder` · `/api/approval/company/official` · `/api/approval/companyfolder/` · `/api/approval/companyfolder/ismanager` · `/api/approval/companyfolder/tree` · `/api/approval/deptfolder` · `/api/approval/deptfolder/` · `/api/approval/deptfolder/draft/` · `/api/approval/deptfolder/official/` · `/api/approval/deptfolder/reference/` · `/api/approval/doclist/approve/` · `/api/approval/doclist/draft/` · `/api/approval/doclist/tempsave/` · `/api/approval/doclist/userofficial/` · `/api/approval/doclist/viewer/` · `/api/approval/document` · `/api/approval/document/` · `/api/approval/document/bulkdraft` · `/api/approval/document/contentpreview/preview` · `/api/approval/drafterdeptfolder` · `/api/approval/favorite` · `/api/approval/favorite/` · `/api/approval/manage/document` · `/api/approval/manage/document/addreaders` · `/api/approval/official` · `/api/approval/official/addreceiver` · `/api/approval/official/approve` · `/api/approval/official/cancel` · `/api/approval/official/rerequest` · `/api/approval/official/return` · `/api/approval/reception/count` · `/api/approval/todo/` · `/api/approval/userfolder` · `/api/approval/userfolder/` · `/api/approval/usersetting/deputy` · `/api/approval/usersetting/deputy/` · `/api/approval/usersetting/password` · `/api/approval/usersetting/userconfig` · `/api/docfolder` · `/api/docfolder/`

## 게시판 — `/app/board`

**화면 진입/조작 시 실제 호출**(관찰 확정):
```
GET /api/board/10
GET /api/board/10/post/30459/classic
GET /api/board/10/post/30459/comment?offset=1000&offset=1000
GET /api/board/10/posts/30459/classic/tiny?sorts=sortCriteria+desc%2CthreadRootCode+desc%2CthreadCode+asc
GET /api/board/10/posts/classic/notice?page=0&sorts=sortCriteria+desc%2CthreadRootCode+desc%2CthreadCode+asc
GET /api/board/10/posts/classic?page=0&offset=20&sorts=sortCriteria+desc%2CthreadRootCode+desc%2CthreadCode+asc
GET /api/board/130
GET /api/board/130/posts/classic/notice?page=0&sorts=sortCriteria+desc%2CthreadRootCode+desc%2CthreadCode+asc
GET /api/board/130/posts/classic?page=0&offset=20&sorts=sortCriteria+desc%2CthreadRootCode+desc%2CthreadCode+asc
GET /api/board/company/boardsWithIp
GET /api/board/favorite?page=0&offset=1000
GET /api/board/home/exposure
GET /api/board/myhome/all?page=0&offset=15&url_type=all
GET /api/boardconfig
```

**번들 추출**(호출 안 함):

`/api/board` · `/api/board/` · `/api/board/menu/` · `/api/board/menu/communities` · `/api/board/menu/target/lowrank` · `/api/board/menu/target/owners` · `/api/board/myhome` · `/api/community`

## 커뮤니티 — `/app/community`

**화면 진입/조작 시 실제 호출**(관찰 확정):
```
GET /api/community/home/feed/exposure
GET /api/community/list/all?page=0&offset=10&property=memberCount
GET /api/community/list/menu
GET /api/community/myfeed?page=0&offset=15
```

**번들 추출**(호출 안 함):

`/api/board` · `/api/board/` · `/api/board/favorite` · `/api/board/menu/` · `/api/board/menu/communities` · `/api/board/menu/target/owners` · `/api/community` · `/api/community/` · `/api/community/create` · `/api/community/info` · `/api/community/join` · `/api/community/leave` · `/api/communityconfig`

## 문서관리 — `/app/docs`

**화면 진입/조작 시 실제 호출**(관찰 확정):
```
GET /api/docs/approvewaiting/count
GET /api/docs/folder/approvewaiting?offset=5
GET /api/docs/folder/favorite?offset=1000
GET /api/docs/folder/latestread?offset=10
GET /api/docs/folder/registwaiting?offset=5
GET /api/docs/folder/side
GET /api/docs/registwaiting/count
```

**번들 추출**(호출 안 함):

`/api/docs` · `/api/docs/approved` · `/api/docs/folder` · `/api/docs/folder/` · `/api/docs/foler/` · `/api/docs/requestwaiting`

## 예약 — `/app/asset`

**화면 진입/조작 시 실제 호출**(관찰 확정):
```
GET /api/asset
GET /api/asset/81/item/?page=0&offset=100
GET /api/asset/81/items/daily?fromDate=2026-10-19T00%3A00%3A00.000%2B09%3A00
GET /api/asset/my/reservation/remnant
GET /api/asset/reservation
GET /api/asset/share
```

**번들 추출**(호출 안 함):

`/api/asset/` · `/api/asset/item`

## 설문 — `/app/survey`

**화면 진입/조작 시 실제 호출**(관찰 확정):
```
GET /api/survey/list/latest?offset=20&page=0&property=&direction=desc
GET /api/survey/list/todo?page=0&offset=6&property=id&direction=desc
```

**번들 추출**(호출 안 함):

`/api/survey` · `/api/survey/` · `/api/survey/list/`

## 자료실 — `/app/webfolder`

**화면 진입/조작 시 실제 호출**(관찰 확정):
```
GET /api/webfolder/folder/list?path=%2F&fullPath=%2F&currentPage=1&offset=20&type=public
GET /api/webfolder/folder/tree?type=user
```

## Works — `/app/works`

**화면 진입/조작 시 실제 호출**(관찰 확정):
```
GET /api/works/applets/hasaccessible
GET /api/works/checkadmin
GET /api/works/folders/root?orderBy=name
GET /api/works/folders?orderBy=name
```

**번들 추출**(호출 안 함):

`/api/works/applets/`

## ToDO+ — `/app/todo`

**화면 진입/조작 시 실제 호출**(관찰 확정):
```
GET /api/todo/favorite
GET /api/todo/my
```

## 보고 — `/app/report`

진입만으로는 호출이 없다 — 하위 메뉴를 고르기 전까지 아무것도 안 불린다.

**번들 추출**(호출 안 함):

`/api/report/form`

## 주소록 — `/app/contact`  🟢 읽기 확정 + 앱 이식 (2026-10-22)

진입만으로는 호출이 없다 — 그래서 **번들에서 경로를 뽑고 직접 호출해** 확정했다.

**관찰·호출 확정:**

```
GET /api/contact/search?page&offset&property&direction&ownerType&searchType&keyword
      → 사내 주소록 375건. 레코드: name, positionName, departmentName, companyName,
        email, mobileNo, office{tel,basicAddress}, photo, thumbSmall/Large, bookOwner
GET /api/contact/side        → personalGroups / companyGroups / deptGroups
      → 실측은 deptGroups 1건([{deptId:245, deptName:'개발3팀', groups:[]}])뿐이고
        나머지는 0건이었다. 쓸 게 없어 **도구로 만들지 않았다.**
```

### ⚠️⚠️ `keyword` 는 `searchType=or` 가 없으면 조용히 **전건**을 준다

파라미터 이름은 번들 `contact/collections/search_contact` 의 `default` 에서 확정했다
(`keyword` `page` `offset` `property` `direction` `ownerType` `searchType`). 그런데 실측하면:

| 보낸 것 | 결과 |
|---|---|
| `keyword=박` 단독 | **375건** (= 전건, 필터가 안 먹음) |
| `keyword=박&searchType=and` | **375건** |
| `keyword=박&searchType=or` | **18건** ✅ |
| `name=박` / `searchWord=박` | 375건 (그런 파라미터 없음) |

0건이면 "없나?" 하고 의심하지만 **전건은 "검색이 됐다"고 착각한다** — 메일 `keyWord` 사례보다
위험하다. 그래서 `gw_bridge.contacts_search()` 가 `searchType=or` 를 **기본값으로 박아** 둔다.

> `/api/contact/contacts` 는 `type` 이 필수다(인자 없이 호출 → **500** "require type!!").
> `/api/contact/import/dept` · `/api/contact/copy/menu` 는 쓰기성으로 보여 **부르지 않았다.**

**번들 추출**(호출 안 함): `/api/contact` · `/api/contact/` · `/api/contact/company/group` ·
`/api/contact/company/group/` · `/api/contact/contacts/group/` · `/api/contact/contacts/groups`(405) ·
`/api/contact/dept/` · `/api/contact/group` · `/api/contact/personal/contact` ·
`/api/contact/personal/contact/` · `/api/contact/personal/group`

## 알림 — `/app/noti`  🟢 읽기 확정 + 앱 이식 (2026-10-22)

`/app/noti` 는 화면이 비어 있다(모듈 청크를 안 불러온다) — 번들 추출로 확정했다.

**관찰·호출 확정:**

```
GET /api/my/noti?page&offset              → 전체 알림 (실측 196→198건)
GET /api/my/noti/<카테고리>?page&offset     → 분류별 (approval 189 / bbs 9 / mail 0 / calendar 0)
GET /api/home/noti?page&offset            → 같은 목록(홈 종 아이콘용, offset 기본 8)
```

- 레코드: `category` `sender` `message` `createdAt` `linkUrl` `profile` `id` `companyId`
- 카테고리는 **경로의 일부**다(쿼리 아님): `approval` `asset` `bbs` `calendar` `channel`
  `community` `docs` `ehr` `mail` `manager` `openapi` `report` `survey` `task` `todo`
  `webfolder` `works`, 그리고 `unread`(= 안읽음 필터, 별도 경로가 아니라 같은 자리의 값).
- **GET 목록 조회는 읽음 처리를 하지 않는다.** 읽음 처리 경로는 일부러 만들지 않았다.
- `message` 에 `&#91;` 같은 숫자 엔티티가 섞여 온다 → `_unentity()` 를 거칠 것.

## 쪽지 — `/app/note`  🟢 읽기 확정 + 앱 이식 (2026-10-22)

쪽지는 **메일 시스템의 폴더 하나**(`__go_note__`)다 — 그래서 레코드가 메일과 같은 모양이다.

```
POST /api/mail/note/list   (JSON)  body: {page, offset, tabType, folder}
      → 레코드: fromToSimple, sendToSimple, subject, preview, dateUtc, seen, size …
```

### ⚠️ 여기서 걸린 것 세 가지 (전부 실측)

1. **GET 은 405.** 번들 goGrid 가 `method:"POST"` 로 부른다.
2. **form-encoded 로 보내면 `tabType=__go_note__` 외에는 400** → 반드시 **JSON** 으로.
3. **`keyWord` 를 서버가 무시한다**('추석'·없는 말 모두 전건 3건) → 도구에 검색 인자를 **안 넣었다.**
   `offset` 도 무시한다(2를 줘도 3건) → 설문처럼 코드에서 자른다.

> `tabType` 은 `__go_note__`(기본) / `inbox` / `sent` / `allBox` 모두 같은 결과였다. 다만 사내
> 쪽지가 **3건뿐**이라 구분이 되는지 **확인하지 못했다** — 되는 것처럼 적지 않는다.
