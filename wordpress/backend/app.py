#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os, re, io, json, shutil, tempfile, hashlib, contextlib
try:
    import yaml  # optional
except Exception:
    yaml = None
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional, Tuple

import requests
from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# deep_translator is optional; app should still boot without it
try:
    from deep_translator import GoogleTranslator, LibreTranslator
except Exception:
    GoogleTranslator = None
    LibreTranslator = None
TRANSLATE_PROVIDER = os.getenv("TRANSLATE_PROVIDER", "google")
LIBRE_BASE = os.getenv("LIBRE_BASE")

# Helper: locale mapping
def to_locale(lang: Optional[str]) -> Optional[str]:
    """
    Map 'ko' -> 'ko_KR', 'en' -> 'en_US', pass through full locales like 'ko_KR'.
    Returns None if no mapping is available.
    """
    if not lang:
        return None
    s = lang.replace('-', '_')
    if '_' in s:
        return s
    return {'ko': 'ko_KR', 'en': 'en_US'}.get(s, None)

def translate_batch(texts: List[str], target: str = "ko") -> List[str]:
    texts = [t if t is not None else "" for t in texts]
    if not texts:
        return []
    # If translation backends are not available, return source as-is
    if GoogleTranslator is None and LibreTranslator is None:
        return texts
    try:
        if TRANSLATE_PROVIDER == "libre" and LIBRE_BASE and LibreTranslator is not None:
            lt = LibreTranslator(source="auto", target=target, base_url=LIBRE_BASE)
            return [lt.translate(t) if t else t for t in texts]
        elif GoogleTranslator is not None:
            gt = GoogleTranslator(source="auto", target=target)
            # some versions support batch; fall back to per-item if not
            try:
                return gt.translate_batch(texts)
            except Exception:
                return [gt.translate(t) if t else t for t in texts]
        else:
            return texts
    except Exception:
        # On any translation error, fail open by returning the original texts
        return texts

def maybe_translate_fields(items: List[Dict], fields: List[str], target: Optional[str]) -> List[Dict]:
    if not target or target.lower() in {"en", "auto"}:
        return items
    bucket, idxmap = [], []
    for i, it in enumerate(items):
        for f in fields:
            val = (it or {}).get(f)
            if isinstance(val, str) and val.strip():
                bucket.append(val); idxmap.append((i, f))
    if not bucket:
        return items
    out = translate_batch(bucket, target)
    for (i, f), v in zip(idxmap, out):
        items[i][f] = v
    return items

APP = FastAPI(title="WP Vulnerability Lab API", version="0.1.0")

APP.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],     # 필요시 프론트 도메인만 허용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UA = "WPPluginHarvester/0.1 (+research)"
STORE_ROOT = Path(os.getenv("WP_STORE", "store")).resolve()
API_BASE = "https://api.wordpress.org/plugins/info/1.2/"

# Cache/page-limit constants
MAX_PAGES = int(os.getenv("WP_MAX_PAGES", "100"))
CACHE_NAME = os.getenv("WP_CACHE_NAME", "wpapi")
CACHE_BACKEND = os.getenv("WP_CACHE_BACKEND", "sqlite")  # e.g., 'sqlite', 'memory'
CACHE_EXPIRE_MIN = int(os.getenv("WP_CACHE_EXPIRE_MINUTES", "10"))

def ensure_dir(p: Path): p.mkdir(parents=True, exist_ok=True)
ensure_dir(STORE_ROOT)

