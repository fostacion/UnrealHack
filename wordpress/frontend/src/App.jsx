import React, { useEffect, useMemo, useState } from 'react'

const API_BASE = (import.meta.env.VITE_API_BASE
  ?? (location.hostname.endsWith('ngrok-free.app') ? '' : 'http://localhost:8000'));
const PER_PAGE = 24

function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#111827"/><stop offset="100%" stopColor="#374151"/>
        </linearGradient>
      </defs>
      <rect x="3" y="6" rx="10" ry="10" width="42" height="36" fill="url(#g)" />
      <path d="M12 18h24v2H12zM12 24h24v2H12zM12 30h18v2H12z" fill="#9CA3AF"/>
      <path d="M36 14l6 4-6 4-6-4 6-4z" fill="#10B981" />
      <circle cx="12" cy="36" r="3" fill="#F59E0B"/>
    </svg>
  )
}

function ArrowDown({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3v12m0 0l-5-5m5 5l5-5M5 21h14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function Check({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function Spinner({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="spin" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.25"/>
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round"/>
    </svg>
  )
}

function Pagination({ page, pages, onChange }) {
  if (!pages || pages <= 1) return null
  const maxButtons = 8
  let start = Math.max(1, page - Math.floor(maxButtons / 2))
  let end = Math.min(pages, start + maxButtons - 1)
  if (end - start + 1 < maxButtons) start = Math.max(1, end - maxButtons + 1)

  const nums = []
  for (let i = start; i <= end; i++) nums.push(i)

  return (
    <div className="pagination">
      <button className="btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>이전</button>
      {start > 1 && <button className="btn" onClick={() => onChange(1)}>1</button>}
      {start > 2 && <span className="dots">…</span>}
      {nums.map(n => (
        <button key={n} className={`btn ${n === page ? 'active' : ''}`} onClick={() => onChange(n)}>{n}</button>
      ))}
      {end < pages - 1 && <span className="dots">…</span>}
      {end < pages && <button className="btn" onClick={() => onChange(pages)}>{pages}</button>}
      <button className="btn" disabled={page >= pages} onClick={() => onChange(page + 1)}>다음</button>
    </div>
  )
}

export default function App() {
  // 상태
  const [health, setHealth] = useState(null)
  const [err, setErr] = useState(null)
  const [autoKo, setAutoKo] = useState(true)

  // 인기
  const [popular, setPopular] = useState([])
  const [popPage, setPopPage] = useState(1)
  const [popPages, setPopPages] = useState(1)
  const [loadingPopular, setLoadingPopular] = useState(false)

  // 검색
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searchPage, setSearchPage] = useState(1)
  const [searchPages, setSearchPages] = useState(1)
  const [searching, setSearching] = useState(false)

  // 저장소
  const [loadingStore, setLoadingStore] = useState(false)
  const [store, setStore] = useState([])

  // 진행
  const [busySlug, setBusySlug] = useState(null)
  const [scanning, setScanning] = useState(null)
  const [scanResult, setScanResult] = useState(null)

  // 코드 뷰어
  const [viewer, setViewer] = useState(null) // {slug, version, cwd, entries, file, showKo?, translating?}

  // 다운로드 완료
  const downloadedSlugs = useMemo(() => new Set((store || []).map(i => i.slug)), [store])

  // 초기
  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch(`${API_BASE}/health`)
        setHealth(await r.json())
      } catch (e) { setErr(String(e)) }
      await loadPopular(1)
      await fetchStore()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { loadPopular(popPage).catch(()=>{}) }, [autoKo, popPage])

  const loadPopular = async (page) => {
    setLoadingPopular(true)
    try {
      const lang = autoKo ? 'ko' : 'en'
      const r = await fetch(`${API_BASE}/popular?page=${page}&per_page=${PER_PAGE}&lang=${lang}`)
      const j = await r.json()
      setPopular(j.plugins || [])
      setPopPages(j.info?.pages || 1)
    } finally { setLoadingPopular(false) }
  }

  const fetchStore = async () => {
    setLoadingStore(true)
    try {
      const r = await fetch(`${API_BASE}/plugins`)
      setStore(await r.json())
    } finally { setLoadingStore(false) }
  }

  // 검색
  const runSearch = async (page = 1) => {
    if (!query.trim()) return
    setSearching(true)
    try {
      const lang = autoKo ? 'ko' : 'en'
      const r = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}&page=${page}&per_page=${PER_PAGE}&lang=${lang}`)
      const j = await r.json()
      setResults(j.plugins || [])
      setSearchPages(j.info?.pages || 1)
      setSearchPage(j.info?.page || page)
    } finally { setSearching(false) }
  }
  const onSearchSubmit = (e) => { e.preventDefault(); runSearch(1) }

  // 다운로드
  const onDownload = async (slug) => {
    setBusySlug(slug)
    try {
      const r = await fetch(`${API_BASE}/plugins/fetch`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug })
      })
      const j = await r.json()
      if (j.status === 'ok' || j.status === 'exists') await fetchStore()
      else alert('다운로드 실패: ' + JSON.stringify(j))
    } catch { alert('다운로드 중 오류') } finally { setBusySlug(null) }
  }

  // 스캔
  const onScan = async (slug, version) => {
    setScanning({ slug, version }); setScanResult(null)
    try {
      const r = await fetch(`${API_BASE}/scan/run`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, version })
      })
      const j = await r.json()
      setScanResult({ slug, version: j.version, ...j })
      await fetchStore()
    } catch { alert('스캔 오류') } finally { setScanning(null) }
  }

  // 삭제
  const onDeleteVersion = async (slug, version) => {
    if (!version) return alert('삭제할 버전을 선택하세요.')
    if (!confirm(`${slug}@${version} 버전을 삭제할까요?`)) return
    await fetch(`${API_BASE}/plugins/${encodeURIComponent(slug)}/${encodeURIComponent(version)}`, { method: 'DELETE' })
    await fetchStore()
    if (scanResult?.slug === slug && scanResult?.version === version) setScanResult(null)
  }
  const onDeleteSlug = async (slug) => {
    if (!confirm(`${slug} 플러그인의 모든 버전을 삭제할까요?`)) return
    await fetch(`${API_BASE}/plugins/${encodeURIComponent(slug)}`, { method: 'DELETE' })
    await fetchStore()
    if (scanResult?.slug === slug) setScanResult(null)
  }

  // 코드 뷰어
  const openViewer = async (slug, version, path = "") => {
    const tree = await fetch(`${API_BASE}/plugins/${encodeURIComponent(slug)}/${encodeURIComponent(version)}/tree?path=${encodeURIComponent(path)}`).then(r=>r.json())
    setViewer({ slug, version, cwd: tree.cwd, entries: tree.entries, file: null, showKo: autoKo, translating: false })
  }
  const enterDir = async (name) => {
    if (!viewer) return
    const nextPath = (viewer.cwd ? viewer.cwd + "/" : "") + name
    await openViewer(viewer.slug, viewer.version, nextPath)
  }
  const upDir = async () => {
    if (!viewer) return
    const parts = (viewer.cwd || "").split("/").filter(Boolean)
    parts.pop()
    await openViewer(viewer.slug, viewer.version, parts.join("/"))
  }
  const openFile = async (entryPath) => {
    if (!viewer) return
    const f = await fetch(`${API_BASE}/plugins/${encodeURIComponent(viewer.slug)}/${encodeURIComponent(viewer.version)}/file?path=${encodeURIComponent(entryPath)}`).then(r=>{
      if(!r.ok) throw new Error('파일 열기에 실패했습니다.')
      return r.json()
    })
    setViewer(v => ({ ...v, file: f }))
    if (autoKo && f && (f.is_markdown || ["md","markdown","txt"].includes(f.ext))) await translateViewerContent()
  }
  const translateViewerContent = async () => {
    if (!viewer?.file || viewer.file._ko) return
    setViewer(v => ({ ...v, translating: true }))
    try {
      const r = await fetch(`${API_BASE}/translate`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ texts: [viewer.file.content], target: "ko" })
      })
      const j = await r.json()
      const ko = (j.translations && j.translations[0]) || viewer.file.content
      setViewer(v => ({ ...v, file: { ...v.file, _ko: ko }, translating: false }))
    } catch { setViewer(v => ({ ...v, translating: false })) }
  }

  return (
    <div className="page">
      <header className="header">
        <div className="brand">
          <Logo size={28} />
          <div className="brand-text">
            <div className="brand-title">s0d WP Vulnerability Lab</div>
            <div className="brand-sub muted">SSL 06</div>
          </div>
        </div>
        <div className="status">
          <label className="toggle">
            <input type="checkbox" checked={autoKo} onChange={e=>setAutoKo(e.target.checked)} />
            <span>자동 한글화</span>
          </label>
          {health ? <span className="pill ok">API OK</span> : <span className="pill">API 연결 대기</span>}
        </div>
      </header>

      {/* 인기 플러그인 */}
      <section className="card">
        <div className="row">
          <h2>인기 플러그인</h2>
          <form onSubmit={onSearchSubmit} className="row">
            <input placeholder="플러그인 검색" value={query} onChange={e=>setQuery(e.target.value)} />
            <button className="btn primary" disabled={searching}>{searching ? '검색 중...' : '검색'}</button>
          </form>
        </div>

        {loadingPopular ? <p className="muted">불러오는 중…</p> :
          <div className="grid">
            {popular.map(p => {
              const isDownloaded = downloadedSlugs.has(p.slug)
              return (
                <div key={p.slug} className="tile">
                  <div className="tile-head">
                    <div className="left">
                      {p.icon
                        ? <img className="avatar" src={p.icon} loading="lazy" alt="" />
                        : <div className="avatar placeholder">{p.name?.[0]?.toUpperCase() || p.slug?.[0]?.toUpperCase() || 'P'}</div>}
                      <div>
                        <div className="title">{p.name || p.slug}</div>
                        <div className="subtitle">{p.slug} · 설치수 ≈ {p.active_installs?.toLocaleString?.() ?? p.active_installs ?? '-'}</div>
                      </div>
                    </div>
                    {isDownloaded ? (
                      <span className="icon-badge success" aria-label="다운로드 완료" title="다운로드 완료">
                        <Check />
                      </span>
                    ) : (
                      <button
                        className="icon-btn primary"
                        aria-label="다운로드"
                        title="다운로드"
                        disabled={busySlug === p.slug}
                        onClick={() => onDownload(p.slug)}
                      >
                        {busySlug === p.slug ? <Spinner /> : <ArrowDown />}
                      </button>
                    )}
                  </div>
                  {p.short_description && <p className="desc">{p.short_description}</p>}
                </div>
              )
            })}
          </div>
        }

        <Pagination page={popPage} pages={popPages} onChange={setPopPage} />
      </section>

      {/* 검색 결과 */}
      {results.length > 0 &&
        <section className="card">
          <div className="row">
            <h2>검색 결과</h2>
            <Pagination page={searchPage} pages={searchPages} onChange={(n)=>runSearch(n)} />
          </div>
          <div className="grid">
            {results.map(p => {
              const isDownloaded = downloadedSlugs.has(p.slug)
              return (
                <div key={p.slug} className="tile">
                  <div className="tile-head">
                    <div className="left">
                      {p.icon
                        ? <img className="avatar" src={p.icon} loading="lazy" alt="" />
                        : <div className="avatar placeholder">{p.name?.[0]?.toUpperCase() || p.slug?.[0]?.toUpperCase() || 'P'}</div>}
                      <div>
                        <div className="title">{p.name || p.slug}</div>
                        <div className="subtitle">{p.slug}</div>
                      </div>
                    </div>
                    {isDownloaded ? (
                      <span className="icon-badge success" aria-label="다운로드 완료" title="다운로드 완료">
                        <Check />
                      </span>
                    ) : (
                      <button
                        className="icon-btn primary"
                        aria-label="다운로드"
                        title="다운로드"
                        disabled={busySlug === p.slug}
                        onClick={() => onDownload(p.slug)}
                      >
                        {busySlug === p.slug ? <Spinner /> : <ArrowDown />}
                      </button>
                    )}
                  </div>
                  {p.short_description && <p className="desc">{p.short_description}</p>}
                </div>
              )
            })}
          </div>
          <Pagination page={searchPage} pages={searchPages} onChange={(n)=>runSearch(n)} />
        </section>
      }

      {/* 다운로드 된 항목 */}
      <section className="card">
        <div className="row">
          <h2>다운로드 된 항목</h2>
          <button className="btn" onClick={fetchStore} disabled={loadingStore}>{loadingStore ? '새로고침…' : '새로고침'}</button>
        </div>
        {store.length === 0
          ? <p className="muted">아직 내려받은 플러그인이 없습니다.</p>
          : <DownloadedList
              store={store}
              scanning={scanning}
              onScan={onScan}
              onDeleteSlug={onDeleteSlug}
              onDeleteVersion={onDeleteVersion}
              openViewer={openViewer}
            />
        }
      </section>

      {/* 스캔 결과 */}
      {scanResult && <ScanModal scanResult={scanResult} onClose={()=>setScanResult(null)} />}

      {/* 코드 뷰어 */}
      {viewer && <ViewerModal
        viewer={viewer}
        setViewer={setViewer}
        enterDir={enterDir}
        upDir={upDir}
        openFile={openFile}
        translateViewerContent={translateViewerContent}
      />}

      {err && <p className="error">{err}</p>}
    </div>
  )
}

function DownloadedList({ store, scanning, onScan, onDeleteSlug, onDeleteVersion, openViewer }) {
  return (
    <div className="stack">
      {store.map(item => (
        <div key={item.slug} className="tile">
          <div className="row">
            <div>
              <div className="title">{item.slug}</div>
              <div className="subtitle">버전: {item.latest?.version || '-'} / 총 {item.versions?.length || 0}개</div>
            </div>
            <div className="row gap">
              <select defaultValue={item.latest?.version} onChange={e => (item._ver = e.target.value)}>
                {(item.versions || []).map(v => <option key={v.version} value={v.version}>{v.version}</option>)}
              </select>
              <button className="btn" onClick={() => openViewer(item.slug, item._ver || item.latest?.version)}>보기</button>
              <button className="btn success" disabled={!!scanning} onClick={() => onScan(item.slug, item._ver || item.latest?.version)}>
                {scanning?.slug === item.slug ? '검사 중…' : '검사'}
              </button>
              <button className="btn danger" onClick={() => onDeleteVersion(item.slug, item._ver || item.latest?.version)}>선택 버전 삭제</button>
              <button className="btn danger outline" onClick={() => onDeleteSlug(item.slug)}>전체 삭제</button>
            </div>
          </div>

          {item.latest?.scan?.summary &&
            <div className="muted small mt-6">
              최근 스캔: critical {item.latest.scan.summary.critical},
              high {item.latest.scan.summary.high},
              medium {item.latest.scan.summary.medium},
              low {item.latest.scan.summary.low},
              total {item.latest.scan.summary.total}
            </div>
          }
        </div>
      ))}
    </div>
  )
}

function ScanModal({ scanResult, onClose }) {
  return (
    <section className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="row">
          <h3>스캔 결과 — {scanResult.slug}@{scanResult.version}</h3>
          <button className="btn" onClick={onClose}>닫기</button>
        </div>
        <div className="muted small">
          files: {scanResult.scanned_files} ·
          {' '}critical: {scanResult.summary?.critical} ·
          {' '}high: {scanResult.summary?.high} ·
          {' '}medium: {scanResult.summary?.medium} ·
          {' '}low: {scanResult.summary?.low} ·
          {' '}total: {scanResult.summary?.total}
        </div>
        <div className="table">
          <div className="thead">
            <div>Severity</div><div>Rule</div><div>File:Line</div><div>Snippet</div>
          </div>
          {(scanResult.findings || []).map((f, i) =>
            <div className="trow" key={i}>
              <div className="cell"><span className={`sev sev-${f.severity}`}>{f.severity}</span></div>
              <div className="cell"><div className="bold">{f.title}</div><div className="muted small">{f.rule_id}</div></div>
              <div className="cell">{f.file}:{f.line}</div>
              <div className="cell code">{f.snippet}</div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function ViewerModal({ viewer, setViewer, enterDir, upDir, openFile, translateViewerContent }) {
  return (
    <section className="modal-bg" onClick={() => setViewer(null)}>
      <div className="modal wide" onClick={e => e.stopPropagation()}>
        <div className="row">
          <h3>코드 보기 — {viewer.slug}@{viewer.version}</h3>
          <div className="row gap">
            {(viewer?.file && (viewer.file.is_markdown || ["md","markdown","txt"].includes(viewer.file.ext))) &&
              <>
                <label className="toggle">
                  <input type="checkbox" checked={!!viewer.showKo} onChange={e => setViewer(v => ({ ...v, showKo: e.target.checked }))} />
                  <span>한글로 보기 (β)</span>
                </label>
                <button className="btn" onClick={translateViewerContent} disabled={viewer.translating || !!viewer.file._ko}>
                  {viewer.file._ko ? '번역 완료' : (viewer.translating ? '번역 중…' : '번역')}
                </button>
              </>
            }
            <button className="btn" onClick={() => setViewer(null)}>닫기</button>
          </div>
        </div>

        <div className="breadcrumbs">
          <button className="btn" onClick={upDir}>상위</button>
          <span className="muted">/{viewer.cwd || ""}</span>
        </div>

        <div className="split">
          <div className="pane tree">
            {viewer.entries?.map(e => (
              <div key={e.path} className="tree-row">
                {e.type === 'dir'
                  ? <button className="tree-item dir" onClick={() => enterDir(e.name)}>📁 {e.name}</button>
                  : <button className="tree-item file" onClick={() => openFile(e.path)}>📄 {e.name}</button>}
              </div>
            ))}
          </div>
          <div className="pane viewer">
            {viewer.file
              ? (viewer.file.is_markdown
                  ? <div className="md" dangerouslySetInnerHTML={{__html: simpleMarkdown(viewer.showKo && viewer.file._ko ? viewer.file._ko : viewer.file.content)}} />
                  : <pre className="codeblock"><code>{viewer.showKo && viewer.file._ko ? viewer.file._ko : viewer.file.content}</code></pre>
                )
              : <div className="muted">좌측에서 파일을 선택하세요.</div>
            }
          </div>
        </div>
      </div>
    </section>
  )
}

/** 코드 마크다운 렌더링 */
function simpleMarkdown(src) {
  const esc = (s) => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  let html = esc(src)
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre class="codeblock"><code>${esc(code)}</code></pre>`)
  html = html
    .replace(/^###\s+(.*)$/gm, '<h3>$1</h3>')
    .replace(/^##\s+(.*)$/gm, '<h2>$1</h2>')
    .replace(/^#\s+(.*)$/gm, '<h1>$1</h1>')
  html = html
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+?)`/g, '<code class="inline">$1</code>')
  // 링크 [text](url)
  html = html.replace(/\[([^\]]+)\]\((https?:[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  html = html.replace(/\n\n+/g, '</p><p>').replace(/^/, '<p>').replace(/$/, '</p>')
  return html
}