"""博客管理工具 - FastAPI 后端
文章管理、回收站、图片资源库、站点设置、Git 发布与预览。
"""
import json
import os
import re
import shutil
import socket
import subprocess
from datetime import datetime
from pathlib import Path

import yaml
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ---------- 路径 ----------
BACKEND_DIR = Path(__file__).resolve().parent
TOOLS_DIR = BACKEND_DIR.parent
REPO_ROOT = TOOLS_DIR.parent
DOCS_DIR = REPO_ROOT / "docs"
POSTS_DIR = DOCS_DIR / "posts"
IMAGES_DIR = DOCS_DIR / "public" / "images"
INDEX_MD = DOCS_DIR / "index.md"
STATIC_DIR = TOOLS_DIR / "static"
FRONTEND_DIR = TOOLS_DIR / "frontend"
TRASH_DIR = TOOLS_DIR / "trash"
TRASH_POSTS_DIR = TRASH_DIR / "posts"
TRASH_IMAGES_DIR = TRASH_DIR / "images"

GIT_EXE = "git"
GIT_DIR_HINT = r"D:\Git\cmd"
PREVIEW_PORT = 5173

app = FastAPI(title="Blog Manager")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


@app.middleware("http")
async def disable_static_cache(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-store, max-age=0"
    return response


@app.get("/api/health")
def health_check():
    return {"ok": True}


def git_env():
    env = os.environ.copy()
    if GIT_DIR_HINT not in env.get("PATH", ""):
        env["PATH"] = GIT_DIR_HINT + ";" + env.get("PATH", "")
    return env


def run_git(args):
    try:
        p = subprocess.run(
            [GIT_EXE] + args, cwd=REPO_ROOT, env=git_env(),
            capture_output=True, text=True, timeout=120,
            encoding="utf-8", errors="replace",
        )
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except FileNotFoundError:
        return 1, "git 命令未找到，请确认 Git 已安装。"
    except subprocess.TimeoutExpired:
        return 1, "git 操作超时（120 秒）。"


def safe_name(filename: str) -> str:
    """仅允许文件名，阻止路径穿越。"""
    if not filename or Path(filename).name != filename or filename in {".", ".."}:
        raise HTTPException(400, "非法文件名")
    return filename


def slugify(name: str) -> str:
    name = name.strip().lower()
    name = re.sub(r"\s+", "-", name)
    name = re.sub(r"[^\w\-]", "", name, flags=re.ASCII)
    name = re.sub(r"-+", "-", name).strip("-")
    return name or f"post-{datetime.now():%Y%m%d-%H%M%S}"


def unique_path(directory: Path, filename: str) -> Path:
    """目标存在时添加时间戳，避免覆盖。"""
    dest = directory / filename
    if not dest.exists():
        return dest
    return directory / f"{datetime.now():%Y%m%d-%H%M%S}-{filename}"


# ---------- frontmatter ----------
def parse_post(path: Path):
    raw = path.read_text(encoding="utf-8")
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?", raw, re.DOTALL)
    if m:
        fm = yaml.safe_load(m.group(1)) or {}
        body = raw[m.end():]
    else:
        fm, body = {}, raw
    return fm, body


def serialize_post(fm: dict, body: str) -> str:
    fm_text = yaml.safe_dump(fm, allow_unicode=True, sort_keys=False, default_flow_style=False)
    return f"---\n{fm_text.strip()}\n---\n\n{body.lstrip()}"


def post_info(path: Path, trash_name: str | None = None):
    fm, _ = parse_post(path)
    return {
        "file": path.name,
        "trash_name": trash_name,
        "title": fm.get("title", path.stem),
        "description": fm.get("description", ""),
        "date": str(fm.get("date", "")),
        "tags": fm.get("tags", []) or [],
        "sticky": fm.get("sticky", 0) or 0,
        "author": fm.get("author", ""),
        "publish": fm.get("publish", True),
    }


def write_post(path: Path, fm: dict, body: str):
    path.write_text(serialize_post(fm, body), encoding="utf-8")


# ---------- 回收站（必须先于 /api/posts/{filename} 注册） ----------
@app.get("/api/posts/trash")
def trash_list():
    if not TRASH_POSTS_DIR.exists():
        return []
    items = [post_info(p, p.name) for p in TRASH_POSTS_DIR.glob("*.md")]
    items.sort(key=lambda x: x["trash_name"], reverse=True)
    return items


class TrashPayload(BaseModel):
    trash_name: str


@app.post("/api/posts/trash/restore")
def trash_restore(payload: TrashPayload):
    name = safe_name(payload.trash_name)
    src = TRASH_POSTS_DIR / name
    if not src.exists():
        raise HTTPException(404, "回收站文章不存在")
    original = name
    # 冲突时移动过来的文件名可能带时间戳前缀，恢复原文件名冲突则拒绝
    if (POSTS_DIR / original).exists():
        raise HTTPException(409, "已存在同名文章，请先重命名现有文章")
    POSTS_DIR.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(POSTS_DIR / original))
    return {"file": original, "message": "文章已恢复"}


