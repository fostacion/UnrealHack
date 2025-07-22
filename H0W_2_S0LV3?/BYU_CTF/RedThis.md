# 🚨 RedThis

---

## 🧪 Challenge Setup

```bash
docker-compose up -d
```

---

## 🧾 Description

A web application backed by Redis. Let’s explore how key-based access leads to an auth bypass and flag leakage.

---

## 📚 Background

- Redis `GET <key>`: retrieves the value stored at the specified key.
- See more: [Redis DBMS](https://www.notion.so/Redis-DBMS-1cfbdeddcfd880969f80c5606907e886?pvs=21)

---

## 🔍 Source Code Overview (`app.py`)

### Highlights

- Redis server at `redthis-redis:6379`
- No password set
- User passwords saved with predictable pattern: `<username>_password`
- Flags stored under `flag_...` keys
- Admin-specific options fetched via `db.json().get("admin_options", "$")[0]`

---

### 🔑 `get_quote` endpoint

```python
@app.route('/get_quote', methods=['POST'])
def getQuote():
    username = flask.session.get('username')
    person = flask.request.form.get('famous_person')
    quote = [person, '']
    if "flag" in person and username != "admin":
        quote[1] = "Nope"
    else:
        quote[1] = getData(person)
    adminOptions = getAdminOptions(username)
    return flask.render_template('index.html', adminOptions=adminOptions, quote=quote)
```

---

## ⚠️ Vulnerability Analysis

- 🔓 **Key Enumeration** – Redis leaks any value if the key is known
- 🔍 **Predictable Password Keys** – Passwords are saved using format: `username_password`
- ❌ **Weak Authz** – Only `"flag"` keyword is blocked from non-admins
- 🔐 **No Redis Auth** – Unauthenticated Redis access from the backend

---

## 🧨 Exploit Steps

### 1. Discover admin account

Try submitting `"admin"` in the `famous_person` field:
```plaintext
Result → "User"
```

### 2. Dump admin password

Submit `"admin_password"` via `/get_quote`, leak stored value:
```plaintext
Result → <admin_password>
```

### 3. Login as admin

POST to `/login` with:
```
username = admin
password = <leaked_password>
```

### 4. View flag

Once logged in as admin, submit the `flag_...` keys via `/get_quote`:

---

## 🧠 Key Takeaways

- 🧱 NoSQL like Redis is vulnerable if not properly secured
- 🔐 Lack of authentication and improper access control leads to full compromise
- 🔎 Even internal-only services need auth, key hygiene, and validation
