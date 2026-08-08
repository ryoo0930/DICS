(function () {
  'use strict';

  const DEFAULT_MAX_PAGES = 100;
  const FETCH_DELAY = 300;

  // ── 갤러리 정보 ──────────────────────────────────────────────────
  function getGalleryId() {
    return new URL(window.location.href).searchParams.get('id');
  }

  // 현재 페이지 URL 기반으로 page만 교체 — 갤러리 타입(mgallery/mini 등)을 자동 보존
  function buildListUrl(page) {
    const url = new URL(window.location.href);
    url.searchParams.set('page', page);
    // 검색 파라미터 제거 (순수 목록 페이지로 fetch)
    ['s_type', 's_keyword', 'search_type', 'search_keyword', 'dcid_search'].forEach(k =>
      url.searchParams.delete(k)
    );
    return url.toString();
  }

  // ── 식별코드 추출 및 정규화 ──────────────────────────────────────
  // td.gall_writer 의 data-ip(유동닉) 또는 data-uid(고정닉) 속성 사용
  function getCode(writerEl) {
    if (!writerEl) return null;
    const ip = writerEl.getAttribute('data-ip');
    if (ip && ip.trim()) return ip.trim();
    const uid = writerEl.getAttribute('data-uid');
    if (uid && uid.trim()) return uid.trim();
    return null;
  }

  // 괄호, 공백 제거 — 사용자가 "(119.202)" 형태로 입력해도 매칭되게 함
  function normalizeCode(code) {
    return code ? code.replace(/[()]/g, '').trim() : '';
  }

  // ── 현재 페이지 필터링 ────────────────────────────────────────────
  function applyPageFilter(code) {
    let count = 0;
    document.querySelectorAll('tr.ub-content').forEach(row => {
      const writer = row.querySelector('td.gall_writer');
      if (getCode(writer) === code) {
        row.style.display = '';
        count++;
      } else {
        row.style.display = 'none';
      }
    });
    renderFilterBanner(code, count);
    return count;
  }

  function clearPageFilter() {
    document.querySelectorAll('tr.ub-content').forEach(r => (r.style.display = ''));
    document.getElementById('dc-id-banner')?.remove();
  }

  function renderFilterBanner(code, count) {
    document.getElementById('dc-id-banner')?.remove();
    const tbody = document.querySelector('.gall_list tbody');
    if (!tbody) return;

    const tr = document.createElement('tr');
    tr.id = 'dc-id-banner';
    tr.innerHTML = `
      <td colspan="6" class="dc-id-banner-cell">
        <b>${escHtml(code)}</b> 필터 중 — 현재 페이지 ${count}개 발견
        <button class="dc-id-btn" id="dc-id-clear">필터 해제</button>
        <button class="dc-id-btn dc-id-btn-primary" id="dc-id-full">전체 페이지 검색</button>
      </td>`;
    tbody.insertBefore(tr, tbody.firstChild);

    document.getElementById('dc-id-clear').onclick = clearPageFilter;
    document.getElementById('dc-id-full').onclick = () => runFullSearch(code);
  }

  // ── 전체 페이지 검색 ──────────────────────────────────────────────
  let searchCancelled = false;

  async function runFullSearch(targetCode) {
    const normalized = normalizeCode(targetCode);
    const id = getGalleryId();

    console.log(`[DC-ID] 검색 시작 — 입력값: "${targetCode}" → 정규화: "${normalized}", 기준URL: ${buildListUrl(1)}`);

    if (!normalized) { alert('식별코드를 입력해주세요.'); return; }
    if (!id) { alert('갤러리 목록 페이지에서 실행해주세요.'); return; }

    const tbody = document.querySelector('.gall_list tbody');
    if (!tbody) return;

    const { maxPages = DEFAULT_MAX_PAGES } = await chrome.storage.local.get('maxPages');

    searchCancelled = false;
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="dc-id-banner-cell">
          <span id="dc-id-progress">검색 중... (0개 발견 / 최대 ${maxPages}페이지)</span>
          <button class="dc-id-btn" id="dc-id-cancel">취소</button>
        </td>
      </tr>`;
    document.getElementById('dc-id-cancel').onclick = () => { searchCancelled = true; };

    const found = [];

    for (let page = 1; page <= maxPages && !searchCancelled; page++) {
      try {
        const url = buildListUrl(page);
        const resp = await fetch(url, { credentials: 'include' });
        if (!resp.ok) {
          console.warn(`[DC-ID] ${page}페이지 fetch 실패: HTTP ${resp.status}`);
          break;
        }

        const html = await resp.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const rows = doc.querySelectorAll('tr.ub-content');

        console.log(`[DC-ID] ${page}페이지: tr.ub-content ${rows.length}개`);
        if (!rows.length) { console.log('[DC-ID] 더 이상 게시글 없음, 중단'); break; }

        rows.forEach(row => {
          const writer = row.querySelector('td.gall_writer');
          const raw = getCode(writer);
          const norm = normalizeCode(raw);
          if (norm === normalized) {
            console.log(`[DC-ID] ✓ 매칭 — data-ip/uid: "${raw}"`);
            found.push(row.cloneNode(true));
          }
        });

        const el = document.getElementById('dc-id-progress');
        if (el) el.textContent = `${page}/${maxPages}페이지 검색 완료... (${found.length}개 발견)`;

        if (page < maxPages && !searchCancelled) await sleep(FETCH_DELAY);
      } catch (e) {
        console.error('[DC-ID-Search] fetch 오류:', e);
        break;
      }
    }

    console.log(`[DC-ID] 검색 완료 — ${found.length}개 발견`);
    renderSearchResults(normalized, found);
  }

  function renderSearchResults(code, rows) {
    const tbody = document.querySelector('.gall_list tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const header = document.createElement('tr');
    header.innerHTML = `
      <td colspan="6" class="dc-id-banner-cell">
        <b>${escHtml(code)}</b> 검색 결과: ${rows.length}개
        <button class="dc-id-btn" id="dc-id-reload">돌아가기</button>
      </td>`;
    tbody.appendChild(header);
    document.getElementById('dc-id-reload').onclick = () => location.reload();

    if (!rows.length) {
      const empty = document.createElement('tr');
      empty.innerHTML = `<td colspan="6" style="text-align:center;padding:20px;color:#888;">결과가 없습니다.</td>`;
      tbody.appendChild(empty);
      return;
    }
    rows.forEach(row => tbody.appendChild(row));
  }

  // ── 목록에 검색 버튼 삽입 ─────────────────────────────────────────
  function addSearchButtons() {
    document.querySelectorAll('td.gall_writer:not([data-dcid])').forEach(writer => {
      writer.setAttribute('data-dcid', '1');
      const code = getCode(writer);
      if (!code) return;

      const btn = document.createElement('button');
      btn.className = 'dc-id-inline-btn';
      btn.title = `식별코드 '${code}' 필터`;
      btn.textContent = '🔍';
      btn.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        applyPageFilter(code);
      };
      writer.appendChild(btn);
    });
  }

  // ── 검색 드롭다운에 옵션 추가 ─────────────────────────────────────
  // DCInside 실제 구조:
  //   select#search_type[name="search_type"] — native hidden select
  //   ul#searchTypeLayer.option_box          — visible custom dropdown (li 요소)
  //   span#search_type_txt                   — 선택된 타입 표시
  function injectDropdownOption() {
    // 1) native select에 option 추가
    const sel = document.getElementById('search_type') ||
                document.querySelector('select[name="search_type"]');
    if (sel && !sel.querySelector('option[value="dcid"]')) {
      const opt = document.createElement('option');
      opt.value = 'dcid';
      opt.textContent = '식별코드';
      sel.appendChild(opt);
    }

    // 2) 커스텀 드롭다운 UI에 li 추가
    const ul = document.getElementById('searchTypeLayer');
    if (ul && !ul.querySelector('[data-dcid]')) {
      const li = document.createElement('li');
      li.setAttribute('data-dcid', '1');
      li.textContent = '식별코드';
      li.onclick = () => {
        // DCInside 자체 searchTypeSel 함수 호출 시도
        if (typeof window.searchTypeSel === 'function') {
          window.searchTypeSel('dcid');
        } else {
          // 폴백: 직접 처리
          if (sel) sel.value = 'dcid';
          const txt = document.getElementById('search_type_txt');
          if (txt) txt.textContent = '식별코드';
          ul.style.display = 'none';
        }
      };
      ul.appendChild(li);
    }
  }

  // ── 검색 버튼 인터셉트 ────────────────────────────────────────────
  // DCInside는 button onclick="search('')" 방식이라 form submit이 없음.
  // button 자체에 capture 등록하면 HTML parser가 먼저 등록한 onclick 이후에
  // 실행되어 인터셉트 불가. document 레벨 capture는 이벤트가 button에
  // 도달하기 전에 발생하므로 onclick보다 반드시 먼저 실행됨.
  let searchButtonBound = false;

  function bindSearchButton() {
    if (searchButtonBound) return;
    searchButtonBound = true;

    document.addEventListener('click', function (e) {
      // 클릭 대상이 검색 버튼(또는 그 자식)인지 확인
      if (!e.target.closest('button.bnt_search')) return;

      const sel = document.getElementById('search_type') ||
                  document.querySelector('select[name="search_type"]');
      if (!sel || sel.value !== 'dcid') return;

      // 식별코드 검색: DCInside의 search() 호출을 막고 직접 처리
      e.stopPropagation();
      e.preventDefault();

      const input = document.querySelector('input[name="search_keyword"]') ||
                    document.querySelector('input.in_keyword');
      const code = input ? input.value.trim() : '';
      if (!code) { alert('식별코드를 입력해주세요.'); return; }
      runFullSearch(code);
    }, true); // capture: document → button 순서, inline onclick보다 먼저 실행
  }

  // ── 팝업에서 전달된 자동 검색 파라미터 처리 ──────────────────────
  function checkAutoSearch() {
    const params = new URL(location.href).searchParams;
    const code = params.get('dcid_search');
    if (!code) return;

    const clean = new URL(location.href);
    clean.searchParams.delete('dcid_search');
    history.replaceState(null, '', clean.toString());

    setTimeout(() => runFullSearch(code), 800);
  }

  // ── 유틸 ──────────────────────────────────────────────────────────
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function escHtml(str) {
    return String(str).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ── 초기화 ────────────────────────────────────────────────────────
  function init() {
    checkAutoSearch();
    injectDropdownOption();
    bindSearchButton();
    addSearchButtons();
  }

  new MutationObserver(() => {
    injectDropdownOption();
    addSearchButtons();
  }).observe(document.body, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 400);
  }
})();
