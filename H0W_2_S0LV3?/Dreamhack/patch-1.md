# 🩹 Patch-1

## Description

주어진 코드를 분석하고, 해당 코드에 존재하는 취약점들을 패치해보세요.
문제에 대한 자세한 설명은 /usage 페이지를 확인하여 보시기 바랍니다.
모든 패치가 완료되면 플래그를 획득할 수 있습니다.

## Background

### SSTI (Server-Side Template Injection)
- Occurs when user input is embedded into server-side templates without proper sanitization
- Common in Flask applications using `render_template_string()`
- Allows attackers to execute arbitrary code on the server

### IDOR (Insecure Direct Object Reference)
- Access control vulnerability allowing direct access to objects (database entries, files)
- **Prevention:** User identity-based access control, unique/unpredictable keys
- **Testing:** Create two accounts, analyze features, modify request parameters

### Database Cursor
Object that executes SQL queries and retrieves results from the database.

## Vulnerability Analysis

### 1. SSTI Vulnerability
**Vulnerable code:**
```python
if mode == 'html':
    template = '''Written by {userid}<h3>{title}</h3>
    <pre>{contents}</pre>
    '''.format(title=title, userid=userid, contents=contents)
    return render_template_string(template)
```

**Issue:** Uses `str.format()` with direct variable substitution, allowing template injection.

### 2. Hard-coded Secret Key
**Vulnerable code:**
```python
app = Flask(__name__)
app.secret_key = "Th1s_1s_V3ry_secret_key"
```

**Issue:** Predictable secret key compromises session security.

### 3. SQL Injection
**Vulnerable code:**
```python
@app.route('/api/login', methods=['POST'])
def login(): 
    userid = request.form.get('userid', '')
    password = request.form.get('password', '')
    if userid and password:
        ret = query_db(f"SELECT * FROM users where userid='{userid}' and password='{hashlib.sha256(password.encode()).hexdigest()}'", one=True)
```

**Issue:** Direct string interpolation allows SQL injection through `userid` parameter.

### 4. IDOR Vulnerability
**Vulnerable code:**
```python
@app.route('/api/memo/<int:idx>', methods=['PUT'])
def memoUpdate(idx):
    if not session.get('uid'):
        return jsonify(result="no login")
    
    ret = query_db('SELECT * FROM memo where idx=?', [idx,])[0]
    # Missing authorization check!
    userid = session.get('uid')
    title = request.form.get('title')
    contents = request.form.get('contents')
    
    if ret and title and contents:
        # Direct update without ownership verification
        cur.execute("UPDATE memo SET title=?, contents=? WHERE idx=?", (title, contents, idx))
```

**Issue:** No verification that the logged-in user owns the memo being updated.

## Secure Code Patches

### 1. SSTI/XSS Protection
```python
@app.route('/api/memo/<int:idx>', methods=['GET'])
def memoView(idx):
    mode = request.args.get('mode', 'json')
    ret = query_db("SELECT * FROM memo WHERE idx=?", [idx], one=True)

    if not ret:
        return jsonify(result="not found")

    userid = ret['userid']
    title = escape(ret['title'])    # HTML escape for XSS protection
    contents = escape(ret['contents'])  # HTML escape for XSS protection

    if mode == 'html':
        template = ''' Written by {{ userid }}<h3>{{ title }}</h3>
        <pre>{{ contents }}</pre>
        '''
        return render_template_string(template, userid=userid, title=title, contents=contents)
        # Uses Jinja2 template variables with proper context separation
    
    return jsonify(result="success", userid=userid, title=title, contents=contents)
```

**Fix:** 
- Uses Jinja2 templating syntax `{{ variable }}` 
- Separates data from template using context dictionary
- Applies HTML escaping to prevent XSS

### 2. Secure Secret Key
```python
app = Flask(__name__)
app.secret_key = os.urandom(32)  # Generate random 32-byte key
```

**Fix:** Uses cryptographically secure random key generation.

### 3. SQL Injection Prevention
```python
@app.route('/api/login', methods=['POST'])
def login():
    userid = request.form.get('userid', '')
    password = request.form.get('password', '')

    if userid and password:
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        ret = query_db("SELECT * FROM users WHERE userid = ? AND password = ?", 
                      (userid, password_hash), one=True)
        
        if ret:
            session['uid'] = ret['userid']
            return jsonify(result="success", userid=ret['userid'])

    return jsonify(result="fail")
```

**Fix:** Uses parameterized queries with `?` placeholders for safe parameter binding.

### 4. IDOR Protection
```python
@app.route('/api/memo/<int:idx>', methods=['PUT'])
def memoUpdate(idx):
    if not session.get('uid'):
        return jsonify(result="no login")

    userid = session.get('uid')
    ret = query_db('SELECT * FROM memo WHERE idx=?', [idx], one=True)

    if not ret:
        return jsonify(result="not found")

    dbuserid = ret['userid']
    if dbuserid != userid:  # Authorization check
        return jsonify(result="unauthorized") 

    title = request.form.get('title')
    contents = request.form.get('contents')

    if not title or not contents:
        return jsonify(result="invalid input")

    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE memo SET title=?, contents=? WHERE idx=?", (title, contents, idx))
    conn.commit()

    if cur.rowcount > 0:  # Verify update success
        return jsonify(result="success") 

    return jsonify(result="error")
```