@app.delete("/api/posts/trash/{filename}")
def trash_delete(filename: str):
    path = TRASH_POSTS_DIR / safe_name(filename)
    if not path.exists():
        raise HTTPException(404, "回收站文章不存在")
    path.unlink()
    return {"message": "已彻底删除"}


# ---------- 文章列表与编辑 ----------
@app.get("/api/posts")
def list_posts():
    if not POSTS_DIR.exists():
        return []
    items = [post_info(p) for p in POSTS_DIR.glob("*.md")]
    items.sort(key=lambda x: (int(x["sticky"]), x["date"]), reverse=True)
    return items


@app.get("/api/posts/{filename}")
def get_post(filename: str):
    path = POSTS_DIR / safe_name(filename)
    if not path.exists():
        raise HTTPException(404, "文章不存在")
    fm, body = parse_post(path)
    return {"file": filename, "frontmatter": fm, "body": body}


class PostPayload(BaseModel):
    title: str
    description: str = ""
    date: str = ""
    tags: list[str] = []
    sticky: int = 0
    author: str = "Deep Reflection（邃思）"
    publish: bool = True
    body: str = ""
    old_file: str | None = None
    file: str | None = None


@app.post("/api/posts")
def save_post(payload: PostPayload):
    title = payload.title.strip()
    if not title:
        raise HTTPException(400, "标题不能为空")
    filename = safe_name(payload.file or payload.old_file or (slugify(title) + ".md"))
    path = POSTS_DIR / filename
    if payload.old_file and payload.old_file != filename:
        old = POSTS_DIR / safe_name(payload.old_file)
        if old.exists():
            old.unlink()
    fm = {
        "title": title,
        "description": payload.description,
        "date": payload.date or datetime.now().strftime("%Y-%m-%d"),
    }
    if payload.tags:
        fm["tags"] = payload.tags
    if payload.sticky:
        fm["sticky"] = payload.sticky
    if payload.author:
        fm["author"] = payload.author
    if not payload.publish:
        fm["publish"] = False
    write_post(path, fm, payload.body)
    return {"file": filename, "message": "已保存"}