def sha256_file(path: Path, chunk: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for c in iter(lambda: f.read(chunk), b""):
            h.update(c)
    return h.hexdigest()

def is_path_safe(base: Path, target: Path) -> bool:
    try:
        return str(target.resolve(False)).startswith(str(base.resolve(False)))
    except Exception:
        return False

def safe_extract_zip(zip_path: Path, extract_to: Path) -> List[Path]:
    import zipfile
    out: List[Path] = []
    with zipfile.ZipFile(zip_path, "r") as zf:
        for info in zf.infolist():
            name = info.filename.replace("\\", "/")
            if name.startswith("/") or ".." in Path(name).parts:
                continue
            dst = extract_to / name
            if not is_path_safe(extract_to, dst):
                continue
            if info.is_dir():
                ensure_dir(dst); continue
            ensure_dir(dst.parent)
            with zf.open(info, "r") as src, open(dst, "wb") as fp:
                shutil.copyfileobj(src, fp)
            out.append(dst)
    return out

def flatten_if_single_topdir(extract_root: Path):
    items = [e for e in extract_root.iterdir() if not e.name.startswith(".")]
    if len(items) == 1 and items[0].is_dir():
        top = items[0]
        for child in top.iterdir():
            shutil.move(str(child), str(extract_root / child.name))
        with contextlib.suppress(Exception):
            top.rmdir()

def cleanup_tree(root: Path):
    for p in list(root.rglob("*")):
        if p.is_file() and p.name in {".DS_Store"}:
            with contextlib.suppress(Exception): p.unlink()
        if p.is_dir() and p.name in {"__MACOSX"}:
            shutil.rmtree(p, ignore_errors=True)

def stream_download(url: str, dest: Path):
    with requests.get(url, stream=True, headers={"User-Agent": UA}, timeout=60) as r:
        r.raise_for_status()
        with dest.open("wb") as f:
            for piece in r.iter_content(chunk_size=262144):
                if piece: f.write(piece)

class WPOrgAPI:
    def __init__(self):
        try:
            import requests_cache  # local import to keep optional dependency
            self.s = requests_cache.CachedSession(
                cache_name=CACHE_NAME,
                backend=CACHE_BACKEND,
                expire_after=timedelta(minutes=CACHE_EXPIRE_MIN),
                allowable_methods=("GET","HEAD"),
            )
        except Exception:
            self.s = requests.Session()
        self.s.headers.update({"User-Agent": UA})

    def search(self, q: str, page: int = 1, per_page: int = 24, locale: Optional[str] = None) -> Dict:
        params = {"action": "query_plugins"}
        req = {
            "search": q,
            "page": max(1, page),
            "per_page": max(1, per_page),
            "fields": {"short_description": True, "active_installs": True, "icons": True},
        }
        if locale:
            req["locale"] = locale
        params.update({f"request[{k}]": v for k, v in req.items()})
        r = self.s.get(API_BASE, params=params, timeout=30); r.raise_for_status()
        return r.json()  # {plugins: [...], info: {page, pages, results}}

    def browse(self, mode: str, page: int = 1, per_page: int = 24, locale: Optional[str] = None) -> Dict:
        params = {"action": "query_plugins"}
        req = {
            "browse": mode,                    # "popular", "updated", "new", "featured"
            "page": max(1, page),
            "per_page": max(1, per_page),
            "fields": {"short_description": True, "active_installs": True, "icons": True},
        }
        if locale:
            req["locale"] = locale
        params.update({f"request[{k}]": v for k, v in req.items()})
        r = self.s.get(API_BASE, params=params, timeout=30); r.raise_for_status()
        return r.json()

    def plugin_info(self, slug: str, versions: bool = True) -> Dict:
        params = {"action": "plugin_information", "request[slug]": slug}
        if versions: params["request[fields][versions]"] = 1
        r = self.s.get(API_BASE, params=params, timeout=30); r.raise_for_status()
        return r.json()


    def latest_zip_via_redirect(self, slug: str) -> Tuple[str, Optional[str]]:
        url = f"https://wordpress.org/plugins/{slug}/?download"
        r = self.s.head(url, allow_redirects=True, timeout=30)
        if r.status_code == 200:
            final = r.url
            m = re.search(rf"{re.escape(slug)}\.(\d+(?:\.\d+)*)\.zip$", final)
            return final, (m.group(1) if m else None)
        r = self.s.get(url, stream=True, allow_redirects=True, timeout=30)
        if r.status_code == 200:
            final = r.url; r.close()
            m = re.search(rf"{re.escape(slug)}\.(\d+(?:\.\d+)*)\.zip$", final)
            return final, (m.group(1) if m else None)
        raise RuntimeError(f"redirect failed: {url} status={r.status_code}")

API = WPOrgAPI()

def resolve_zip(slug: str, version: Optional[str]) -> Tuple[str, str]:
    if version:
        url = f"https://downloads.wordpress.org/plugin/{slug}.{version}.zip"
        r = requests.head(url, allow_redirects=True, timeout=30, headers={"User-Agent": UA})
        if r.status_code == 200: return url, version
        raise HTTPException(404, f"version not found: {version}")
    info = API.plugin_info(slug, versions=False)
    latest = info.get("download_link"); ver = info.get("version")
    if latest and ver: return latest, ver
    final, ver2 = API.latest_zip_via_redirect(slug)
    return final, (ver2 or "latest")

class Rule(BaseModel):
    id: str; severity: str; title: str; regex: str; description: str; recommendation: str

def load_rules() -> List[Rule]:
    rules_path = Path(__file__).with_name("rules.yaml")
    # If yaml is unavailable or file is missing/unreadable, return fallback
    if yaml is None or not rules_path.exists():
        return [Rule(id="RCE-001", severity="critical", title="eval()", regex=r"\beval\s*\(",
                     description="fallback rule", recommendation="avoid eval")]
    try:
        data = yaml.safe_load(rules_path.read_text(encoding="utf-8")) or []
        return [Rule(**r) for r in data]
    except Exception:
        # On parse errors, fall back to minimal rule
        return [Rule(id="RCE-001", severity="critical", title="eval()", regex=r"\beval\s*\(",
                     description="fallback rule", recommendation="avoid eval")]

RULES: List[Rule] = load_rules()

def grep_rules(root: Path) -> Dict:
    findings = []
    php_files = [p for p in root.rglob("*.php") if p.is_file()]
    for file in php_files:
        try:
            text = file.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for rule in RULES:
            for m in re.finditer(rule.regex, text, flags=re.IGNORECASE | re.DOTALL):
                start = m.start()
                line = text.count("\n", 0, start) + 1
                lines = text.splitlines()
                snippet = "\n".join(lines[max(0, line-2): min(len(lines), line+1)])
                findings.append({
                    "rule_id": rule.id,
                    "severity": rule.severity,
                    "title": rule.title,
                    "file": str(file.relative_to(root)),
                    "line": line,
                    "snippet": snippet,
                    "description": rule.description,
                    "recommendation": rule.recommendation,
                })
    for f in findings:
        if f["rule_id"] == "NONCE-001":
            file_path = root / f["file"]
            try:
                txt = file_path.read_text(encoding="utf-8", errors="ignore")
                if not re.search(r"(check_admin_referer|wp_verify_nonce)\s*\(", txt, re.I):
                    f["severity"] = "high"
            except Exception:
                pass
    return {
        "scanned_files": len(php_files),
        "findings": findings,
        "summary": {
            "critical": sum(1 for x in findings if x["severity"] == "critical"),
            "high":     sum(1 for x in findings if x["severity"] == "high"),
            "medium":   sum(1 for x in findings if x["severity"] == "medium"),
            "low":      sum(1 for x in findings if x["severity"] == "low"),
            "total":    len(findings),
        }
    }

# ----- 스키마/라우트 -----
class FetchReq(BaseModel):
    slug: str
    version: Optional[str] = None
    keep_zip: bool = True

class ScanReq(BaseModel):
    slug: str
    version: Optional[str] = None

def _semver_key(v: str):
    nums = re.findall(r"\d+", v)
    return tuple(int(x) for x in nums) if nums else (0,)

@APP.get("/health")
def health(): return {"ok": True, "store": str(STORE_ROOT)}

@APP.post("/plugins/fetch")
def fetch(req: FetchReq):
    slug = req.slug.strip().lower()
    zip_url, ver = resolve_zip(slug, req.version)
    out_dir = STORE_ROOT / slug / ver; ensure_dir(out_dir)
    zip_path = out_dir / f"{slug}-{ver}.zip"
    # 이미 있으면 스킵
    meta_path = out_dir / "metadata.json"
    if meta_path.exists():
        return {"status": "exists", "meta": json.loads(meta_path.read_text(encoding="utf-8"))}
    # 다운로드 → 추출
    stream_download(zip_url, zip_path)
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td) / "extract"; ensure_dir(tmp)
        safe_extract_zip(zip_path, tmp)
        flatten_if_single_topdir(tmp); cleanup_tree(tmp)
        for p in tmp.iterdir():
            dst = out_dir / p.name
            if dst.exists():
                shutil.rmtree(dst, ignore_errors=True) if dst.is_dir() else dst.unlink()
            shutil.move(str(p), str(dst))
    files = [p for p in out_dir.rglob("*") if p.is_file()]
    meta = {
        "slug": slug, "version": ver, "source_url": zip_url,
        "downloaded_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "zip_sha256": sha256_file(zip_path), "zip_bytes": zip_path.stat().st_size,
        "extracted_file_count": len(files)
    }
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    if not req.keep_zip:
        with contextlib.suppress(Exception): zip_path.unlink()
    return {"status": "ok", "meta": meta}