**Fix:** 
- Verifies memo ownership before allowing updates
- Compares logged-in user with memo author
- Validates input parameters
- Confirms successful database update

## Complete Secure Implementation

```python
#!/usr/bin/python3
from flask import Flask, request, render_template_string, g, session, jsonify, escape
import sqlite3
import os, hashlib

app = Flask(__name__)
app.secret_key = os.urandom(32)

def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db_path = os.environ.get('DATABASE', 'database.db')
        db = g._database = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row
    return db

def query_db(query, args=(), one=False):
    cur = get_db().execute(query, args)
    rv = cur.fetchall()
    cur.close()
    return (rv[0] if rv else None) if one else rv

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

@app.route('/')
def index():
    return "api-server"

@app.route('/api/me')
def me():
    if session.get('uid'):
        return jsonify(userid=session['uid'])
    return jsonify(userid=None)

@app.route('/api/login', methods=['POST'])
def login():
    userid = request.form.get('userid', '')
    password = request.form.get('password', '')

    if userid and password:
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        ret = query_db("SELECT * FROM users WHERE userid = ? AND password = ?", 
                      (userid, password_hash), one=True)
        
        if ret:
            session['uid'] = ret['userid']
            return jsonify(result="success", userid=ret['userid'])

    return jsonify(result="fail")

@app.route('/api/logout')
def logout():
    session.pop('uid', None)
    return jsonify(result="success")

@app.route('/api/join', methods=['POST'])
def join():
    userid = request.form.get('userid', '')
    password = request.form.get('password', '')

    if userid and password:
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        conn = get_db()
        cur = conn.cursor()
        try:
            cur.execute("INSERT INTO users (userid, password) VALUES (?, ?)", (userid, password_hash))
            conn.commit()
            return jsonify(result="success")
        except sqlite3.IntegrityError:
            return jsonify(result="error", message="User ID already exists")

    return jsonify(result="error")

@app.route('/api/memo/add', methods=['PUT'])
def memoAdd():
    if not session.get('uid'):
        return jsonify(result="no login")

    userid = session.get('uid')
    title = request.form.get('title')
    contents = request.form.get('contents')

    if title and contents:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("INSERT INTO memo (userid, title, contents) VALUES (?, ?, ?)", 
                   (userid, title, contents))
        conn.commit()
        return jsonify(result="success", memoidx=cur.lastrowid)

    return jsonify(result="error")

@app.route('/api/memo/<int:idx>', methods=['GET'])
def memoView(idx):
    mode = request.args.get('mode', 'json')
    ret = query_db("SELECT * FROM memo WHERE idx=?", [idx], one=True)

    if not ret:
        return jsonify(result="not found")

    userid = ret['userid']
    title = escape(ret['title'])
    contents = escape(ret['contents'])

    if mode == 'html':
        template = ''' Written by {{ userid }}<h3>{{ title }}</h3>
        <pre>{{ contents }}</pre>
        '''
        return render_template_string(template, userid=userid, title=title, contents=contents)
    
    return jsonify(result="success", userid=userid, title=title, contents=contents)

@app.route('/api/memo/<int:idx>', methods=['PUT'])
def memoUpdate(idx):
    if not session.get('uid'):
        return jsonify(result="no login")

    userid = session.get('uid')
    ret = query_db('SELECT * FROM memo WHERE idx=?', [idx], one=True)

    if not ret:
        return jsonify(result="not found")

    dbuserid = ret['userid']
    if dbuserid != userid:
        return jsonify(result="unauthorized")

    title = request.form.get('title')
    contents = request.form.get('contents')

    if not title or not contents:
        return jsonify(result="invalid input")

    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE memo SET title=?, contents=? WHERE idx=?", (title, contents, idx))
    conn.commit()

    if cur.rowcount > 0:
        return jsonify(result="success")

    return jsonify(result="error")

if __name__ == '__main__':
    app.run(debug=True)
```

## Additional Security Enhancements

### Password Security Best Practices

**Current implementation:**
```python
password_hash = hashlib.sha256(password.encode()).hexdigest()
```

**Enhanced security with salt:**
```python
import os
salt = os.urandom(16)  # Generate random salt
password_hash = hashlib.sha256(salt + password.encode()).hexdigest()
```

**Benefits of salting:**
- **Rainbow Table Defense:** Pre-computed hash tables become useless
- **Unique hashes:** Same passwords produce different hashes
- **Key Stretching:** Multiple hash iterations slow down brute force attacks

**Advanced techniques:**
- **PBKDF2, bcrypt, scrypt:** Industry-standard key derivation functions
- **Cost factors:** Adjustable iteration counts for future-proofing

## Key Takeaways

**Vulnerability Patterns:**
- **SSTI:** User input directly embedded in templates
- **SQL Injection:** String concatenation in queries
- **IDOR:** Missing authorization checks
- **Hard-coded secrets:** Predictable cryptographic keys

**Security Principles:**
- **Input validation:** Escape/sanitize all user input
- **Parameterized queries:** Use placeholders for SQL parameters
- **Authorization checks:** Verify ownership before operations
- **Secure randomness:** Use cryptographically secure random generation