@app.post("/api/posts/import")
async def import_post(file: UploadFile = File(...)):
    """导入本地 Markdown；保留原有 frontmatter，同名时自动改名。"""
    original_name = Path(file.filename or "article.md").name
    if Path(original_name).suffix.lower() not in {".md", ".markdown"}:
        raise HTTPException(400, "请选择 .md 或 .markdown 文件")
    raw_bytes = await file.read()
    try:
        raw = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(400, "文件不是 UTF-8 编码，请先转换编码")

    match = re.match(r"^---\s*\n(.*?)\n---\s*\n?", raw, re.DOTALL)
    try:
        if match:
            fm = yaml.safe_load(match.group(1)) or {}
            body = raw[match.end():]
        else:
            fm, body = {}, raw
    except yaml.YAMLError as e:
        raise HTTPException(400, f"frontmatter 格式错误：{e}")
    fm.setdefault("title", Path(original_name).stem)
    fm.setdefault("date", datetime.now().strftime("%Y-%m-%d"))

    filename = safe_name(Path(original_name).stem + ".md")
    POSTS_DIR.mkdir(parents=True, exist_ok=True)
    dest = unique_path(POSTS_DIR, filename)
    write_post(dest, fm, body)
    return {"file": dest.name, "title": fm["title"], "message": "导入成功"}


@app.delete("/api/posts/{filename}")
def delete_post(filename: str):
    """删除不直接抹除，移入工具回收站。"""
    path = POSTS_DIR / safe_name(filename)
    if not path.exists():
        raise HTTPException(404, "文章不存在")
    TRASH_POSTS_DIR.mkdir(parents=True, exist_ok=True)
    dest = unique_path(TRASH_POSTS_DIR, filename)
    shutil.move(str(path), str(dest))
    return {"message": "已移入回收站", "trash_name": dest.name}


class PublishStatePayload(BaseModel):
    publish: bool


@app.post("/api/posts/{filename}/publish")
def set_publish_state(filename: str, payload: PublishStatePayload):
    path = POSTS_DIR / safe_name(filename)
    if not path.exists():
        raise HTTPException(404, "文章不存在")
    fm, body = parse_post(path)
    if payload.publish:
        fm.pop("publish", None)
    else:
        fm["publish"] = False
    write_post(path, fm, body)
    return {"publish": payload.publish, "message": "已发布" if payload.publish else "已转为草稿"}


@app.post("/api/posts/{filename}/sticky")
def set_sticky(filename: str, sticky: int = 1):
    path = POSTS_DIR / safe_name(filename)
    if not path.exists():
        raise HTTPException(404, "文章不存在")
    fm, body = parse_post(path)
    if sticky:
        fm["sticky"] = sticky
    else:
        fm.pop("sticky", None)
    write_post(path, fm, body)
    return {"sticky": fm.get("sticky", 0)}


class BulkPayload(BaseModel):
    files: list[str]
    action: str  # delete / add-tags / draft / publish / unpin
    tags: list[str] = []


@app.post("/api/posts/bulk")
def bulk_posts(payload: BulkPayload):
    if not payload.files:
        raise HTTPException(400, "未选择文章")
    results = []
    for raw_name in payload.files:
        filename = safe_name(raw_name)
        path = POSTS_DIR / filename
        if not path.exists():
            results.append({"file": filename, "ok": False, "message": "不存在"})
            continue
        if payload.action == "delete":
            TRASH_POSTS_DIR.mkdir(parents=True, exist_ok=True)
            dest = unique_path(TRASH_POSTS_DIR, filename)
            shutil.move(str(path), str(dest))
            results.append({"file": filename, "ok": True, "message": "已移入回收站"})
            continue
        fm, body = parse_post(path)
        if payload.action == "add-tags":
            fm["tags"] = list(dict.fromkeys((fm.get("tags") or []) + payload.tags))
        elif payload.action == "draft":
            fm["publish"] = False
        elif payload.action == "publish":
            fm.pop("publish", None)
        elif payload.action == "unpin":
            fm.pop("sticky", None)
        else:
            raise HTTPException(400, "不支持的批量操作")
        write_post(path, fm, body)
        results.append({"file": filename, "ok": True, "message": "已更新"})
    return {"results": results}


# ---------- 站点设置 ----------
@app.get("/api/settings/home")
def get_home_settings():
    raw = INDEX_MD.read_text(encoding="utf-8")
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n?", raw, re.DOTALL)
    data = yaml.safe_load(m.group(1)) if m else {}
    return (data or {}).get("blog", {})