@APP.get("/plugins")
def list_all_plugins():
    items = []
    if not STORE_ROOT.exists(): return items
    for slug_dir in sorted([d for d in STORE_ROOT.iterdir() if d.is_dir()]):
        slug = slug_dir.name
        versions, latest = [], None
        for vdir in sorted([d for d in slug_dir.iterdir() if d.is_dir()], key=lambda p: _semver_key(p.name)):
            meta = {"slug": slug, "version": vdir.name}
            m = vdir / "metadata.json"
            if m.exists():
                with contextlib.suppress(Exception):
                    meta.update(json.loads(m.read_text(encoding="utf-8")))
            s = vdir / "scan.json"
            if s.exists():
                with contextlib.suppress(Exception):
                    scan = json.loads(s.read_text(encoding="utf-8"))
                    meta["scan"] = {"summary": scan.get("summary"), "scanned_files": scan.get("scanned_files")}
            versions.append(meta)
        if versions: latest = versions[-1]
        items.append({"slug": slug, "versions": versions, "latest": latest})
    return items

@APP.post("/scan/run")
def scan_run(req: ScanReq):
    slug = req.slug.strip().lower()
    slug_dir = STORE_ROOT / slug
    if not slug_dir.exists():
        raise HTTPException(404, "plugin not fetched yet")
    version = req.version
    if not version:
        vers = sorted([d.name for d in slug_dir.iterdir() if d.is_dir()], key=_semver_key)
        if not vers: raise HTTPException(404, "no version dir")
        version = vers[-1]
    target = slug_dir / version
    if not target.exists(): raise HTTPException(404, "target version not found")
    result = grep_rules(target)
    (target / "scan.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return {"slug": slug, "version": version, **result}

@APP.delete("/plugins/{slug}/{version}")
def delete_version(slug: str, version: str):
    target = STORE_ROOT / slug / version
    if not target.exists():
        raise HTTPException(404, "version not found")
    shutil.rmtree(target, ignore_errors=True)
    slug_root = STORE_ROOT / slug
    with contextlib.suppress(Exception):
        if slug_root.exists() and not any(slug_root.iterdir()):
            slug_root.rmdir()
    return {"status": "deleted", "slug": slug, "version": version}


@APP.delete("/plugins/{slug}")
def delete_slug(slug: str):
    target = STORE_ROOT / slug
    if not target.exists():
        raise HTTPException(404, "slug not found")
    shutil.rmtree(target, ignore_errors=True)
    return {"status": "deleted", "slug": slug}



def pick_icon(p: Dict) -> Optional[str]:
    # WP.org query_plugins returns { icons: {svg, 2x, 1x, default} }
    icons = p.get("icons") or {}
    if isinstance(icons, dict):
        return icons.get("svg") or icons.get("2x") or icons.get("1x") or icons.get("default")
    return None

@APP.get("/popular")
def popular(page: int = 1, per_page: int = 24, lang: Optional[str] = None):
    page_safe = max(1, min(page, MAX_PAGES))
    res = API.browse("popular", page=page_safe, per_page=per_page, locale=to_locale(lang))
    plugins = []
    for p in res.get("plugins", []):
        plugins.append({
            "slug": p.get("slug"),
            "name": p.get("name"),
            "short_description": p.get("short_description"),
            "active_installs": p.get("active_installs"),
            "icon": pick_icon(p),
        })
    info = res.get("info", {}) or {}
    pages_server = info.get("pages", 1) or 1
    pages_out = min(int(pages_server), MAX_PAGES)
    return {"plugins": plugins, "info": {"page": page_safe, "pages": pages_out}}


@APP.get("/search")
def search(q: str = Query(..., min_length=1),
           page: int = Query(1, ge=1), per_page: int = Query(24, ge=1, le=50),
           lang: Optional[str] = None):
    page_safe = max(1, min(page, MAX_PAGES))
    res = API.search(q, page=page_safe, per_page=per_page, locale=to_locale(lang))
    plugins = []
    for p in res.get("plugins", []):
        plugins.append({
            "slug": p.get("slug"),
            "name": p.get("name"),
            "short_description": p.get("short_description"),
            "active_installs": p.get("active_installs"),
            "icon": pick_icon(p),
        })
    info = res.get("info", {}) or {}
    pages_server = info.get("pages", 1) or 1
    pages_out = min(int(pages_server), MAX_PAGES)
    return {"plugins": plugins, "info": {"page": page_safe, "pages": pages_out}}

# ----- 코드 뷰어: 트리 & 파일 조회 -----

TEXT_EXTS = {
    "php","phpt","phtml","inc",
    "js","jsx","ts","tsx",
    "css","scss","less",
    "md","markdown","txt","html","htm",
    "json","xml","yml","yaml","ini","conf","cfg","htaccess","pot","po"
}

def _version_root(slug: str, version: str) -> Path:
    root = STORE_ROOT / slug / version
    if not root.exists():
        raise HTTPException(404, "target version not found")
    return root

def _resolve_in(root: Path, rel: str) -> Path:
    rel = rel.lstrip("/").replace("\\", "/")
    target = (root / rel).resolve()
    if not str(target).startswith(str(root.resolve())):
        raise HTTPException(400, "invalid path")
    return target

@APP.get("/plugins/{slug}/{version}/tree")
def get_tree(slug: str, version: str, path: str = ""):
    root = _version_root(slug, version)
    target = _resolve_in(root, path)
    if not target.exists():
        raise HTTPException(404, "path not found")
    if target.is_file():
        # 파일이면 해당 파일이 있는 디렉터리의 목록을 리턴
        target = target.parent
    entries = []
    for p in sorted(target.iterdir(), key=lambda x: (x.is_file(), x.name.lower())):
        try:
            entries.append({
                "name": p.name,
                "type": "dir" if p.is_dir() else "file",
                "size": (p.stat().st_size if p.is_file() else None),
                "path": str(p.relative_to(root)).replace("\\", "/"),
            })
        except Exception:
            continue
    return {
        "cwd": str(target.relative_to(root)).replace("\\", "/") if target != root else "",
        "entries": entries
    }

@APP.get("/plugins/{slug}/{version}/file")
def get_file(slug: str, version: str, path: str):
    if not path:
        raise HTTPException(400, "path is required")
    root = _version_root(slug, version)
    target = _resolve_in(root, path)
    if not target.exists() or not target.is_file():
        raise HTTPException(404, "file not found")
    ext = target.suffix.lower().lstrip(".")
    size = target.stat().st_size
    if size > 1_500_000:  # 1.5MB 제한 (프론트 뷰어 보호)
        raise HTTPException(413, "file too large to preview")
    try:
        content = target.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        raise HTTPException(415, "unable to decode as text")
    name_lower = target.name.lower()
    is_markdown = (ext in {"md","markdown"}) or (name_lower in {"readme.md", "readme.txt"})
    return {
        "path": str(target.relative_to(root)).replace("\\", "/"),
        "size": size,
        "ext": ext,
        "is_markdown": is_markdown,
        "content": content,
    }

class TranslateReq(BaseModel):
    texts: List[str]
    target: str = "ko"

@APP.post("/translate")
def translate(req: TranslateReq):
    if not isinstance(req.texts, list) or len(req.texts) == 0:
        return {"translations": []}
    out = translate_batch(req.texts, req.target)
    return {"translations": out}