class HomeSettings(BaseModel):
    name: str = "Deep Reflection（邃思）"
    motto: str = ""
    inspiring: list[str] = []
    inspiringTimeout: int = 3500
    pageSize: int = 6


@app.post("/api/settings/home")
def save_home_settings(s: HomeSettings):
    inspiring_text = ''.join(f"  - '{line}'\n" for line in s.inspiring)
    content = f"""---
layout: home
blog:
 name: '{s.name}'
 motto: '{s.motto}'
 inspiring:
{inspiring_text}
 inspiringTimeout: {s.inspiringTimeout}
 pageSize: {s.pageSize}
---
"""
    INDEX_MD.write_text(content, encoding="utf-8")
    return {"message": "首页设置已保存"}


# ---------- 图片资源库 ----------
def image_references(filename: str):
    refs = []
    needle = f"/images/{filename}"
    for md in DOCS_DIR.rglob("*.md"):
        if ".vitepress" in md.parts:
            continue
        try:
            if needle in md.read_text(encoding="utf-8"):
                refs.append(str(md.relative_to(DOCS_DIR)).replace("\\", "/"))
        except UnicodeDecodeError:
            pass
    return refs


@app.get("/api/images")
def list_images():
    if not IMAGES_DIR.exists():
        return []
    allowed = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"}
    items = []
    for p in IMAGES_DIR.iterdir():
        if p.is_file() and p.suffix.lower() in allowed:
            stat = p.stat()
            items.append({
                "name": p.name, "path": f"/images/{p.name}",
                "markdown": f"![{p.stem}](/images/{p.name})",
                "size": stat.st_size,
                "modified": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
                "used_by": image_references(p.name),
            })
    items.sort(key=lambda x: x["modified"], reverse=True)
    return items


@app.post("/api/images")
async def upload_image(file: UploadFile = File(...)):
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename).suffix.lower() or ".png"
    stem = re.sub(r"[^\w\-]", "", Path(file.filename).stem) or "img"
    name = f"{datetime.now():%Y%m%d-%H%M%S}-{stem}{ext}"
    dest = unique_path(IMAGES_DIR, name)
    name = dest.name
    dest.write_bytes(await file.read())
    return {"path": f"/images/{name}", "markdown": f"![{stem}](/images/{name})"}


@app.delete("/api/images/{filename}")
def delete_image(filename: str):
    path = IMAGES_DIR / safe_name(filename)
    if not path.exists():
        raise HTTPException(404, "图片不存在")
    refs = image_references(filename)
    if refs:
        raise HTTPException(409, detail={"message": "图片仍被文章引用，不能删除", "used_by": refs})
    TRASH_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    dest = unique_path(TRASH_IMAGES_DIR, filename)
    shutil.move(str(path), str(dest))
    return {"message": "图片已移入回收站", "trash_name": dest.name}


# ---------- 本地预览 ----------
class PreviewStatus(BaseModel):
    running: bool
    url: str


def port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        return s.connect_ex(("127.0.0.1", port)) == 0


@app.get("/api/preview")
def preview_status():
    return PreviewStatus(running=port_open(PREVIEW_PORT), url=f"http://localhost:{PREVIEW_PORT}/")


@app.post("/api/preview/start")
def preview_start():
    if port_open(PREVIEW_PORT):
        return PreviewStatus(running=True, url=f"http://localhost:{PREVIEW_PORT}/")
    subprocess.Popen(
        ["npm", "run", "dev"], cwd=REPO_ROOT, env=git_env(),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS,
    )
    return PreviewStatus(running=True, url=f"http://localhost:{PREVIEW_PORT}/")


@app.post("/api/preview/stop")
def preview_stop():
    try:
        subprocess.run(
            ["powershell", "-Command",
             f"Get-NetTCPConnection -LocalPort {PREVIEW_PORT} -State Listen -ErrorAction SilentlyContinue | ForEach-Object {{ Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }}"],
            capture_output=True, timeout=30,
        )
    except Exception:
        pass
    return {"running": False}


# ---------- Git 发布 ----------
@app.get("/api/git/status")
def git_status():
    code, out = run_git(["status", "--short"])
    if code != 0:
        return {"ok": False, "detail": out}
    changes = []
    for line in out.splitlines():
        if len(line) < 4:
            continue
        xy, path = line[:2], line[3:]
        kind = "新增" if "?" in xy or "A" in xy else "删除" if "D" in xy else "修改"
        changes.append({"kind": kind, "path": path, "raw": line})
    return {"ok": True, "changed": changes}


class PublishPayload(BaseModel):
    message: str = "更新文章"


@app.post("/api/git/publish")
def git_publish(payload: PublishPayload):
    log = []

    def step(args, name):
        code, out = run_git(args)
        log.append({"step": name, "cmd": "git " + " ".join(args), "ok": code == 0, "output": out.strip()})
        if code != 0:
            raise HTTPException(500, detail={"failed_step": name, "log": log})

    step(["add", "-A"], "暂存更改")
    code, _ = run_git(["diff", "--cached", "--quiet"])
    if code == 1:
        step(["commit", "-m", payload.message], "提交")
    elif code == 0:
        log.append({
            "step": "检查更改", "cmd": "git diff --cached --quiet",
            "ok": True, "output": "没有新内容，跳过提交",
        })
    else:
        raise HTTPException(500, detail={
            "failed_step": "检查更改",
            "log": log + [{"step": "检查更改", "ok": False, "output": "无法检查暂存区"}],
        })
    step(["push"], "推送到 GitHub")
    return {"message": "已推送，GitHub Actions 正在构建部署", "log": log}


@app.get("/api/git/deploy-status")
def deploy_status():
    """用线上部署标记验证 Pages 是否已切换到当前提交，避免依赖被阻断的 GitHub API。"""
    import time
    import urllib.error
    import urllib.request

    code, out = run_git(["rev-parse", "HEAD"])
    if code != 0:
        return {"error": "无法读取本地提交版本"}
    local_commit = out.strip()
    version_url = f"https://myp-super.github.io/deploy-version.json?sha={local_commit}&t={int(time.time())}"
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    request = urllib.request.Request(
        version_url,
        headers={"Cache-Control": "no-cache", "Pragma": "no-cache"},
    )
    try:
        with opener.open(request, timeout=12) as resp:
            deployed = json.loads(resp.read().decode("utf-8"))
        remote_commit = str(deployed.get("commit", ""))
        if remote_commit == local_commit:
            return {
                "name": "GitHub Pages",
                "status": "completed",
                "conclusion": "success",
                "url": "https://myp-super.github.io",
                "created_at": datetime.now().astimezone().isoformat(),
                "message": "线上已更新为当前版本",
            }
        return {
            "name": "GitHub Pages",
            "status": "in_progress",
            "conclusion": None,
            "url": "https://myp-super.github.io",
            "created_at": datetime.now().astimezone().isoformat(),
            "message": f"正在部署：线上仍是 {remote_commit[:8] or '旧版本'}，等待 {local_commit[:8]}",
        }
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {
                "name": "GitHub Pages",
                "status": "in_progress",
                "conclusion": None,
                "url": "https://myp-super.github.io",
                "created_at": datetime.now().astimezone().isoformat(),
                "message": "正在等待 GitHub Pages 生成新版本标记",
            }
        return {"error": f"博客站点返回 HTTP {e.code}"}
    except Exception:
        return {"error": "无法连接博客站点，请检查网络后重试"}


# ---------- 前端托管 ----------
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/images", StaticFiles(directory=IMAGES_DIR, check_dir=False), name="images")


@app.get("/")
def serve_index():
    return FileResponse(FRONTEND_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="warning")
